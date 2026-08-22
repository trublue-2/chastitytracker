import { prisma } from "@/lib/prisma";
import { APP_TZ, nowDatetimeLocal } from "@/lib/utils";
import { getMobileDesktopMode } from "@/lib/queries";
import { activeWeighingWindow, nextWeighingWindow } from "@/lib/weightWindows";
import { lastWeightBefore } from "@/lib/weightService";
import type { UnitSystem } from "@/lib/weight";

/**
 * Was das Erfassungs-Formular an Server-Wissen braucht — für den Träger und für die Keyholderin
 * dieselbe Ableitung.
 *
 * Die Aufteilung ist der eigentliche Inhalt dieser Datei: **Einheit vom Erfassenden, alles andere
 * vom Träger.** Wer in Pfund denkt, tippt Pfund — auch wenn er für jemanden nachträgt, der in
 * Kilogramm wiegt. Grösse, letzte Messung und Zeitfenster gehören dagegen zum Träger; sie beschreiben
 * ihn, nicht den, der gerade auf den Knopf drückt. Ohne diese Trennung stünde in einer der beiden
 * Oberflächen die falsche Zahl, und beide Male fiele es erst beim Vergleich auf.
 */
export interface WeightFormProps {
  tz: string;
  nowDefault: string;
  unitSystem: UnitSystem;
  heightCm: number | null;
  lastWeightKg: number | null;
  mobileDesktopMode: boolean;
  /** Läuft gerade ein Wiege-Fenster? Dann sein Ende („08:00"). */
  windowActiveUntil: string | null;
  /** Sonst der Beginn des nächsten („18:00"). Beide null = keine Fensterpflicht. */
  windowNextFrom: string | null;
}

export async function getWeightFormProps(targetUserId: string, actorId: string): Promise<WeightFormProps | null> {
  const now = new Date();
  const [target, actor, mobileDesktopMode, lastWeightKg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { timezone: true, heightCm: true, weighingWindows: true, unitSystem: true },
    }),
    // Eigene Erfassung: der Träger IST der Erfassende — dann spart die Abfrage sich selbst.
    targetUserId === actorId
      ? Promise.resolve(null)
      : prisma.user.findUnique({ where: { id: actorId }, select: { unitSystem: true } }),
    getMobileDesktopMode(actorId),
    lastWeightBefore(targetUserId, now),
  ]);
  if (!target) return null;

  const tz = target.timezone || APP_TZ;
  const active = activeWeighingWindow(target.weighingWindows, now, tz);
  return {
    tz,
    // Die Vorgabe ist die Uhrzeit des TRÄGERS: er hat sich in seiner Wanduhrzeit gewogen, und der
    // Tagesschlüssel rechnet ebenfalls darin.
    nowDefault: nowDatetimeLocal(tz),
    unitSystem: ((actor ?? target).unitSystem as UnitSystem) ?? "metric",
    heightCm: target.heightCm,
    lastWeightKg,
    mobileDesktopMode,
    windowActiveUntil: active?.end ?? null,
    windowNextFrom: active ? null : (nextWeighingWindow(target.weighingWindows, now, tz)?.start ?? null),
  };
}
