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
  /** Username dessen, der ändert (bzw. `ai`) — Audit-Feld der Historie. */
  changedBy?: string;
  /** Testbarkeit: ab wann die neue Fassung gilt. Default `new Date()`. */
  now?: Date;
}

/** Form eines GESPEICHERTEN Fensters: zwei „HH:MM"-Strings, aufsteigend. Bewusst toleranter als
 *  {@link HHMM} (die Schreib-Regel) — siehe {@link fensterShape}. */
const HHMM_SHAPE = /^\d{2}:\d{2}$/;
/** Als ENDE zusätzlich erlaubt: „bis Mitternacht". Als Start sinnlos (nichts läge danach). */
const MIDNIGHT_END = "24:00";

/** Die LESE-Regel EINES Fenster-Paares: Form + aufsteigende Reihenfolge, sonst `null`. Bewusst
 *  tolerant gegenüber der Uhrzeit selbst — sie beurteilt BESTAND, und ein einmal gespeichertes
 *  Fenster nachträglich strenger zu lesen hiesse, es dem Sub lautlos wegzunehmen. Die strengere
 *  SCHREIB-Regel setzt darauf auf: {@link reinigungsFensterProblem} lässt nur eine Teilmenge davon
 *  durch (per Test gepinnt), damit kein angenommener Schreibvorgang beim Lesen wieder verschwindet. */
function fensterShape(f: unknown): ReinigungsFenster | null {
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
export function reinigungsFensterProblem(f: unknown): ServiceErrorCode | null {
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
export function reinigungsFensterListProblem(raw: unknown): { code: ServiceErrorCode; index?: number } | null {
  if (!Array.isArray(raw)) return { code: INVALID_TIME };
  if (raw.length > CLEANING_WINDOWS_MAX) return { code: CLEANING_WINDOWS_TOO_MANY };
  for (const [index, f] of raw.entries()) {
    const code = reinigungsFensterProblem(f);
    if (code) return { code, index };
  }
  return null;
}

/** Ein Fenster als eine Zeile („19:00-20:00") — für Meldungen und Feld-Diffs, wo eine Liste von
 *  Objekten unlesbar wäre. */
export function formatReinigungsFenster(f: ReinigungsFenster): string {
  return `${f.start}-${f.end}`;
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
    const fenster = fensterShape(f);
    if (fenster) out.push(fenster);
  }
  return out;
}

/** „HH:MM" der aktuellen Uhrzeit in `tz` (default APP_TZ; 24h, fix mit ":" für lexikalischen Vergleich). */
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
 *  solche Events werden nie geschrieben, `usedToday` war real immer 0 und das Tages-Limit griff nie.)
 *  Der DB-Pfad, für Aufrufer OHNE geladene Einträge; aus geladenen Einträgen zählt
 *  {@link countCleaningUsedToday}. */
