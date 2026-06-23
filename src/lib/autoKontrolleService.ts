import { prisma } from "@/lib/prisma";
import type { ServiceResult } from "@/lib/serviceResult";
import { midnightInTZ, clamp } from "@/lib/utils";
import { generateKontrollCode } from "@/lib/kontrolleService";

/**
 * Automatische Kontrollen: X zufällig verteilte Kontrollen pro Tag und Sub. Die FRIST darf nicht ins
 * Schlaf-Fenster (RuheVon–RuheBis, CH-Lokalzeit) fallen; die Erfüllungsdauer ist je Kontrolle zufällig
 * in [FristVon, FristBis] Minuten. Die Zeilen werden vorab als KontrollAnforderung mit Zukunfts-
 * `wirksamAb` angelegt; der bestehende Minuten-Poller verschickt sie bei Fälligkeit.
 */

export interface AutoKontrolleSettings {
  aktiv: boolean;
  proTag: number;
  ruheVon: string; // "HH:MM" Schlaf-Fenster Start
  ruheBis: string; // "HH:MM" Schlaf-Fenster Ende
  fristVon: number; // min Erfüllungsdauer (Min)
  fristBis: number; // max Erfüllungsdauer (Min)
}

export type SetAutoKontrolleParams = Partial<AutoKontrolleSettings>;

const PRO_TAG_RANGE = { min: 0, max: 12, fallback: 0 } as const;
const FRIST_RANGE = { min: 5, max: 240, fallback: 15 } as const;

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "HH:MM" → Minuten seit Mitternacht (0–1439). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Liegt die Uhrzeit (Minuten seit Mitternacht, evtl. >1440 = Folgetag) im Schlaf-Fenster? Wrap-aware:
 *  RuheVon > RuheBis (z.B. 22:00–06:00) überspannt Mitternacht. */
export function isInQuietMinutes(vonMin: number, bisMin: number, min: number): boolean {
  const m = ((min % 1440) + 1440) % 1440;
  if (vonMin === bisMin) return false; // leeres Fenster
  return vonMin < bisMin ? m >= vonMin && m < bisMin : m >= vonMin || m < bisMin;
}

/**
 * Erzeugt bis zu `proTag` Slots `{ wirksamAb, deadline }` für den heutigen CH-Tag. Das Wach-Fenster
 * (Komplement des Schlaf-Fensters) wird in proTag gleiche Segmente geteilt; je Segment liegen Trigger
 * UND Frist innerhalb des Segments → keine Überlappung, und die Frist liegt garantiert außerhalb des
 * Schlaf-Fensters. Nur Slots mit `wirksamAb > now` werden zurückgegeben (Teiltag bei Mittags-Start).
 * Reine Funktion (Zufall injizierbar für Tests).
 */
