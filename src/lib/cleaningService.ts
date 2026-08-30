import { prisma } from "@/lib/prisma";
import {
  CLEANING_RULES_EPOCH, cleaningSettingsEqual, cleaningSettingsFromUser, type CleaningSettings,
} from "@/lib/cleaningRules";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import { APP_TZ, hhmmInTZ, midnightInTZ, clamp } from "@/lib/utils";
import {
  CLEANING_MAX_MINUTES_RANGE, CLEANING_MAX_PER_DAY_RANGE, CLEANING_WINDOWS_MAX, CLEANING_WINDOWS_TOO_MANY,
  HHMM, INVALID_TIME, NO_FIELDS_TO_UPDATE, TIME_RANGE_INVALID,
} from "@/lib/constants";

export interface CleaningWindows {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface SetCleaningParams {
  /** Allow cleaning pauses (short opening without an entry). */
  allowed?: boolean;
  /** Max minutes per cleaning pause. */
  maxMinutes?: number;
  /** Max cleaning pauses per day (0 = unlimited). */
  maxPerDay?: number;
  /** Daily cleaning windows; raw input, validated/normalised before storing. */
  windows?: unknown;
  /** Username dessen, der ändert (bzw. `ai`) — Audit-Feld der Historie. */
  changedBy?: string;
  /** Testbarkeit: ab wann die neue Fassung gilt. Default `new Date()`. */
  now?: Date;
}

/** Form eines GESPEICHERTEN Fensters: zwei „HH:MM"-Strings, aufsteigend. Bewusst toleranter als
 *  {@link HHMM} (die Schreib-Regel) — siehe {@link windowShape}. */
const HHMM_SHAPE = /^\d{2}:\d{2}$/;
/** Als ENDE zusätzlich erlaubt: „bis Mitternacht". Als Start sinnlos (nichts läge danach). */
const MIDNIGHT_END = "24:00";

/** Die LESE-Regel EINES Fenster-Paares: Form + aufsteigende Reihenfolge, sonst `null`. Bewusst
 *  tolerant gegenüber der Uhrzeit selbst — sie beurteilt BESTAND, und ein einmal gespeichertes
 *  Fenster nachträglich strenger zu lesen hiesse, es dem Sub lautlos wegzunehmen. Die strengere
 *  SCHREIB-Regel setzt darauf auf: {@link cleaningWindowProblem} lässt nur eine Teilmenge davon
 *  durch (per Test gepinnt), damit kein angenommener Schreibvorgang beim Lesen wieder verschwindet. */
function windowShape(f: unknown): CleaningWindows | null {
  const start = (f as { start?: unknown })?.start;
  const end = (f as { end?: unknown })?.end;
  if (typeof start !== "string" || typeof end !== "string") return null;
  if (!HHMM_SHAPE.test(start) || !HHMM_SHAPE.test(end) || start >= end) return null;
  return { start, end };
}

/**
 * Die SCHREIB-Regel EINES Fenster-Paares: der stabile Fehler-Code, `null` heisst gültig.
 *
 * Der Lese-Pfad verwirft Murks still (richtig für Bestand) — für einen Schreiber wäre genau das die
 * Falle: „19:00–18:00" käme als `ok` zurück und hätte in Wahrheit ein Fenster GELÖSCHT. Dieselbe
 * Haltung wie beim Geschwister-Service (`setAutoKontrolleSettings` → `INVALID_TIME`).
 */
export function cleaningWindowProblem(f: unknown): ServiceErrorCode | null {
  const start = (f as { start?: unknown })?.start;
  const end = (f as { end?: unknown })?.end;
  if (typeof start !== "string" || !HHMM.test(start)) return INVALID_TIME;
  if (typeof end !== "string" || !(HHMM.test(end) || end === MIDNIGHT_END)) return INVALID_TIME;
  if (start >= end) return TIME_RANGE_INVALID;
  return null;
}

/** Die SCHREIB-Regel der GANZEN Liste: Array, Länge, jedes Paar. Liefert den stabilen Fehler-Code
 *  plus — wo es eines gibt — den Index des schuldigen Paares: der Service braucht nur den Code, ein
 *  MCP-Agent auch die Stelle. EINE Prüfung für beide, statt einer Kopie je Aufrufer. */
export function cleaningWindowListProblem(raw: unknown): { code: ServiceErrorCode; index?: number } | null {
  if (!Array.isArray(raw)) return { code: INVALID_TIME };
  if (raw.length > CLEANING_WINDOWS_MAX) return { code: CLEANING_WINDOWS_TOO_MANY };
  for (const [index, f] of raw.entries()) {
    const code = cleaningWindowProblem(f);
    if (code) return { code, index };
  }
  return null;
}

/** Ein Fenster als eine Zeile („19:00-20:00") — für Meldungen und Feld-Diffs, wo eine Liste von
 *  Objekten unlesbar wäre. */
export function formatCleaningWindows(f: CleaningWindows): string {
  return `${f.start}-${f.end}`;
}

/** Parst + validiert die Fenster-Liste aus User.cleaningWindows (JSON-String ODER Array;
 *  tolerant: Murks → []). SQLite/Prisma 5 speichert das Feld als TEXT, daher String-Pfad. */
export function parseCleaningWindows(raw: unknown): CleaningWindows[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  const out: CleaningWindows[] = [];
  for (const f of arr) {
    const windows = windowShape(f);
    if (windows) out.push(windows);
  }
  return out;
}

/** „HH:MM" der aktuellen Uhrzeit in `tz` (default APP_TZ; 24h, fix mit ":" für lexikalischen Vergleich). */
/** Liegt `now` (Sub-Lokalzeit `tz`, default APP_TZ) in einem Reinigungs-Fenster? Liefert dessen Ende „HH:MM", sonst null.
 *  Die Fenster sind Wanduhrzeit des Subs — deshalb muss `tz` die Sub-Zeitzone sein, nicht die des Betrachters. */
export function activeCleaningWindow(raw: unknown, now: Date, tz = APP_TZ): string | null {
  const hhmm = hhmmInTZ(now, tz);
  for (const f of parseCleaningWindows(raw)) {
    if (f.start <= hhmm && hhmm < f.end) return f.end;
  }
  return null;
}

/**
 * Das nächste Reinigungs-Fenster, das nach `now` (Sub-Lokalzeit `tz`) BEGINNT — sonst das früheste
 * des Tages (dann liegt es morgen). null, wenn keine Fenster konfiguriert sind (= nicht zeitgebunden).
 *
 * Läuft `now` gerade IN einem Fenster, liefert das trotzdem das darauffolgende: „aktuell offen"
 * beantwortet {@link activeCleaningWindow}, hier geht es um „wann wieder".
 */
export function nextCleaningWindow(raw: unknown, now: Date, tz = APP_TZ): CleaningWindows | null {
  const windows = parseCleaningWindows(raw);
  if (windows.length === 0) return null;
  const hhmm = hhmmInTZ(now, tz);
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.find((f) => f.start > hhmm) ?? sorted[0];
}

/** Heute (Sub-Kalendertag in `tz`, default APP_TZ) bereits verbrauchte Reinigungs-Öffnungen — gezählt
 *  über die OEFFNEN(REINIGUNG)-Einträge des Tages. (Die frühere CLEAN_OPEN-BoxEvent-Zählung war tot:
 *  solche Events werden nie geschrieben, `usedToday` war real immer 0 und das Tages-Limit griff nie.)
 *  Der DB-Pfad, für Aufrufer OHNE geladene Einträge; aus geladenen Einträgen zählt
 *  {@link countCleaningUsedToday}. */
export async function cleaningUsedToday(userId: string, now: Date, tz = APP_TZ): Promise<number> {
  return prisma.entry.count({
    where: { userId, type: "OEFFNEN", oeffnenGrund: "REINIGUNG", startTime: { gte: midnightInTZ(now, tz) } },
  });
}

/** Die Eintrags-Felder, die {@link countCleaningUsedToday} liest. `oeffnenGrund` ist optional wie in
 *  den übrigen In-Memory-Eintragsformen (`SegmentEntry`, `buildPairs`), damit deren Listen passen. */
export interface CleaningCountEntry {
  type: string;
  oeffnenGrund?: string | null;
  startTime: Date;
}

/** Dasselbe Ergebnis wie {@link cleaningUsedToday}, nur aus bereits geladenen Einträgen
 *  statt aus einer eigenen Abfrage. Bewusst dieselbe Grenze (`>= midnightInTZ`, nach oben offen)
 *  wie das Prisma-`where` daneben — die beiden Zählungen dürfen nie auseinanderlaufen.
 *
 *  `allEntries` heisst so, weil es das sein MUSS: ALLE Einträge des Subs, ohne Zeit- oder
 *  Typ-Vorfilter. Eine vorgefilterte Liste typecheckt anstandslos und zählt still zu wenig — wer die
 *  ladende Abfrage je begrenzt (`take`, Zeitfenster), muss stattdessen auf den DB-Pfad wechseln. */
export function countCleaningUsedToday(allEntries: CleaningCountEntry[], now: Date, tz = APP_TZ): number {
  const seit = midnightInTZ(now, tz);
  return allEntries.filter(
    (e) => e.type === "OEFFNEN" && e.oeffnenGrund === "REINIGUNG" && e.startTime >= seit,
  ).length;
}

/** Stabile MCP-Sicht der Reinigungs-(Cleaning-)Regeln. Eine Quelle für
 *  get_context.cleaning (V2): allowed = Öffnungen erlaubt; maxMinutesPerBreak = max Minuten je Öffnung;
 *  maxPausesPerDay = max Öffnungen/Tag (COUNT, null = unbegrenzt); usedToday = heute verbraucht;
 *  windows = erlaubte Tages-Zeitfenster (leer = nicht zeitgebunden); windowOpenNow = aktuell offenes
 *  Fenster (until = dessen Ende HH:MM) oder null. */
export interface CleaningView {
  allowed: boolean;
  maxMinutesPerBreak: number;
  maxPausesPerDay: number | null;
  usedToday: number;
  windows: CleaningWindows[];
  windowOpenNow: { until: string } | null;
}

/** Prisma-Select genau der Spalten von {@link CleaningUserFields} — damit Lese- und Schreibseite
 *  (und das Strafbuch, das sie für die Historie braucht) nicht getrennt voneinander veralten. */
export const CLEANING_USER_SELECT = {
  cleaningAllowed: true,
  cleaningMaxMinutes: true,
  cleaningMaxPerDay: true,
  cleaningWindows: true,
} as const;

/** User-Reinigungs-Spalten, die `buildCleaningView` braucht (für Prisma-Select bei den Aufrufern). */
export interface CleaningUserFields {
  cleaningAllowed: boolean | null;
  cleaningMaxMinutes: number | null;
  cleaningMaxPerDay: number | null;
  cleaningWindows: unknown;
}

/** Die load-bearing Null-Sentinel-Regel für `cleaningMaxPerDay`: `0` (der Spalten-Default) heisst
 *  „unbegrenzt" — nach aussen (get_context.cleaning, MCP dryRun-Previews) immer als `null` zeigen,
 *  nie als die Zahl `0`, sonst liest sich dieselbe Bedeutung an zwei Stellen unterschiedlich (siehe
 *  buildCleaningView, mcpSetCleaning-dryRun). EINE Stelle statt der Ausdruck mehrfach hingeschrieben. */
export function maxPausesPerDaySentinel(raw: number | null | undefined): number | null {
  const maxPerDay = raw ?? 0;
  return maxPerDay > 0 ? maxPerDay : null;
}

/** Baut die CleaningView aus den User-Feldern + heute-verbraucht + jetzt. Kapselt die load-bearing
 *  Null-Sentinel-Regel (maxPerDay>0 ? : null) und die windowOpenNow-Ableitung an EINER Stelle.
 *  `tz` = Sub-Zeitzone (default APP_TZ) — governiert das Wanduhr-Fenster; explizit übergeben statt aus
 *  `user` gelesen, damit ein fehlendes Select nicht still auf APP_TZ zurückfällt (Konsistenz mit den
 *  übrigen tz-Callsites). */
export function buildCleaningView(user: CleaningUserFields, usedToday: number, now: Date, tz = APP_TZ): CleaningView {
  const windowEnd = activeCleaningWindow(user.cleaningWindows, now, tz); // "HH:MM" oder null
  return {
    allowed: user.cleaningAllowed ?? false,
    maxMinutesPerBreak: user.cleaningMaxMinutes ?? 15,
    maxPausesPerDay: maxPausesPerDaySentinel(user.cleaningMaxPerDay),
    usedToday,
    windows: parseCleaningWindows(user.cleaningWindows),
    windowOpenNow: windowEnd ? { until: windowEnd } : null,
  };
}

/**
 * Updates a user's cleaning-pause (Reinigung) settings. Only provided fields change; numeric
 * fields are clamped to their valid ranges. Shared by PATCH /api/admin/users/[id] and the MCP tool.
 *
 * `windows` ERSETZT die Liste als Ganzes (`[]` löscht sie) und wird abgelehnt, statt still
 * beschnitten zu werden: ein verworfenes Paar wäre für den Aufrufer nicht von „gespeichert" zu
 * unterscheiden — er hätte ein Fenster gelöscht und ein `ok` bekommen.
 */
export async function setCleaningSettings(userId: string, params: SetCleaningParams): Promise<ServiceResult<null>> {
  const data: {
    cleaningAllowed?: boolean; cleaningMaxMinutes?: number; cleaningMaxPerDay?: number;
    cleaningWindows?: string;
  } = {};

  if (params.allowed !== undefined) data.cleaningAllowed = params.allowed;
  if (params.maxMinutes !== undefined) data.cleaningMaxMinutes = clamp(params.maxMinutes, CLEANING_MAX_MINUTES_RANGE);
  if (params.maxPerDay !== undefined) data.cleaningMaxPerDay = clamp(params.maxPerDay, CLEANING_MAX_PER_DAY_RANGE);
  if (params.windows !== undefined) {
    const problem = cleaningWindowListProblem(params.windows);
    if (problem) return serviceFail(400, problem.code);
    // Als JSON-String ablegen (TEXT-Spalte).
    data.cleaningWindows = JSON.stringify(parseCleaningWindows(params.windows));
  }

  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);