export async function reinigungVerbrauchtHeute(userId: string, now: Date, tz = APP_TZ): Promise<number> {
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

/** Dasselbe Ergebnis wie {@link reinigungVerbrauchtHeute}, nur aus bereits geladenen Einträgen
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
export interface ReinigungView {
  allowed: boolean;
  maxMinutesPerBreak: number;
  maxPausesPerDay: number | null;
  usedToday: number;
  windows: ReinigungsFenster[];
  windowOpenNow: { until: string } | null;
}

/** Prisma-Select genau der Spalten von {@link ReinigungUserFields} — damit Lese- und Schreibseite
 *  (und das Strafbuch, das sie für die Historie braucht) nicht getrennt voneinander veralten. */
export const CLEANING_USER_SELECT = {
  reinigungErlaubt: true,
  reinigungMaxMinuten: true,
  reinigungMaxProTag: true,
  reinigungsFenster: true,
} as const;

/** User-Reinigungs-Spalten, die `buildReinigungView` braucht (für Prisma-Select bei den Aufrufern). */
export interface ReinigungUserFields {
  reinigungErlaubt: boolean | null;
  reinigungMaxMinuten: number | null;
  reinigungMaxProTag: number | null;
  reinigungsFenster: unknown;
}

/** Die load-bearing Null-Sentinel-Regel für `reinigungMaxProTag`: `0` (der Spalten-Default) heisst
 *  „unbegrenzt" — nach aussen (get_context.cleaning, MCP dryRun-Previews) immer als `null` zeigen,
 *  nie als die Zahl `0`, sonst liest sich dieselbe Bedeutung an zwei Stellen unterschiedlich (siehe
 *  buildReinigungView, mcpSetCleaning-dryRun). EINE Stelle statt der Ausdruck mehrfach hingeschrieben. */
export function maxPausesPerDaySentinel(raw: number | null | undefined): number | null {
  const maxProTag = raw ?? 0;
  return maxProTag > 0 ? maxProTag : null;
}

/** Baut die ReinigungView aus den User-Feldern + heute-verbraucht + jetzt. Kapselt die load-bearing
 *  Null-Sentinel-Regel (maxProTag>0 ? : null) und die windowOpenNow-Ableitung an EINER Stelle.
 *  `tz` = Sub-Zeitzone (default APP_TZ) — governiert das Wanduhr-Fenster; explizit übergeben statt aus
 *  `user` gelesen, damit ein fehlendes Select nicht still auf APP_TZ zurückfällt (Konsistenz mit den
 *  übrigen tz-Callsites). */
export function buildReinigungView(user: ReinigungUserFields, usedToday: number, now: Date, tz = APP_TZ): ReinigungView {
  const windowEnd = aktivesReinigungsFenster(user.reinigungsFenster, now, tz); // "HH:MM" oder null
  return {
    allowed: user.reinigungErlaubt ?? false,
    maxMinutesPerBreak: user.reinigungMaxMinuten ?? 15,
    maxPausesPerDay: maxPausesPerDaySentinel(user.reinigungMaxProTag),
    usedToday,
    windows: parseReinigungsFenster(user.reinigungsFenster),
    windowOpenNow: windowEnd ? { until: windowEnd } : null,
  };
}

/**
 * Updates a user's cleaning-pause (Reinigung) settings. Only provided fields change; numeric
 * fields are clamped to their valid ranges. Shared by PATCH /api/admin/users/[id] and the MCP tool.
 *
 * `fenster` ERSETZT die Liste als Ganzes (`[]` löscht sie) und wird abgelehnt, statt still
 * beschnitten zu werden: ein verworfenes Paar wäre für den Aufrufer nicht von „gespeichert" zu
 * unterscheiden — er hätte ein Fenster gelöscht und ein `ok` bekommen.
 */
export async function setReinigungSettings(userId: string, params: SetReinigungParams): Promise<ServiceResult<null>> {
  const data: {
    reinigungErlaubt?: boolean; reinigungMaxMinuten?: number; reinigungMaxProTag?: number;
    reinigungsFenster?: string;
  } = {};

  if (params.erlaubt !== undefined) data.reinigungErlaubt = params.erlaubt;
  if (params.maxMinuten !== undefined) data.reinigungMaxMinuten = clamp(params.maxMinuten, CLEANING_MAX_MINUTES_RANGE);
  if (params.maxProTag !== undefined) data.reinigungMaxProTag = clamp(params.maxProTag, CLEANING_MAX_PER_DAY_RANGE);
  if (params.fenster !== undefined) {
    const problem = reinigungsFensterListProblem(params.fenster);
    if (problem) return serviceFail(400, problem.code);
    // Als JSON-String ablegen (TEXT-Spalte).
    data.reinigungsFenster = JSON.stringify(parseReinigungsFenster(params.fenster));
  }

  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);

  const now = params.now ?? new Date();

  // Bestand lesen, Historie schreiben und Spalten setzen in EINER Transaktion. Die Oberfläche
  // schickt je Feld einen eigenen PATCH (`ReinigungToggle`), zwei davon können sich überlappen —
  // ausserhalb der Transaktion gelesen sähen beide denselben Bestand und schrieben zwei Grundzeilen
  // bzw. eine falsche Vorher-Fassung. Und bräche sie nach der Spalten-Änderung ab, stünde der neue
  // Wert ohne Historie da: das Strafbuch beurteilte die Vergangenheit wieder nach dem heutigen
  // Stand, also genau der Fehler, gegen den die Tabelle gebaut ist.
  await prisma.$transaction(async (tx) => {
    const before = cleaningSettingsFromUser(
      await tx.user.findUnique({ where: { id: userId }, select: CLEANING_USER_SELECT }),
    );
    const after: CleaningSettings = {
      allowed: data.reinigungErlaubt ?? before.allowed,
      maxMinutes: data.reinigungMaxMinuten ?? before.maxMinutes,
      maxPerDay: data.reinigungMaxProTag ?? before.maxPerDay,
      windows: data.reinigungsFenster ?? before.windows,
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
