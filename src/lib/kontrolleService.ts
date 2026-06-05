import { prisma } from "@/lib/prisma";
import { sendMail, escHtml } from "@/lib/mail";
import { formatDateTime } from "@/lib/utils";
import { sendPushToUser } from "@/lib/push";
import type { ServiceResult } from "@/lib/serviceResult";

export interface RequestKontrolleParams {
  userId: string;
  kommentar?: string | null;
  /** Deadline in hours (default 4). */
  deadlineH?: number | null;
}

/**
 * Requests an inspection (KontrollAnforderung): generates a 5-digit code (or reuses the active
 * seal code), sets a deadline, withdraws any open request, and e-mails + pushes the user.
 * Shared by POST /api/admin/kontrolle and the MCP write tool. User must be currently locked.
 */
export async function requestKontrolle(
  params: RequestKontrolleParams,
): Promise<ServiceResult<{ code: string; deadline: string }>> {
  const { userId, kommentar, deadlineH } = params;
  if (!userId) return { ok: false, status: 400, error: "userId fehlt" };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, status: 404, error: "User nicht gefunden" };
  if (!user.email) return { ok: false, status: 400, error: "User hat keine E-Mail-Adresse" };

  const kommentarTrimmed = typeof kommentar === "string" ? kommentar.trim() : null;
  const hours = typeof deadlineH === "number" && deadlineH > 0 ? deadlineH : 4;
  const deadline = new Date(Date.now() + hours * 60 * 60 * 1000);

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
      return { ok: false, status: 400, error: "User ist nicht verschlossen" };
    }
    throw e;
  }

  const kommentarHtml = kommentarTrimmed
    ? '<div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:14px 18px;margin:16px 0"><p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;color:#713f12">Anweisung des Admins:</p><p style="margin:0;font-size:15px;color:#422006">' + escHtml(kommentarTrimmed) + '</p></div>'
    : "";

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const kommentarParam = kommentarTrimmed ? `&kommentar=${encodeURIComponent(kommentarTrimmed)}` : "";
  const link = `${baseUrl}/dashboard/new/pruefung?code=${code}${kommentarParam}`;
  const deadlineStr = formatDateTime(deadline);
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
    `,
  );

  sendPushToUser(
    userId,
    "Kontrolle erforderlich",
    kommentarTrimmed ? `Code: ${code} · Frist: ${deadlineStr} · ${kommentarTrimmed}` : `Code: ${code} · Frist: ${deadlineStr}`,
    `/dashboard/new/pruefung?code=${code}`,
  ).catch(() => { /* ignore push errors */ });

  return { ok: true, data: { code, deadline: deadline.toISOString() } };
}