export function generateAutoKontrollen(
  settings: AutoKontrolleSettings,
  now: Date,
  rand: () => number = Math.random,
): { wirksamAb: Date; deadline: Date }[] {
  const x = clamp(settings.proTag, PRO_TAG_RANGE);
  if (x <= 0) return [];
  const fristVon = clamp(settings.fristVon, FRIST_RANGE);
  const fristBis = Math.max(fristVon, clamp(settings.fristBis, FRIST_RANGE));

  // Wach-Fenster als zusammenhängender Block [awakeStart, awakeEnd] in Minuten (awakeEnd evtl. >1440,
  // wenn das Wach-Fenster über Mitternacht reicht). Standard 22–06 → [360, 1320] = 06:00–22:00.
  const awakeStart = hhmmToMinutes(settings.ruheBis);
  let awakeEnd = hhmmToMinutes(settings.ruheVon);
  if (awakeEnd <= awakeStart) awakeEnd += 1440;
  const span = awakeEnd - awakeStart;
  if (span <= 0) return [];

  const dayBaseMs = midnightInTZ(now).getTime();
  const segSize = span / x;
  const out: { wirksamAb: Date; deadline: Date }[] = [];

  // In GANZZAHL-Minuten rechnen (keine Float-/Rundungs-Kanten). Trigger UND Frist bleiben im Segment
  // → keine Überlappung; die Frist wird strikt VOR awakeEnd (= Schlaf-Start) gekappt → nie im Schlaf.
  for (let i = 0; i < x; i++) {
    const segStart = awakeStart + i * segSize;
    const segEnd = awakeStart + (i + 1) * segSize;
    const dur = Math.min(fristVon + Math.floor(rand() * (fristBis - fristVon + 1)), Math.max(1, Math.floor(segSize)));
    const triggerMin = Math.ceil(segStart);
    const triggerMax = Math.min(Math.floor(segEnd - dur), awakeEnd - 1 - dur); // Frist ≤ awakeEnd−1
    if (triggerMax < triggerMin) continue; // Segment zu klein → überspringen
    const trig = triggerMin + Math.floor(rand() * (triggerMax - triggerMin + 1));
    const wirksamAb = new Date(dayBaseMs + trig * 60_000);
    const deadline = new Date(dayBaseMs + (trig + dur) * 60_000);
    if (wirksamAb.getTime() > now.getTime()) out.push({ wirksamAb, deadline });
  }
  return out;
}

/** Liest die Auto-Kontroll-Settings aus einer User-Zeile. */
export function autoKontrolleSettingsFromUser(u: {
  autoKontrolleAktiv: boolean; autoKontrolleProTag: number;
  autoKontrolleRuheVon: string; autoKontrolleRuheBis: string;
  autoKontrolleFristVon: number; autoKontrolleFristBis: number;
}): AutoKontrolleSettings {
  return {
    aktiv: u.autoKontrolleAktiv,
    proTag: u.autoKontrolleProTag,
    ruheVon: u.autoKontrolleRuheVon,
    ruheBis: u.autoKontrolleRuheBis,
    fristVon: u.autoKontrolleFristVon,
    fristBis: u.autoKontrolleFristBis,
  };
}

const AUTO_USER_SELECT = {
  id: true, autoKontrolleAktiv: true, autoKontrolleProTag: true,
  autoKontrolleRuheVon: true, autoKontrolleRuheBis: true,
  autoKontrolleFristVon: true, autoKontrolleFristBis: true,
} as const;

/** Legt Auto-Kontroll-Zeilen für die gegebenen Slots an (frischer Code je Zeile, benachrichtigtAt=null). */
async function createAutoKontrollen(userId: string, slots: { wirksamAb: Date; deadline: Date }[]): Promise<number> {
  if (slots.length === 0) return 0;
  await prisma.kontrollAnforderung.createMany({
    data: slots.map((s) => ({
      userId, code: generateKontrollCode(), deadline: s.deadline, wirksamAb: s.wirksamAb,
      benachrichtigtAt: null, auto: true,
    })),
  });
  return slots.length;
}

/** Legt die heutigen Auto-Kontrollen für EINEN User an — idempotent: existieren schon heute (CH-Tag)
 *  angelegte Auto-Zeilen, passiert nichts. (Vom Poller, einmal pro Tag.) */
export async function ensureDailyAutoKontrollenForUser(
  userId: string, settings: AutoKontrolleSettings, now: Date,
): Promise<number> {
  if (!settings.aktiv || settings.proTag <= 0) return 0;
  const already = await prisma.kontrollAnforderung.count({
    where: { userId, auto: true, createdAt: { gte: midnightInTZ(now) } },
  });
  if (already > 0) return 0;
  return createAutoKontrollen(userId, generateAutoKontrollen(settings, now));
}

/** Plant die Auto-Kontrollen für den LAUFENDEN Tag neu (für sofort wirksame Settings-Änderungen): noch
 *  nicht versendete Auto-Zeilen von heute verwerfen und die Resttag-Slots nach den neuen Settings anlegen.
 *  Bereits versendete Kontrollen bleiben unberührt; Deaktivieren entfernt nur die noch offenen. */
