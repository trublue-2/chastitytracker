import { prisma } from "@/lib/prisma";
import type { ServiceResult } from "@/lib/serviceResult";
import { APP_TZ, midnightInTZ } from "@/lib/utils";

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

/** „HH:MM" der aktuellen Uhrzeit in CH-Lokalzeit (24h, fix mit ":" für lexikalischen Vergleich). */
function hhmmInTZ(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
}

/** Liegt `now` (CH-Lokalzeit) in einem Reinigungs-Fenster? Liefert dessen Ende „HH:MM", sonst null. */
export function aktivesReinigungsFenster(raw: unknown, now: Date): string | null {
  const hhmm = hhmmInTZ(now);
  for (const f of parseReinigungsFenster(raw)) {
    if (f.start <= hhmm && hhmm < f.end) return f.end;
  }
  return null;
}

/** Heute (CH-Tag) bereits verbrauchte Reinigungs-Öffnungen — gezählt über CLEAN_OPEN-Fakten (Spur 2). */
export async function reinigungVerbrauchtHeute(userId: string, now: Date): Promise<number> {
  return prisma.boxEvent.count({
    where: { userId, type: "CLEAN_OPEN", at: { gte: midnightInTZ(now) } },
  });
}

/** Max minutes per cleaning pause is clamped to this range. */
const MAX_MINUTEN_RANGE = { min: 1, max: 120, fallback: 15 } as const;
/** Max cleaning pauses per day is clamped to this range (0 = unlimited). */
const MAX_PRO_TAG_RANGE = { min: 0, max: 20, fallback: 0 } as const;

function clamp(value: number, { min, max, fallback }: { min: number; max: number; fallback: number }): number {
  return Math.max(min, Math.min(max, Math.round(value) || fallback));
}

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

  if (Object.keys(data).length === 0) return { ok: false, status: 400, error: "Keine Felder zum Aktualisieren" };

  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, data: null };
}
