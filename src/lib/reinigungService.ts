import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { APP_TZ, midnightInTZ, clamp } from "@/lib/utils";
import { NO_FIELDS_TO_UPDATE } from "@/lib/constants";

export interface ReinigungsFenster {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface SetReinigungParams {
  /** Allow cleaning pauses (short opening without an entry). */
  erlaubt?: boolean;
  /** Max minutes per cleaning pause. */
  maxMinuten?: number;
  /** Max cleaning pauses per day (0 = unlimited). */
  maxProTag?: number;
  /** Daily cleaning windows; raw input, validated/normalised before storing. */
  fenster?: unknown;
}

/** Parst + validiert die Fenster-Liste aus User.reinigungsFenster (JSON-String ODER Array;
 *  tolerant: Murks → []). SQLite/Prisma 5 speichert das Feld als TEXT, daher String-Pfad. */
export function parseReinigungsFenster(raw: unknown): ReinigungsFenster[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: ReinigungsFenster[] = [];
  for (const f of arr) {
    const start = (f as { start?: unknown })?.start;
    const end = (f as { end?: unknown })?.end;
    if (
      typeof start === "string" && typeof end === "string" &&
      /^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end) && start < end
    ) {
      out.push({ start, end });
    }
  }
  return out;
}

/** „HH:MM" der aktuellen Uhrzeit in `tz` (default APP_TZ; 24h, fix mit ":" für lexikalischen Vergleich). */
function hhmmInTZ(now: Date, tz = APP_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
}

/** Liegt `now` (Sub-Lokalzeit `tz`, default APP_TZ) in einem Reinigungs-Fenster? Liefert dessen Ende „HH:MM", sonst null.
 *  Die Fenster sind Wanduhrzeit des Subs — deshalb muss `tz` die Sub-Zeitzone sein, nicht die des Betrachters. */
export function aktivesReinigungsFenster(raw: unknown, now: Date, tz = APP_TZ): string | null {
  const hhmm = hhmmInTZ(now, tz);
  for (const f of parseReinigungsFenster(raw)) {
    if (f.start <= hhmm && hhmm < f.end) return f.end;
  }
  return null;
}

/**
 * Das nächste Reinigungs-Fenster, das nach `now` (Sub-Lokalzeit `tz`) BEGINNT — sonst das früheste
 * des Tages (dann liegt es morgen). null, wenn keine Fenster konfiguriert sind (= nicht zeitgebunden).
 *
 * Läuft `now` gerade IN einem Fenster, liefert das trotzdem das darauffolgende: „aktuell offen"
 * beantwortet {@link aktivesReinigungsFenster}, hier geht es um „wann wieder".
 */
export function nextReinigungsFenster(raw: unknown, now: Date, tz = APP_TZ): ReinigungsFenster | null {
  const fenster = parseReinigungsFenster(raw);
  if (fenster.length === 0) return null;
  const hhmm = hhmmInTZ(now, tz);
  const sortiert = [...fenster].sort((a, b) => a.start.localeCompare(b.start));
  return sortiert.find((f) => f.start > hhmm) ?? sortiert[0];
}

/** Heute (Sub-Kalendertag in `tz`, default APP_TZ) bereits verbrauchte Reinigungs-Öffnungen — gezählt
 *  über die OEFFNEN(REINIGUNG)-Einträge des Tages. (Die frühere CLEAN_OPEN-BoxEvent-Zählung war tot:
 *  solche Events werden nie geschrieben, `usedToday` war real immer 0 und das Tages-Limit griff nie.) */
export async function reinigungVerbrauchtHeute(userId: string, now: Date, tz = APP_TZ): Promise<number> {
  return prisma.entry.count({
    where: { userId, type: "OEFFNEN", oeffnenGrund: "REINIGUNG", startTime: { gte: midnightInTZ(now, tz) } },
  });
}

