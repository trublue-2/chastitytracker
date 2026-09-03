import { prisma } from "@/lib/prisma";
import {
  CLEANING_RULES_EPOCH, cleaningSettingsEqual, cleaningSettingsFromUser, type CleaningSettings,
} from "@/lib/cleaningRules";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import { APP_TZ, hhmmInTZ, midnightInTZ, clamp } from "@/lib/utils";
import { listProblem, parseJsonList, type ListProblem } from "@/lib/jsonList";
import {
  CLEANING_MAX_MINUTES_RANGE, CLEANING_MAX_PER_DAY_RANGE, CLEANING_WINDOWS_MAX, CLEANING_WINDOWS_TOO_MANY,
  HHMM, INVALID_TIME, NO_FIELDS_TO_UPDATE, TIME_RANGE_INVALID,
} from "@/lib/constants";
import { isoDayPlus, isoWeekdayInTZ, parseWeekdayMask, weekdayMaskHas, weekdayMaskValid } from "@/lib/weekdays";

export interface CleaningWindows {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
  /**
   * An welchen Wochentagen dieses Fenster gilt — Bitmaske aus `weekdays.ts`, dasselbe Feld wie bei
   * den Wiege-Fenstern. Fehlt es im Bestand, liest {@link parseWeekdayMask} „alle Tage": ein vor der
   * Umstellung gesetztes Fenster darf sich nicht dadurch ändern, dass es die Frage nicht kannte.
   */
  days: number;
}

/**
 * {@link nextCleaningWindow} plus die Angabe, an welchem der nächsten Tage es liegt (0 = heute noch,
 * 1 = morgen). Ohne sie sagte der Hinweis „wieder ab 06:00" — und meinte den Montag.
 */
export interface NextCleaningWindow extends CleaningWindows {
  /** 0 = heute noch, 1 = morgen, … 7 = derselbe Wochentag in einer Woche. */
  inDays: number;
  /** Der ISO-Wochentag (1 = Montag … 7 = Sonntag), an dem es liegt. Beides, weil beides gebraucht
   *  wird und keins das andere hergibt: `inDays === 0` entscheidet, OB ein Tag genannt werden muss,
   *  `isoDay` sagt WELCHER — und den könnte die Anzeige sonst nur aus der Zeitzone des Trägers
   *  zurückrechnen, die sie im Browser gar nicht hat. */
  isoDay: number;
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
  return { start, end, days: parseWeekdayMask((f as { days?: unknown })?.days) };
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
  // `days` darf FEHLEN (dann alle Tage — so kommt jedes Fenster aus der Zeit vor den Wochentagen),
  // aber nicht falsch sein: eine Null-Maske wäre ein Fenster, das nie gilt, und stünde trotzdem in
  // der Liste wie eine Regel. Dieselbe Haltung wie bei den Wiege-Fenstern.
  const days = (f as { days?: unknown })?.days;
  if (days !== undefined && !weekdayMaskValid(days)) return INVALID_TIME;
  return null;
}

/** Die SCHREIB-Regel der GANZEN Liste: Array, Länge, jedes Paar. Liefert den stabilen Fehler-Code
 *  plus — wo es eines gibt — den Index des schuldigen Paares: der Service braucht nur den Code, ein
 *  MCP-Agent auch die Stelle. EINE Prüfung für beide, statt einer Kopie je Aufrufer. */
export function cleaningWindowListProblem(raw: unknown): ListProblem | null {
  return listProblem(
    raw,
    { max: CLEANING_WINDOWS_MAX, notAListCode: INVALID_TIME, tooManyCode: CLEANING_WINDOWS_TOO_MANY },
    cleaningWindowProblem,
  );
}

/** Ein Fenster als eine Zeile („19:00-20:00") — für Meldungen und Feld-Diffs, wo eine Liste von
 *  Objekten unlesbar wäre. */
export function formatCleaningWindows(f: CleaningWindows): string {
  return `${f.start}-${f.end}`;
}