export async function replanTodayAutoKontrollenForUser(
  userId: string, settings: AutoKontrolleSettings, now: Date,
): Promise<number> {
  // Noch nicht versendete (und nicht zurückgezogene) Auto-Zeilen von heute löschen — sie waren nie sichtbar.
  await prisma.kontrollAnforderung.deleteMany({
    where: { userId, auto: true, benachrichtigtAt: null, withdrawnAt: null, createdAt: { gte: midnightInTZ(now) } },
  });
  if (!settings.aktiv || settings.proTag <= 0) return 0;
  return createAutoKontrollen(userId, generateAutoKontrollen(settings, now));
}

/** Legt die heutigen Auto-Kontrollen für ALLE aktiven User an (vom Poller, einmal pro CH-Tag). */
export async function ensureDailyAutoKontrollen(now: Date): Promise<void> {
  const users = await prisma.user.findMany({ where: { autoKontrolleAktiv: true }, select: AUTO_USER_SELECT });
  for (const u of users) {
    try {
      await ensureDailyAutoKontrollenForUser(u.id, autoKontrolleSettingsFromUser(u), now);
    } catch (e) {
      console.error(`[autoKontrolle] Tagesplanung fehlgeschlagen (${u.id}):`, (e as Error).message);
    }
  }
}

/** Speichert die Auto-Kontroll-Settings eines Users (nur übergebene Felder; Zahlen geklemmt, HH:MM
 *  validiert, FristBis ≥ FristVon). Geteilt von PATCH /api/admin/users/[id]. */
export async function setAutoKontrolleSettings(userId: string, params: SetAutoKontrolleParams): Promise<ServiceResult<null>> {
  const data: {
    autoKontrolleAktiv?: boolean; autoKontrolleProTag?: number;
    autoKontrolleRuheVon?: string; autoKontrolleRuheBis?: string;
    autoKontrolleFristVon?: number; autoKontrolleFristBis?: number;
  } = {};

  if (params.aktiv !== undefined) data.autoKontrolleAktiv = Boolean(params.aktiv);
  if (params.proTag !== undefined) data.autoKontrolleProTag = clamp(params.proTag, PRO_TAG_RANGE);
  if (params.ruheVon !== undefined && HHMM.test(params.ruheVon)) data.autoKontrolleRuheVon = params.ruheVon;
  if (params.ruheBis !== undefined && HHMM.test(params.ruheBis)) data.autoKontrolleRuheBis = params.ruheBis;
  if (params.fristVon !== undefined) data.autoKontrolleFristVon = clamp(params.fristVon, FRIST_RANGE);
  if (params.fristBis !== undefined) data.autoKontrolleFristBis = clamp(params.fristBis, FRIST_RANGE);
  // FristBis ≥ FristVon sicherstellen, wenn beide bekannt (oder einer geändert wird).
  if (data.autoKontrolleFristVon !== undefined && data.autoKontrolleFristBis !== undefined && data.autoKontrolleFristBis < data.autoKontrolleFristVon) {
    data.autoKontrolleFristBis = data.autoKontrolleFristVon;
  }

  if (Object.keys(data).length === 0) return { ok: false, status: 400, error: "Keine Felder zum Aktualisieren" };
  const user = await prisma.user.update({ where: { id: userId }, data, select: AUTO_USER_SELECT });

  // Änderung sofort auf den laufenden Tag anwenden (mit den neuen, effektiven Settings neu planen).
  await replanTodayAutoKontrollenForUser(userId, autoKontrolleSettingsFromUser(user), new Date())
    .catch((e) => console.error(`[autoKontrolle] Replan nach Settings-Änderung fehlgeschlagen (${userId}):`, (e as Error).message));
  return { ok: true, data: null };
}