/** Stabile MCP-Sicht der Reinigungs-(Cleaning-)Regeln. Eine Quelle für
 *  get_context.cleaning (V2): allowed = Öffnungen erlaubt; maxMinutesPerBreak = max Minuten je Öffnung;
 *  maxPausesPerDay = max Öffnungen/Tag (COUNT, null = unbegrenzt); usedToday = heute verbraucht;
 *  windows = erlaubte Tages-Zeitfenster (leer = nicht zeitgebunden); windowOpenNow = aktuell offenes
 *  Fenster (until = dessen Ende HH:MM) oder null. */
export interface ReinigungView {
  allowed: boolean;
  maxMinutesPerBreak: number;
  maxPausesPerDay: number | null;
  usedToday: number;
  windows: ReinigungsFenster[];
  windowOpenNow: { until: string } | null;
}

/** User-Reinigungs-Spalten, die `buildReinigungView` braucht (für Prisma-Select bei den Aufrufern). */
export interface ReinigungUserFields {
  reinigungErlaubt: boolean | null;
  reinigungMaxMinuten: number | null;
  reinigungMaxProTag: number | null;
  reinigungsFenster: unknown;
}

/** Baut die ReinigungView aus den User-Feldern + heute-verbraucht + jetzt. Kapselt die load-bearing
 *  Null-Sentinel-Regel (maxProTag>0 ? : null) und die windowOpenNow-Ableitung an EINER Stelle.
 *  `tz` = Sub-Zeitzone (default APP_TZ) — governiert das Wanduhr-Fenster; explizit übergeben statt aus
 *  `user` gelesen, damit ein fehlendes Select nicht still auf APP_TZ zurückfällt (Konsistenz mit den
 *  übrigen tz-Callsites). */
export function buildReinigungView(user: ReinigungUserFields, usedToday: number, now: Date, tz = APP_TZ): ReinigungView {
  const maxProTag = user.reinigungMaxProTag ?? 0;
  const windowEnd = aktivesReinigungsFenster(user.reinigungsFenster, now, tz); // "HH:MM" oder null
  return {
    allowed: user.reinigungErlaubt ?? false,
    maxMinutesPerBreak: user.reinigungMaxMinuten ?? 15,
    maxPausesPerDay: maxProTag > 0 ? maxProTag : null,
    usedToday,
    windows: parseReinigungsFenster(user.reinigungsFenster),
    windowOpenNow: windowEnd ? { until: windowEnd } : null,
  };
}

/** Max minutes per cleaning pause is clamped to this range. */
const MAX_MINUTEN_RANGE = { min: 1, max: 120, fallback: 15 } as const;
/** Max cleaning pauses per day is clamped to this range (0 = unlimited). */
const MAX_PRO_TAG_RANGE = { min: 0, max: 20, fallback: 0 } as const;

/**
 * Updates a user's cleaning-pause (Reinigung) settings. Only provided fields change; numeric
 * fields are clamped to their valid ranges. Shared by PATCH /api/admin/users/[id] and the MCP tool.
 */
export async function setReinigungSettings(userId: string, params: SetReinigungParams): Promise<ServiceResult<null>> {
  const data: {
    reinigungErlaubt?: boolean; reinigungMaxMinuten?: number; reinigungMaxProTag?: number;
    reinigungsFenster?: string;
  } = {};

  if (params.erlaubt !== undefined) data.reinigungErlaubt = params.erlaubt;
  if (params.maxMinuten !== undefined) data.reinigungMaxMinuten = clamp(params.maxMinuten, MAX_MINUTEN_RANGE);
  if (params.maxProTag !== undefined) data.reinigungMaxProTag = clamp(params.maxProTag, MAX_PRO_TAG_RANGE);
  // Als JSON-String ablegen (TEXT-Spalte) — nur validierte Paare.
  if (params.fenster !== undefined) data.reinigungsFenster = JSON.stringify(parseReinigungsFenster(params.fenster));

  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);

  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, data: null };
}