/** Parst + validiert die Fenster-Liste aus User.cleaningWindows (JSON-String ODER Array;
 *  tolerant: Murks → []). SQLite/Prisma 5 speichert das Feld als TEXT, daher String-Pfad. */
export function parseCleaningWindows(raw: unknown): CleaningWindows[] {
  return parseJsonList(raw, windowShape);
}

/** „HH:MM" der aktuellen Uhrzeit in `tz` (default APP_TZ; 24h, fix mit ":" für lexikalischen Vergleich). */
/** Liegt `now` (Sub-Lokalzeit `tz`, default APP_TZ) in einem Reinigungs-Fenster? Liefert dessen Ende „HH:MM", sonst null.
 *  Die Fenster sind Wanduhrzeit des Subs — deshalb muss `tz` die Sub-Zeitzone sein, nicht die des Betrachters. */
export function activeCleaningWindow(raw: unknown, now: Date, tz = APP_TZ): string | null {
  return activeWindowIn(parseCleaningWindows(raw), now, tz)?.end ?? null;
}

/** Dasselbe aus einer BEREITS GEPARSTEN Liste. Für Aufrufer, die ohnehin parsen mussten
 *  (`cleaningWindowOpen` fragt zuerst nach der Länge) — sonst liefe `windowShape` samt
 *  `parseWeekdayMask` ein zweites Mal über jedes Fenster.
 *
 *  Die Zeit- und Wochentags-Auflösung steht NACH der Leer-Prüfung: wer keine Fenster hat, soll für
 *  diese Antwort keine zwei `Intl`-Abfragen zahlen. Das Strafbuch stellt sie je Öffnung der ganzen
 *  Historie (`cleaningRelockDeadline`). */
function activeWindowIn(windows: CleaningWindows[], now: Date, tz: string): CleaningWindows | null {
  if (windows.length === 0) return null;
  const hhmm = hhmmInTZ(now, tz);
  const isoDay = isoWeekdayInTZ(now, tz);
  /**
   * ÜBERLAPPEN sich zwei Fenster, gilt das mit dem SPÄTESTEN Ende — nicht das zuerst gespeicherte.
   *
   * Die Liste ist ungeordnet und der Editor verhindert Überlappungen nicht (`cleaningWindowProblem`
   * prüft jedes Fenster für sich). Der frühere Treffer-Abbruch machte damit die Speicher-Reihenfolge
   * zur Regel: bei 08:00–12:00 und 10:00–20:00 endete die Reinigung um 11:00 scheinbar um 12:00,
   * obwohl eine Öffnung um 15:00 weiterhin erlaubt war (`cleaningWindowOpen` fragt „deckt IRGENDEIN
   * Fenster diesen Zeitpunkt", also zwei verschiedene Antworten auf dieselbe Frage).
   *
   * Das trägt weiter als die Anzeige: die Rückschliess-Frist einer Reinigungsöffnung ist das Ende
   * des zur Öffnungszeit geltenden Fensters (`cleaningRelockDeadline` im Strafbuch). Sie fiel damit
   * zu FRÜH — der Träger bekam ein Versäumnis für eine Zeit, in der er noch offen sein durfte. Ohne
   * Überlappung ändert sich nichts: dann gibt es je Zeitpunkt höchstens einen Treffer.
   */
  let best: CleaningWindows | null = null;
  for (const f of windows) {
    if (!weekdayMaskHas(f.days, isoDay) || f.start > hhmm || hhmm >= f.end) continue;
    // Bei gleichem Ende der frühere Beginn: sonst entschiede die Speicher-Reihenfolge doch wieder —
    // für das blosse Ende folgenlos, aber `currentOrNextCleaningWindow` gibt den ganzen Bereich an
    // die Anzeige weiter, und der begänne dann mal um 08:00 und mal um 10:00.
    if (best === null || f.end > best.end || (f.end === best.end && f.start < best.start)) best = f;
  }
  return best;
}

export { activeWindowIn as activeCleaningWindowIn };