  const now = params.now ?? new Date();

  // Bestand lesen, Historie schreiben und Spalten setzen in EINER Transaktion. Die Oberfläche
  // schickt je Feld einen eigenen PATCH (`CleaningToggle`), zwei davon können sich überlappen —
  // ausserhalb der Transaktion gelesen sähen beide denselben Bestand und schrieben zwei Grundzeilen
  // bzw. eine falsche Vorher-Fassung. Und bräche sie nach der Spalten-Änderung ab, stünde der neue
  // Wert ohne Historie da: das Strafbuch beurteilte die Vergangenheit wieder nach dem heutigen
  // Stand, also genau der Fehler, gegen den die Tabelle gebaut ist.
  await prisma.$transaction(async (tx) => {
    const before = cleaningSettingsFromUser(
      await tx.user.findUnique({ where: { id: userId }, select: CLEANING_USER_SELECT }),
    );
    const after: CleaningSettings = {
      allowed: data.cleaningAllowed ?? before.allowed,
      maxMinutes: data.cleaningMaxMinutes ?? before.maxMinutes,
      maxPerDay: data.cleaningMaxPerDay ?? before.maxPerDay,
      windows: data.cleaningWindows ?? before.windows,
    };
    // Die Historie hält Änderungen fest, nicht Klicks: ein Speichern, das nichts bewegt, schreibt
    // keine Zeile — sonst nennte `changedBy` irgendwann den, der zuletzt bestätigt hat, statt den,
    // der tatsächlich geändert hat (dieselbe Regel wie in `setOffenseRule`).
    if (!cleaningSettingsEqual(before, after)) {
      const hasHistory = await tx.cleaningRuleChange.count({ where: { userId } }) > 0;
      await tx.cleaningRuleChange.createMany({
        data: [
          // Den Ausgangsstand hat niemand gesetzt — `changedBy` bleibt leer.
          ...(hasHistory ? [] : [{ userId, ...before, effectiveFrom: CLEANING_RULES_EPOCH, changedBy: null }]),
          { userId, ...after, effectiveFrom: now, changedBy: params.changedBy ?? null },
        ],
      });
    }
    await tx.user.update({ where: { id: userId }, data });
  });
  return { ok: true, data: null };
}
