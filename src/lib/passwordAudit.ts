import { prisma } from "@/lib/prisma";
import { subsWithActiveSperrzeit } from "@/lib/queries";
import type { Prisma } from "@prisma/client";

/** Auf welchem Weg das Passwort gesetzt wurde. `reset_token` ist der Fall, um den es geht: Wer
 *  Zugriff auf das Postfach des Admin-Kontos hat, verschafft sich darüber neuen Zugang — beim
 *  Solo-Spieler mit KI-Keyholder ist das der Ausstieg aus der eigenen Bindung. */
export const PASSWORD_CHANGE_VIA = ["reset_token", "self", "set_by_other"] as const;
export type PasswordChangeVia = (typeof PASSWORD_CHANGE_VIA)[number];

/**
 * Baut die `AdminPasswordChange`-Zeilen für einen Passwortwechsel — oder eine leere Liste, wenn der
 * Fall nicht erfasst wird.
 *
 * Erfasst wird NUR: Ziel ist ein Admin-Konto UND für mindestens einen Sub läuft eine Sperrzeit.
 * Alles andere ist Alltag und bliebe als Rauschen im Strafbuch stehen.
 *
 * Gibt `Prisma.AdminPasswordChangeCreateManyInput[]` zurück, statt selbst zu schreiben, damit der
 * Aufrufer die Zeilen in seine eigene Transaktion legen kann. Beim Token-Weg ist genau das nötig:
 * Passwort setzen, Token löschen und den Nachweis schreiben müssen zusammen gelingen oder zusammen
 * scheitern — ein Reset ohne Nachweis wäre für dieses Feature wertlos.
 */
export async function buildAdminPasswordChangeRows(
  targetUserId: string,
  via: PasswordChangeVia,
  actorUserId: string | null,
): Promise<Prisma.AdminPasswordChangeCreateManyInput[]> {
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, role: true },
  });
  if (target?.role !== "admin") return [];

  const sperrzeiten = await subsWithActiveSperrzeit();
  // Der Admin selbst kann einen Sub-Eintrag haben (Admin trägt auch eigene Zeiten) — ein
  // Passwortwechsel am eigenen Konto während der EIGENEN Sperrzeit ist genau der gemeinte Fall
  // und wird deshalb nicht ausgenommen.
  return sperrzeiten.map((s) => ({
    subUserId: s.userId,
    adminUserId: target.id,
    adminUsername: target.username,
    via,
    actorUserId,
    sperrzeitId: s.id,
    sperrzeitEndetAt: s.endetAt,
  }));
}

/**
 * Variante für Aufrufer ohne eigene Transaktion: baut und schreibt in einem Zug.
 *
 * Bewusst fehlertolerant — ein fehlgeschlagener Nachweis darf keinen Passwortwechsel verhindern,
 * den der Nutzer legitim vornimmt (er säße sonst wegen einer Protokollzeile aus). Beim Token-Weg
 * gilt die umgekehrte Abwägung, dort wird `buildAdminPasswordChangeRows` in der Transaktion
 * verwendet.
 */
export async function recordAdminPasswordChange(
  targetUserId: string,
  via: PasswordChangeVia,
  actorUserId: string | null,
): Promise<void> {
  try {
    const rows = await buildAdminPasswordChangeRows(targetUserId, via, actorUserId);
    if (rows.length > 0) await prisma.adminPasswordChange.createMany({ data: rows });
  } catch {
    // Bewusst still: siehe Doc-Kommentar.
  }
}