/**
 * Das Fenster, auf das es GERADE ankommt: das laufende, sonst das nächste. `null`, wo keine Fenster
 * konfiguriert sind (= nicht zeitgebunden) oder keines je gilt.
 *
 * Die Frage der ANZEIGE, und deshalb eine eigene: {@link activeCleaningWindow} beantwortet „läuft
 * gerade eines" (und gibt nur dessen Ende), {@link nextCleaningWindow} ausdrücklich „wann WIEDER"
 * und überspringt dafür das laufende. Wer dem Träger sagen will, wann er reinigen darf, braucht
 * beide Fälle in einer Antwort — und zwar mit `start` UND `end`, denn genannt wird ein Bereich.
 *
 * `inDays: 0` für das laufende Fenster: es liegt heute, und die Anzeige nennt den Wochentag genau
 * dann nicht.
 */
export function currentOrNextCleaningWindow(raw: unknown, now: Date, tz = APP_TZ): NextCleaningWindow | null {
  // EINMAL parsen und beide Nachbarn auf der fertigen Liste fragen — die Hausregel dieses Moduls
  // (siehe `activeCleaningWindowIn`): sonst liefe `windowShape` samt `parseWeekdayMask` ein zweites
  // Mal über jedes Fenster, nur weil die Antwort aus zwei Teilen kommt.
  const windows = parseCleaningWindows(raw);
  const open = activeWindowIn(windows, now, tz);
  if (open) return { ...open, inDays: 0, isoDay: isoWeekdayInTZ(now, tz) };
  return nextWindowIn(windows, now, tz);
}

/**
 * Das nächste Reinigungs-Fenster, das nach `now` (Sub-Lokalzeit `tz`) BEGINNT — samt der Angabe, an
 * welchem Tag. null, wenn keine Fenster konfiguriert sind (= nicht zeitgebunden) oder keines je gilt.
 *
 * Läuft `now` gerade IN einem Fenster, liefert das trotzdem das darauffolgende: „aktuell offen"
 * beantwortet {@link activeCleaningWindow}, hier geht es um „wann wieder".
 *
 * **Erst heute, dann die kommenden Tage der Reihe nach** — dasselbe Vorgehen wie bei den
 * Wiege-Fenstern. Ein blosses „sonst das früheste der Liste" wäre seit den Wochentagen falsch: wer
 * freitagabends auf ein Werktags-Fenster schaut, bekäme „wieder ab 06:00", und das gilt erst am
 * Montag. Gezählt wird bis 7, nicht bis 6: liegt heute nur noch ein bereits verstrichenes Fenster,
 * ist der nächste Termin derselbe Wochentag in einer Woche.
 *
 * Der Wochentag wird dabei gerechnet ({@link isoDayPlus}) und nicht aus `now + inDays * 24h`
 * abgeleitet — Begründung dort.
 */
export function nextCleaningWindow(raw: unknown, now: Date, tz = APP_TZ): NextCleaningWindow | null {
  return nextWindowIn(parseCleaningWindows(raw), now, tz);
}

/** Dasselbe aus einer BEREITS GEPARSTEN Liste — dieselbe Aufteilung wie bei {@link activeWindowIn}
 *  und aus demselben Grund (siehe dort). */
function nextWindowIn(windows: CleaningWindows[], now: Date, tz: string): NextCleaningWindow | null {
  if (windows.length === 0) return null;
  const hhmm = hhmmInTZ(now, tz);
  const today = isoWeekdayInTZ(now, tz);
  const sorted = [...windows].sort((a, b) => a.start.localeCompare(b.start));
  for (let inDays = 0; inDays <= 7; inDays++) {
    const isoDay = isoDayPlus(today, inDays);
    const hit = sorted.find((f) => weekdayMaskHas(f.days, isoDay) && (inDays > 0 || f.start > hhmm));
    if (hit) return { ...hit, inDays, isoDay };
  }
  return null;
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
 *  windows = erlaubte Tages-Zeitfenster (leer = nicht zeitgebunden; `days` = Wochentags-Bitmaske
 *  aus `weekdays.ts`, Mo = Bit 0); windowOpenNow = aktuell offenes Fenster (until = dessen Ende
 *  HH:MM) oder null. */
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
