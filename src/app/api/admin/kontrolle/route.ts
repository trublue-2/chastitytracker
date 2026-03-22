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

  const { userId, kommentar, deadlineH } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User nicht gefunden" }, { status: 404 });
  if (!user.email) return NextResponse.json({ error: "User hat keine E-Mail-Adresse" }, { status: 400 });

  // Prüfen ob User verschlossen ist
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
  });
  if (!latest || latest.type !== "VERSCHLUSS") {
    return NextResponse.json({ error: "User ist nicht verschlossen" }, { status: 400 });
  }

  // Offene Anforderungen zurückziehen (nicht löschen, um Historie zu bewahren)
  await prisma.kontrollAnforderung.updateMany({
    where: { userId, entryId: null, withdrawnAt: null },
    data: { withdrawnAt: new Date() },
  });

  // Neue Anforderung erstellen
  const code = String(Math.floor(10000 + Math.random() * 90000));
  const hours = typeof deadlineH === "number" && deadlineH > 0 ? deadlineH : 4;
  const deadline = new Date(Date.now() + hours * 60 * 60 * 1000);

  const kommentarTrimmed = typeof kommentar === "string" ? kommentar.trim() : null;
  const kommentarHtml = kommentarTrimmed
    ? '<div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Anweisung des Admins:</p><p style="margin:0;font-size:15px;color:#422006">' + kommentarTrimmed + '</p></div>'
    : "";
  await prisma.kontrollAnforderung.create({
    data: { userId, code, deadline, kommentar: kommentarTrimmed || null },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const kommentarParam = kommentarTrimmed ? `&kommentar=${encodeURIComponent(kommentarTrimmed)}` : "";
  const link = `${baseUrl}/dashboard/new/pruefung?code=${code}${kommentarParam}`;
  const deadlineStr = deadline.toLocaleString("de-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich",
  });

  await sendMail(
    user.email,
    "KG-Tracker – Kontrolle angefordert",
    `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#1e293b">Kontrolle angefordert</h2>
      <p>Hallo ${user.username},</p>
      <p>Es wurde eine Kontrolle angefordert. Bitte erstelle innert der nächsten ${hours} Stunde${hours === 1 ? "" : "n"} einen Kontroll-Eintrag mit Foto.</p>
      ${kommentarHtml}
      <p><strong>Dein Kontroll-Code (muss auf dem Foto erkennbar sein):</strong></p>
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

  return NextResponse.json({ ok: true, deadline: deadline.toISOString() });
  } catch (err) {
    console.error("[POST /api/admin/kontrolle]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
