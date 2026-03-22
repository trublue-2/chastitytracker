import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, art, nachricht, endetAt, dauerH } = await req.json();
    if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });
    if (art !== "ANFORDERUNG" && art !== "SPERRZEIT") {
      return NextResponse.json({ error: "art muss ANFORDERUNG oder SPERRZEIT sein" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });

    const latest = await prisma.entry.findFirst({
      where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    });
    const isLocked = latest?.type === "VERSCHLUSS";

    if (art === "ANFORDERUNG" && isLocked) {
      return NextResponse.json({ error: "User ist bereits verschlossen" }, { status: 400 });
    }
    if (art === "SPERRZEIT" && !isLocked) {
      return NextResponse.json({ error: "User ist nicht verschlossen" }, { status: 400 });
    }
    if (art === "ANFORDERUNG" && !user.email) {
      return NextResponse.json({ error: "User hat keine E-Mail-Adresse" }, { status: 400 });
    }

    // Bestehende offene Anforderungen gleicher Art zurückziehen
    await prisma.verschlussAnforderung.updateMany({
      where: { userId, art, fulfilledAt: null, withdrawnAt: null },
      data: { withdrawnAt: new Date() },
    });

    // endetAt berechnen: entweder direkt übergeben oder jetzt + dauerH
    let endetAtDate: Date | null = null;
    if (endetAt) {
      endetAtDate = new Date(endetAt);
    } else if (dauerH && art === "SPERRZEIT") {
      endetAtDate = new Date(Date.now() + dauerH * 60 * 60 * 1000);
    }

    const anforderung = await prisma.verschlussAnforderung.create({
      data: {
        userId,
        art,
        nachricht: nachricht?.trim() || null,
        endetAt: endetAtDate,
        dauerH: art === "ANFORDERUNG" ? (dauerH ?? null) : null,
      },
    });

    // E-Mail nur für ANFORDERUNG
    if (art === "ANFORDERUNG" && user.email) {
      const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const deadlineHtml = endetAtDate
        ? `<p><strong>Bitte einschliessen bis:</strong> ${endetAtDate.toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" })}</p>`
        : "";
      const dauerHtml = dauerH && !endetAt
        ? `<p><strong>Mindestdauer nach Einschliessen:</strong> ${dauerH >= 24 ? `${Math.floor(dauerH / 24)}T ${dauerH % 24 > 0 ? `${dauerH % 24}h` : ""}`.trim() : `${dauerH}h`}</p>`
        : "";
      const nachrichtHtml = nachricht?.trim()
        ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Nachricht des Admins:</p><p style="margin:0;font-size:15px;color:#422006">${nachricht.trim()}</p></div>`
        : "";

      await sendMail(
        user.email,
        "KG-Tracker – Einschliessen angefordert",
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e293b">Einschliessen angefordert</h2>
          <p>Hallo ${user.username},</p>
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

    return NextResponse.json({ ok: true, id: anforderung.id });
  } catch (err) {
    console.error("[POST /api/admin/verschluss-anforderung]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
