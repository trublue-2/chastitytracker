import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { requireAdminApi } from "@/lib/authGuards";
import { APP_TZ } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";

export async function POST(req: NextRequest) {
  try {
  const err = await requireAdminApi();
  if (err) return err;

  const { userId, kommentar, deadlineH } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });
  if (!user.email) return NextResponse.json({ error: "User hat keine E-Mail-Adresse" }, { status: 400 });

  const kommentarTrimmed = typeof kommentar === "string" ? kommentar.trim() : null;
  const hours = typeof deadlineH === "number" && deadlineH > 0 ? deadlineH : 4;
  const deadline = new Date(Date.now() + hours * 60 * 60 * 1000);

  // Wrap state-check + withdraw + create in transaction to prevent TOCTOU race
  let code: string;
  let sealCode: string | null;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const latest = await tx.entry.findFirst({
        where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
        orderBy: { startTime: "desc" },
      });
      if (!latest || latest.type !== "VERSCHLUSS") {
        throw Object.assign(new Error(), { _code: "NOT_LOCKED" });
      }

      await tx.kontrollAnforderung.updateMany({
        where: { userId, entryId: null, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });

      const seal = latest.kontrollCode && /^\d{5,8}$/.test(latest.kontrollCode) ? latest.kontrollCode : null;
      const c = seal ?? String(Math.floor(10000 + Math.random() * 90000));

      await tx.kontrollAnforderung.create({
        data: { userId, code: c, deadline, kommentar: kommentarTrimmed || null },
      });

      return { code: c, sealCode: seal };
    });
    code = result.code;
    sealCode = result.sealCode;
  } catch (e: unknown) {
    if ((e as { _code?: string })?._code === "NOT_LOCKED") {
      return NextResponse.json({ error: "User ist nicht verschlossen" }, { status: 400 });
    }
    throw e;
  }

  const kommentarHtml = kommentarTrimmed
    ? '<div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Anweisung des Admins:</p><p style="margin:0;font-size:15px;color:#422006">' + escHtml(kommentarTrimmed) + '</p></div>'
    : "";

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const kommentarParam = kommentarTrimmed ? `&kommentar=${encodeURIComponent(kommentarTrimmed)}` : "";
  const link = `${baseUrl}/dashboard/new/pruefung?code=${code}${kommentarParam}`;
  const deadlineStr = deadline.toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: APP_TZ,
  });

  const codeLabel = sealCode
    ? "Deine Siegel-Nummer (muss auf dem Foto erkennbar sein):"
    : "Dein Kontroll-Code (muss auf dem Foto erkennbar sein):";

  await sendMail(
    user.email,
    "KG-Tracker – Kontrolle angefordert",
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1e293b">Kontrolle angefordert</h2>
      <p>Hallo ${escHtml(user.username)},</p>
      <p>Es wurde eine Kontrolle angefordert. Bitte erstelle innert der nächsten ${hours} Stunde${hours === 1 ? "" : "n"} einen Kontroll-Eintrag mit Foto.</p>
      ${kommentarHtml}
      <p><strong>${codeLabel}</strong></p>
      <div style="font-size:48px;font-weight:bold;letter-spacing:12px;color:#f97316;text-align:center;padding:24px;background:#fff7ed;border-radius:12px;margin:16px 0">${code}</div>
      <p><strong>Frist:</strong> ${deadlineStr}</p>
      <p>
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:bold">
          Kontrolle jetzt erfassen →
        </a>
      </p>
      <p style="color:#94a3b8;font-size:12px">Falls du den Link nicht öffnen kannst, gehe zu: ${link}</p>
    </div>
    `
  );

  // Notify user via push (fire-and-forget)
  sendPushToUser(
    userId,
    "Kontrolle angefordert",
    `Code: ${code} — Frist: ${deadlineStr}`,
    "/dashboard/new/pruefung"
  ).catch(() => { /* ignore push errors */ });

  return NextResponse.json({ ok: true, deadline: deadline.toISOString() });
  } catch (err) {
    console.error("[POST /api/admin/kontrolle]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
