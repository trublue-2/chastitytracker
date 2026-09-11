import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApi } from "@/lib/authGuards";
import { isNotifyLevel, type SelfEditableUserField } from "@/lib/constants";
import { errorResponse } from "@/lib/serviceResult";

/**
 * Kanal → Spalte. Als `SelfEditableUserField` getypt, aus demselben Grund wie in
 * `userSelfFieldRoute`: ein Admin-Feld (`role`, `cleaningAllowed`) liesse sich hier nicht eintragen,
 * ohne dass der Compiler es meldet. Die Zuordnung steht EINMAL — der Client schickt den Kanal, nicht
 * den Spaltennamen.
 */
const COLUMN: Record<string, SelfEditableUserField> = {
  mail: "notifyMail",
  push: "notifyPush",
  telegram: "notifyTelegram",
};

/**
 * PATCH /api/settings/notify-levels — der Nutzer stellt ein, wie laut EINER seiner Kanäle sein darf
 * (`all` / `important` / `off`).
 *
 * Scope ist immer die Session: die Stufe gehört dem Empfänger. Sie gilt auch für Meldungen über
 * seine Träger — anders als das frühere Raster, das am Sub hing und von allen seinen Keyholdern
 * geteilt wurde. Die Wiege-Erinnerung behält ihren eigenen Schalter und läuft weiter über
 * `/api/settings/notifications`.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const { channel, level } = await req.json();
  // `Object.hasOwn` statt blossem Nachschlagen: `COLUMN["constructor"]` liefert sonst die geerbte
  // Funktion, und die landete als Spaltenname in der Abfrage — ein 500 statt eines 400. Dieselbe
  // Vorsicht wie bei `messagePriority`, aus demselben Grund: der Schlüssel kommt vom Client.
  const column = typeof channel === "string" && Object.hasOwn(COLUMN, channel) ? COLUMN[channel] : undefined;
  if (!column || !isNotifyLevel(level)) return errorResponse(400, "UNKNOWN_ACTION");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { [column]: level } as Prisma.UserUpdateInput,
  });
  return NextResponse.json({ ok: true });
}
