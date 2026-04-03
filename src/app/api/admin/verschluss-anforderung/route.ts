import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { requireAdminApi } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import { APP_TZ } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
    const err = await requireAdminApi();
    if (err) return err;

    const { userId, art, nachricht, endetAt, fristH, dauerH } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });
    if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
      return NextResponse.json({ error: "art muss ANFORDERUNG oder SPERRZEIT sein" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });

    if (art === "ANFORDERUNG" && !user.email) {
      return NextResponse.json({ error: "User hat keine E-Mail-Adresse" }, { status: 400 });
    }

    // endetAt berechnen (Frist zum Einschliessen / Sperrzeit-Ende)
    let endetAtDate: Date | null = null;
    if (endetAt) {
      endetAtDate = new Date(endetAt);
    } else if (fristH && art === "ANFORDERUNG") {
      // fristH = Frist in Stunden zum Einschliessen
      endetAtDate = new Date(Date.now() + fristH * 60 * 60 * 1000);
    } else if (fristH && art === "SPERRZEIT") {
      endetAtDate = new Date(Date.now() + fristH * 60 * 60 * 1000);
    }

    if (art === "ANFORDERUNG" && !endetAtDate) {
      return NextResponse.json({ error: "Frist zum Einschliessen ist erforderlich" }, { status: 400 });
    }

    // Wrap state-check + withdraw + create in transaction to prevent TOCTOU race
    let anforderung;
    try {
      anforderung = await prisma.$transaction(async (tx) => {
        const latest = await tx.entry.findFirst({
          where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
          orderBy: { startTime: "desc" },
        });
        const isLocked = latest?.type === "VERSCHLUSS";

        if (art === "ANFORDERUNG" && isLocked) throw Object.assign(new Error(), { _code: "ALREADY_LOCKED" });
        if (art === "SPERRZEIT" && !isLocked) throw Object.assign(new Error(), { _code: "NOT_LOCKED" });

        await tx.verschlussAnforderung.updateMany({
          where: { userId, art, fulfilledAt: null, withdrawnAt: null },
          data: { withdrawnAt: new Date() },
        });

        return tx.verschlussAnforderung.create({
          data: {
            userId,
            art,
            nachricht: nachricht?.trim() || null,
            endetAt: endetAtDate,
            dauerH: art === "ANFORDERUNG" ? (dauerH || null) : null,  // Mindest-Tragedauer (optional)
          },
        });
      });
    } catch (e: unknown) {
      const code = (e as { _code?: string })?._code;
      if (code === "ALREADY_LOCKED") return NextResponse.json({ error: "User ist bereits verschlossen" }, { status: 400 });
      if (code === "NOT_LOCKED") return NextResponse.json({ error: "User ist nicht verschlossen" }, { status: 400 });
      throw e;
    }

    // E-Mail nur für ANFORDERUNG
    if (art === "ANFORDERUNG" && user.email) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const deadlineHtml = endetAtDate
        ? `<p><strong>Bitte einschliessen bis:</strong> ${endetAtDate.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: APP_TZ })}</p>`
        : "";
      const dauerHtml = dauerH
        ? `<p><strong>Mindest-Tragedauer nach Einschliessen:</strong> ${dauerH >= 24 ? `${Math.floor(dauerH / 24)}T ${dauerH % 24 > 0 ? `${dauerH % 24}h` : ""}`.trim() : `${dauerH}h`}</p>`
        : "";
      const nachrichtHtml = nachricht?.trim()
        ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Nachricht des Admins:</p><p style="margin:0;font-size:15px;color:#422006">${escHtml(nachricht.trim())}</p></div>`
        : "";

      await sendMail(
        user.email,
        "KG-Tracker – Einschliessen angefordert",
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e293b">Einschliessen angefordert</h2>
          <p>Hallo ${escHtml(user.username)},</p>
          <p>Der Admin hat dich aufgefordert, dich einzuschliessen.</p>
          ${nachrichtHtml}
          ${deadlineHtml}
          ${dauerHtml}
          <p>
            <a href="${baseUrl}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
              Zum Dashboard →
            </a>
          </p>
        </div>
        `
      );
    }

    // Notify user via push (fire-and-forget)
    const pushTitle = art === "ANFORDERUNG" ? "Einschliessen angefordert" : "Sperrzeit gesetzt";
    const pushBody = nachricht?.trim() || (art === "ANFORDERUNG" ? "Der Admin fordert dich auf, dich einzuschliessen." : "Eine Sperrzeit wurde gesetzt.");
    sendPushToUser(userId, pushTitle, pushBody, "/dashboard").catch(() => { /* ignore push errors */ });

    return NextResponse.json({ ok: true, id: anforderung.id });
  } catch (err) {
    console.error("[POST /api/admin/verschluss-anforderung]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
