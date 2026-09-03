import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { APP_TZ, hhmmToMinutes, midnightInTZ, dateAtLocalMinutes, formatTime, clamp, randomInt } from "@/lib/utils";
import type { NumberRange } from "@/lib/constants";
import {
  NO_FIELDS_TO_UPDATE, INVALID_TIME, HHMM, AUTO_INSPECTION_PER_DAY_RANGE,
  AUTO_INSPECTION_DEADLINE_FROM_RANGE, AUTO_INSPECTION_DEADLINE_TO_RANGE,
  CLEANING_RELOCK_INSPECTION_DELAY, CLEANING_RELOCK_INSPECTION_DELAY_SLEEP, TIME_RANGE_INVALID,
  POST_LOCK_INSPECTION_DELAY_MIN_RANGE, POST_LOCK_INSPECTION_DELAY_MAX_RANGE,
  POST_LOCK_INSPECTION_DEADLINE_RANGE, heimdallEnabled,
} from "@/lib/constants";
import { generateKontrollCode } from "@/lib/utils";
import { GENUINELY_WITHDRAWN_WHERE, AUTO_PLAN_WHERE, todaysAutoPlanWhere, getIsLocked } from "@/lib/queries";
import {
  autoInspectionDayRulesProblem, fixedWindowMinutes, formatAutoInspectionDayRule,
  parseAutoInspectionDayRules, timesForDay, triggerWindowAllQuiet, type AutoInspectionDayRule,
} from "@/lib/autoKontrolleDayRules";
import { isoWeekdayInTZ, weekdayMaskHas, weekdayMaskKeys, weekdayMaskValid } from "@/lib/weekdays";
import type { Prisma } from "@prisma/client";
import { USER_NOT_PAUSED_WHERE, isHealthHoldActive } from "@/lib/healthHold";

/**
 * Automatische Kontrollen: pro Tag und Sub eine ZUFÄLLIGE Anzahl `x ∈ [perDayMin, perDayMax]` zufällig
 * verteilter Kontrollen (so weiß der Sub nicht, ob am Tagesende noch eine kommt). Die FRIST darf nicht ins
 * Schlaf-Fenster (RuheVon–RuheBis, CH-Lokalzeit) fallen; die Erfüllungsdauer ist je Kontrolle zufällig
 * in [FristVon, FristBis] Minuten. Die Zeilen werden vorab als KontrollAnforderung mit Zukunfts-
 * `wirksamAb` angelegt; der bestehende Minuten-Poller verschickt sie bei Fälligkeit.
 */

export interface AutoKontrolleSettings {
  aktiv: boolean;
  perDayMin: number; // Min-Anzahl Kontrollen/Tag
  perDayMax: number; // Max-Anzahl Kontrollen/Tag (< Min → als Min behandelt)
  ruheVon: string; // "HH:MM" Schlaf-Fenster Start
  ruheBis: string; // "HH:MM" Schlaf-Fenster Ende
  fristVon: number; // min Erfüllungsdauer (Min)
  fristBis: number; // max Erfüllungsdauer (Min)
  fensterVon: string; // "HH:MM" optionales festes Auslöse-Fenster Start ("" = aus)
  fensterBis: string; // "HH:MM" optionales festes Auslöse-Fenster Ende ("" = aus)
  nurBeiSperre: boolean; // true = nur zustellen, während eine aktive Sperrzeit läuft (Dispatch-Gate, nicht Planung)
  days: number; // Bitmaske der Wochentage, an denen überhaupt geplant wird (`weekdays.ts`)
  /** Die Tages-Ausnahmen, GEPARST. Anders als `CleaningSettings.windows`, das seinen JSON-String roh
   *  trägt: dort hängt eine Änderungs-Historie daran, deren Zeilen bitgleich die Spalte abbilden
   *  sollen. Hier gibt es keine, und die Leser wollen alle die Liste — sie fünfmal neu zu parsen
   *  (Planer, Schlaf-Frage, MCP-Sicht, Erfolgsmeldung, Regel-Seite) wäre Arbeit ohne Ertrag.
   *
   *  Preis: {@link planningChanged} kann für dieses eine Feld nicht mit `!==` vergleichen. */
  dayRules: AutoInspectionDayRule[];
  /** Kontrolle nach JEDEM erfassten Verschluss. Eigenständig — sie hängt weder an {@link aktiv} noch
   *  an {@link nurBeiSperre}, und sie kommt ZUSÄTZLICH zum Tagesplan (siehe
   *  {@link schedulePostLockInspection}). */
  postLockEnabled: boolean;
  postLockDelayMin: number; // frühestens X Min nach dem Erfassen
  postLockDelayMax: number; // spätestens Y Min nach dem Erfassen
  postLockDeadlineMinutes: number; // Erfüllungsfrist (fester Wert, keine Spanne)
  /** Verlangt die Verschluss-Kontrolle das Box-Foto zwingend? Wirkt NUR mit gemeldeter Box —
   *  die Frage beantwortet {@link boxPhotoRequiredForPostLock}, nicht dieses Feld allein. */
  postLockRequireBoxPhoto: boolean;
}

/** Wie {@link AutoKontrolleSettings}, aber `dayRules` roh von aussen (Formular, MCP-Argumente): die
 *  Liste wird geprüft und normalisiert, statt als fertiger String erwartet zu werden — dieselbe
 *  Aufteilung wie `SetCleaningParams.windows`. */
export type SetAutoKontrolleParams = Partial<Omit<AutoKontrolleSettings, "dayRules">> & {
  dayRules?: unknown;
};

/** Ein geplanter Slot auf der Tages-Achse (Instants, wie sie in der DB stehen). */
export interface AutoKontrolleSlot {
  wirksamAb: Date;
  deadline: Date;
}

/**
 * Ein Von/Bis-Paar aus den Einstellungen: beide Werte in ihre Grenzen geklemmt, und das „Bis" nie
 * unter dem „Von".
 *
 * Die Anhebung ist die eigentliche Aussage und der Grund, warum das EINE Funktion ist: ein Max unter
 * dem Min ist eine Fehleingabe, keine leere Spanne — `randomInt` bekäme sonst ein verkehrtes
 * Intervall. Drei Paare teilen die Regel (Anzahl/Tag, Erfüllungsdauer, Auslöse-Fenster nach dem
 * Verschluss); als drei Kopien wäre sie beim vierten an einer Stelle anders ausgefallen.
 */
function clampedPair(from: number, to: number, fromRange: NumberRange, toRange: NumberRange): { von: number; bis: number } {
  const von = clamp(from, fromRange);
  return { von, bis: Math.max(von, clamp(to, toRange)) };
}

/** Geklemmter Min-/Max-Anzahl-Bereich pro Tag. Eigene Schlüssel, weil hier Stückzahlen stehen und
 *  keine Zeitspanne — `min`/`max` liest sich an den Aufrufstellen richtiger als `von`/`bis`. */
function perDayRange(s: AutoKontrolleSettings): { min: number; max: number } {
  const { von, bis } = clampedPair(s.perDayMin, s.perDayMax, AUTO_INSPECTION_PER_DAY_RANGE, AUTO_INSPECTION_PER_DAY_RANGE);
  return { min: von, max: bis };
}

/** Geklemmter Erfüllungsdauer-Bereich in Minuten. */
function fristRange(s: AutoKontrolleSettings): { von: number; bis: number } {
  return clampedPair(s.fristVon, s.fristBis, AUTO_INSPECTION_DEADLINE_FROM_RANGE, AUTO_INSPECTION_DEADLINE_TO_RANGE);
}

/** Das Auslöse-Fenster der Verschluss-Kontrolle, in Minuten nach dem Erfassen. */
function postLockDelayRange(s: AutoKontrolleSettings): { von: number; bis: number } {
  return clampedPair(s.postLockDelayMin, s.postLockDelayMax, POST_LOCK_INSPECTION_DELAY_MIN_RANGE, POST_LOCK_INSPECTION_DELAY_MAX_RANGE);
}

/** Wach-Fenster (Komplement des Schlaf-Fensters) als zusammenhängender Block in Wanduhr-Minuten seit
 *  Mitternacht. `end` liegt über 1440, wenn das Wach-Fenster über Mitternacht reicht. Standard
 *  22–06 ⇒ [360, 1320] = 06:00–22:00. */
function awakeWindow(s: AutoKontrolleSettings): { start: number; end: number } {
  const start = hhmmToMinutes(s.ruheBis);
  let end = hhmmToMinutes(s.ruheVon);
  if (end <= start) end += 1440;
  return { start, end };
}

/**
 * Übersetzt zwischen Plan-Minuten und Instants — die Achse, auf der geplant wird.
 *
 * Basis ist der WACH-BEGINN als lokale Wanduhr, nicht die Mitternacht des Tages. Von Mitternacht aus
 * flach Minuten zu addieren verschöbe an den Umstellungstagen das ganze Wach-Fenster um eine Stunde
 * (die Wende liegt zwischen Mitternacht und Wach-Beginn). Ab `awakeStart` bleibt die Minuten-Arithmetik
 * flach — das hält die Slots streng monoton und überlappungsfrei, auch wenn ein exotisches Wach-Fenster
 * die DST-Lücke selbst enthält. Minuten über 1439 liegen im Nach-Mitternacht-Zipfel eines über
 * Mitternacht reichenden Wach-Fensters.
 *
 * `minuteOf` ist die exakte Umkehrung von `at` — beide MÜSSEN denselben Anker teilen, sonst bilden
 * die beiden Platzierer (`spreadOverDay`, `fillFreeGaps`) dieselbe Minute auf Instants ab, die an
 * einem Umstellungstag eine Stunde auseinanderliegen (überlappende Slots, Frist im Schlaf-Fenster).
 */
function minuteAxis(now: Date, awakeStart: number, tz: string): { at: (m: number) => Date; minuteOf: (d: Date) => number } {
  const awakeStartMs = dateAtLocalMinutes(now, awakeStart, tz).getTime();
  return {
    at: (m) => new Date(awakeStartMs + (m - awakeStart) * 60_000),
    minuteOf: (d) => awakeStart + Math.round((d.getTime() - awakeStartMs) / 60_000),
  };
}

/** Hebt einen „Bis"-Wert auf „Von" an, falls er darunter liegt (Von-/Bis-Paar-Konsistenz). */
function raiseMaxToMin(min: number | undefined, max: number): number {
  return min !== undefined && max < min ? min : max;
}

/** Liegt die Uhrzeit (Minuten seit Mitternacht, evtl. >1440 = Folgetag) im Schlaf-Fenster? Wrap-aware:
 *  RuheVon > RuheBis (z.B. 22:00–06:00) überspannt Mitternacht. */
export function isInQuietMinutes(vonMin: number, bisMin: number, min: number): boolean {
  const m = ((min % 1440) + 1440) % 1440;
  if (vonMin === bisMin) return false; // leeres Fenster
  return vonMin < bisMin ? m >= vonMin && m < bisMin : m >= vonMin || m < bisMin;
}

/** Nächster Schlaf-Beginn ≥ `trig` (+1440, wenn der heutige Schlaf-Beginn schon vor dem Trigger liegt
 *  — dann ist es der von morgen). Trigger sind vor Aufruf bereits als „nicht im Schlaf" gefiltert. */
function nextSleepStart(quietVon: number, trig: number): number {
  return quietVon > trig ? quietVon : quietVon + 1440;
}

/** Frist eines Fenster-Triggers: normal (`trig+dur`), aber am nächsten Schlaf-Beginn gekappt — so
 *  liegt weder Auslösung noch Frist je im Schlaf. null, wenn nach dem Kappen nicht mehr die volle
 *  Mindest-Frist (`fristVon`) bleibt: dann ist der Trigger zu nah am Schlaf und wird übersprungen.
 *  Damit hält JEDER erzeugte Fenster-Slot `dur ∈ [fristVon, fristBis]` — eine Kontrolle mit einer auf
 *  Minuten zusammengestauchten Frist wäre für den Sub nicht erfüllbar. Lieber kein Slot als einer,
 *  den er nicht schaffen kann. */
function windowDeadlineMin(trig: number, dur: number, quietVon: number, fristVon: number): number | null {
  const deadline = Math.min(trig + dur, nextSleepStart(quietVon, trig) - 1);
  return deadline - trig >= fristVon ? deadline : null;
}

/** Die Schlaf-Minuten INNERHALB eines nicht-wrappenden Fensters `[start, end)` — als belegte
 *  Intervalle, damit die Fenster-Fill-Logik dort keine Trigger platziert. Wrap-aware gegen das
 *  Schlaf-Fenster (`quietVon`/`quietBis`). */
function sleepBlocksWithin(win: { start: number; end: number }, quietVon: number, quietBis: number): { start: number; end: number }[] {
  if (quietVon === quietBis) return []; // kein Schlaf
  const sleep = quietVon < quietBis
    ? [{ start: quietVon, end: quietBis }]                          // 02:00–05:00
    : [{ start: quietVon, end: 1440 }, { start: 0, end: quietBis }]; // 22:00–06:00 (wrap)
  return sleep
    .map((s) => ({ start: Math.max(s.start, win.start), end: Math.min(s.end, win.end) }))
    .filter((s) => s.end > s.start);
}

/**
 * Würfelt zuerst eine Tages-Anzahl `x ∈ [perDayMin, perDayMax]` und erzeugt bis zu `x` Slots
 * `{ wirksamAb, deadline }` für den heutigen Tag. Nur Slots mit `wirksamAb > now` (Teiltag bei
 * Mittags-Start). Reine Funktion (Zufall injizierbar).
 *
 * OHNE festes Fenster: das Wach-Fenster (Komplement des Schlaf-Fensters) wird in `x` gleiche Segmente
 * geteilt; je Segment liegen Trigger UND Frist im Segment → keine Überlappung, Frist strikt vor dem
 * Schlaf-Beginn.
 *
 * MIT festem Fenster (`fensterVon`/`fensterBis`): die Auslösungen fallen ins Fenster (Trigger, die
 * doch ins Schlaf-Fenster fielen, werden übersprungen); die Frist läuft danach normal
 * (`fristVon..fristBis`) und darf übers Fensterende hinaus, wird aber am nächsten Schlaf-Beginn
 * gekappt. Die Zeit-Achse (`minuteAxis`, Anker Wach-Beginn) ist in beiden Zweigen dieselbe → DST-sicher.
 *
 * **Ein angebrochener Tag wird geplant wie ein frischer — nur über die Stunden, die übrig sind**
 * ({@link remainderOfDay}). Stand die Instanz über die Mitternacht des Trägers (ein Update etwa),
 * fällt der Wurf mitten in den Tag; `spreadOverDay` legt seine Segmente dann ab JETZT statt ab
 * Bereichs-Beginn. Vorher lagen sie über dem ganzen Tag, die des Vormittags waren vorbei und fielen
 * weg — so kam der verspätet geplante Tag auf null Kontrollen, während der Tages-Merker ihn als
 * erledigt stempelte.
 *
 * Die Anzahl ist dabei ANTEILIG zur Rest-Zeit, nicht die volle Tages-Anzahl: die gehört zum ganzen
 * Tag. Sie in vier Stunden zu drängen, verwandelte einen Neustart in einen Schwall — und ein
 * Einschalten um 21:00 in ein Trommelfeuer. Aufgerundet wird, damit ein spät begonnener Tag nicht
 * doch wieder an der Rundung verstummt; ganz ohne Platz bleibt er leer, denn erfunden wird keiner.
 *
 * **Warum nicht `fillFreeGaps`**, das ja genau „ab jetzt" füllt und dem Neuwurf dient: es hält
 * Auslösung UND Frist in derselben Lücke, weil es an zugestellten Kontrollen vorbei planen muss.
 * Bei festem Auslöse-Fenster ist das zu streng — dort darf die Frist übers Fensterende hinaus und
 * wird erst am Schlaf-Beginn gekappt. Ein Fenster bis 16:00 mit Mindest-Frist 60 gäbe ab 15:01
 * sonst gar nichts mehr, obwohl eine Auslösung um 15:30 mit Frist bis 17:00 völlig in Ordnung ist.
 * Ein Differenz-Test über rund 92 000 Kombinationen hat genau das gefunden: 593 Fälle, in denen
 * dieselben Einstellungen mit `fillFreeGaps` verstummten. Der Tagesplan braucht keine Rücksicht auf
 * Zugestelltes — an dieser Stelle ist noch nichts zugestellt.
 */
export function generateAutoKontrollen(
  settings: AutoKontrolleSettings,
  now: Date,
  rand: () => number = Math.random,
  tz: string = APP_TZ,
): AutoKontrolleSlot[] {
  const { min, max } = perDayRange(settings);
  if (max <= 0) return [];
  // Anzahl zufällig aus [min, max] (min == max → fixe Anzahl, wie bisher).
  const { from, count } = remainderOfDay(randomInt(min, max, rand), settings, now, tz);
  return spreadOverDay(settings, now, count, rand, tz, from);
}

/**
 * Die Planungs-Achse eines Tages: die Minuten-Umrechnung plus der Bereich, in dem eine Auslösung
 * überhaupt liegen darf. Beides hängt an denselben drei Zeilen, und alle Planungs-Schritte brauchen
 * sie zusammen — als drei Aufrufe standen sie in drei Funktionen wörtlich untereinander.
 */
function planAxis(settings: AutoKontrolleSettings, now: Date, tz: string) {
  const awake = awakeWindow(settings);
  return { ...minuteAxis(now, awake.start, tz), ...triggerDomain(settings, awake), awake };
}

/**
 * Was von einem angebrochenen Tag noch zu planen ist: **ab welcher Minute**, und **wie viele**.
 *
 * `from` ist die erste Minute, in der eine Auslösung noch liegen darf. Solange der Bereichs-Beginn
 * nicht in der Vergangenheit liegt, ist es dieser Beginn — ein frischer Tag bekommt also Minute für
 * Minute denselben Bereich wie bisher. Erst danach rückt `from` auf die nächste volle Minute.
 *
 * Das `>=` ist dabei nicht kosmetisch: fällt der Bereichs-Beginn GENAU auf `now` (ein Fenster ab
 * 00:00 und der Poller-Tick zur Mitternacht), verschöbe ein `>` die ganze Segmentierung um eine
 * Minute gegenüber dem Bestand. Verloren geht dabei höchstens eine Auslösung, die auf genau diese
 * Minute gewürfelt wird — die verwarf der Platzierer aber schon immer.
 *
 * `count` ist die Tages-Anzahl, anteilig zur verbleibenden FREIEN Zeit — nicht zur blossen Spanne:
 * liegt ein Schlaf-Block in einem festen Auslöse-Fenster, ist er für beide Seiten des Bruchs keine
 * Zeit, in der geplant werden könnte.
 *
 * ABGERUNDET, und zwar zwingend: der Platzierer teilt die Rest-Zeit in `count` Segmente, und
 * abgerundet ist ein Segment nie kleiner als am frischen Tag (`Rest/⌊x·Rest/ganz⌋ ≥ ganz/x`).
 * Aufgerundet wäre es minimal kleiner — und schon das lässt eine knapp bemessene Einstellung
 * kippen: bei acht Kontrollen zwischen 06:00 und 22:00 mit Mindest-Frist 120 misst ein Segment
 * 119,9 Minuten, ein Wurf um 06:14 machte daraus 118, und der Platzierer verwarf den ganzen Tag.
 *
 * MINDESTENS EINE, solange überhaupt Zeit übrig ist: sonst verstummte ein spät begonnener Tag doch
 * wieder an der Rundung — genau der Ausgang, gegen den diese Funktion gebaut wurde. Nur DIESE eine
 * darf enger liegen als ein Tages-Segment; die Mindest-Frist prüft der Platzierer weiterhin selbst,
 * und reicht die Zeit auch dafür nicht, bleibt der Tag leer.
 */
function remainderOfDay(
  x: number, settings: AutoKontrolleSettings, now: Date, tz: string,
): { from: number; count: number } {
  const { at, minuteOf, lower, upper, occupied } = planAxis(settings, now, tz);
  const from = at(lower).getTime() >= now.getTime() ? lower : Math.max(lower, minuteOf(now) + 1);
  const freeFrom = (m: number) => freeGaps(m, upper, occupied).reduce((sum, g) => sum + gapLen(g), 0);
  const whole = freeFrom(lower);
  const rest = freeFrom(from);
  // Ein Anteil über 1 ist nicht bloss unerwünscht, er ist unerreichbar: `from` liegt nie unter
  // `lower`, die freie Zeit darüber ist damit eine Teilmenge. Deshalb kein `Math.min(1, …)`.
  // `x <= 0` muss durchfallen: ein Tag, der bewusst auf NULL Kontrollen gewürfelt wurde, darf hier
  // nicht wieder eine bekommen. Die Untergrenze gilt dem Anteil, nicht der Auslosung.
  if (x <= 0 || whole <= 0 || rest <= 0) return { from, count: 0 };
  return { from, count: Math.max(1, Math.floor(x * (rest / whole))) };
}

/**
 * Verteilt `x` Slots über den Auslöse-Bereich AB `from`: je ein gleich grosses Segment pro Slot.
 * Der Platzierer des Tagesplans.
 *
 * `from` ist die erste Minute, die benutzt werden darf. Zur Mitternacht des Trägers ist das der
 * Bereichs-Beginn, und dann liegen die Segmente wie eh und je über dem ganzen Tag. Fällt der Wurf
 * mitten in den Tag, sind es dieselben Segmente über weniger Zeit — die Anzahl kommt anteilig aus
 * {@link remainderOfDay}, sonst wären sie zu eng für die Mindest-Frist. Ohne `from` fielen die
 * vergangenen Segmente einfach weg, und der Tag bliebe leer.
 *
 * `pushIfFuture` bleibt trotzdem stehen: `from` rechnet in ganzen Minuten, die Zusicherung „keine
 * Auslösung in der Vergangenheit" gilt aber auf den Instant.
 */
function spreadOverDay(
  settings: AutoKontrolleSettings,
  now: Date,
  x: number,
  rand: () => number,
  tz: string,
  from: number,
): AutoKontrolleSlot[] {
  if (x <= 0) return [];
  const { von: fristVon, bis: fristBis } = fristRange(settings);

  const { start: awakeStart, end: awakeEnd } = awakeWindow(settings);
  if (awakeEnd - awakeStart <= 0) return [];

  const out: AutoKontrolleSlot[] = [];
  const { at: atMinute } = minuteAxis(now, awakeStart, tz);
  const pushIfFuture = (trig: number, deadlineMin: number) => {
    const wirksamAb = atMinute(trig);
    if (wirksamAb.getTime() > now.getTime()) out.push({ wirksamAb, deadline: atMinute(deadlineMin) });
  };

  const fixed = fixedWindowMinutes(settings);
  if (fixed) {
    // Festes Auslöse-Fenster: `x` Trigger übers Fenster verteilt (ein Segment je Trigger), Schlaf
    // übersprungen, Frist am Schlaf-Beginn gekappt.
    const quietVon = hhmmToMinutes(settings.ruheVon);
    const quietBis = hhmmToMinutes(settings.ruheBis);
    const winStart = Math.max(fixed.start, from);
    if (fixed.end <= winStart) return out;
    const segSize = (fixed.end - winStart) / x;
    for (let i = 0; i < x; i++) {
      const triggerMin = Math.ceil(winStart + i * segSize);
      const triggerMax = Math.floor(winStart + (i + 1) * segSize) - 1; // Trigger vor Segmentende → verteilt
      if (triggerMax < triggerMin) continue; // Segment < 1 Min → überspringen
      const trig = randomInt(triggerMin, triggerMax, rand);
      if (isInQuietMinutes(quietVon, quietBis, trig)) continue; // nie im Schlaf wecken
      const deadlineMin = windowDeadlineMin(trig, randomInt(fristVon, fristBis, rand), quietVon, fristVon);
      if (deadlineMin !== null) pushIfFuture(trig, deadlineMin);
    }
    return out;
  }

  // Ohne festes Fenster (Bestand): Trigger UND Frist je Segment → keine Überlappung, Frist strikt vor
  // awakeEnd (= Schlaf-Start). In GANZZAHL-Minuten (keine Float-/Rundungs-Kanten).
  const spreadStart = Math.max(awakeStart, from);
  if (awakeEnd - spreadStart <= 0) return out;
  const segSize = (awakeEnd - spreadStart) / x;
  // Die Segment-Kappung darf die Mindest-Frist NICHT unterlaufen. Vorher stand unten `Math.max(1, …)`,
  // was in einem engen Wach-Fenster Slots mit 1-Minuten-Frist erzeugte — für den Sub unerfüllbar.
  // Lieber kein Slot als einer, den er nicht schaffen kann. Die Prüfung steht VOR der Schleife, weil `segSize` über alle
  // Segmente konstant ist: passt `fristVon` in eines nicht, passt es in keines. (Im Fenster-Zweig
  // muss `windowDeadlineMin` dagegen je Trigger entscheiden — dort kappt der Schlaf-Beginn, nicht
  // die Segmentgrösse.)
  const maxDur = Math.floor(segSize);
  if (maxDur < fristVon) return out;
  for (let i = 0; i < x; i++) {
    const segStart = spreadStart + i * segSize;
    const segEnd = spreadStart + (i + 1) * segSize;
    const dur = Math.min(randomInt(fristVon, fristBis, rand), maxDur);
    const triggerMin = Math.ceil(segStart);
    const triggerMax = Math.min(Math.floor(segEnd - dur), awakeEnd - 1 - dur); // Frist ≤ awakeEnd−1
    if (triggerMax < triggerMin) continue; // Segment zu klein → überspringen
    const trig = randomInt(triggerMin, triggerMax, rand);
    pushIfFuture(trig, trig + dur);
  }
  return out;
}

/** Länge eines Intervalls `[start, end]`. */
const gapLen = ([start, end]: [number, number]) => end - start;

/** Freie Intervalle in `[lower, upper]` nach Abzug der belegten Slots, aufsteigend. */
function freeGaps(lower: number, upper: number, occupied: { start: number; end: number }[]): [number, number][] {
  const gaps: [number, number][] = [];
  let cursor = lower;
  for (const o of [...occupied].sort((a, b) => a.start - b.start)) {
    if (o.end <= cursor) continue;
    if (o.start > cursor) gaps.push([cursor, Math.min(o.start, upper)]);
    cursor = o.end;
    if (cursor >= upper) break;
  }
  if (cursor < upper) gaps.push([cursor, upper]);
  return gaps.filter(([a, b]) => b > a);
}

/** Wohin ein Trigger überhaupt darf: das feste Auslöse-Fenster, sonst das Wach-Fenster. `occupied`
 *  sind die von vornherein belegten Intervalle darin (Schlaf innerhalb eines festen Fensters). */
function triggerDomain(
  settings: AutoKontrolleSettings, awake: { start: number; end: number },
): { lower: number; upper: number; occupied: { start: number; end: number }[] } {
  const fixed = fixedWindowMinutes(settings);
  // Ohne festes Fenster endet der Bereich eine Minute VOR dem Schlaf-Beginn: `awakeEnd` ist bereits
  // die erste Schlaf-Minute, eine Frist genau darauf läge im Schlaf. `spreadOverDay` rechnet mit
  // derselben Grenze (`awakeEnd - 1 - dur`).
  if (!fixed) return { lower: awake.start, upper: awake.end - 1, occupied: [] };
  return {
    lower: fixed.start,
    upper: fixed.end,
    occupied: sleepBlocksWithin(fixed, hhmmToMinutes(settings.ruheVon), hhmmToMinutes(settings.ruheBis)),
  };
}

/**
 * Platziert `count` Slots in die freien Lücken des Trigger-Bereichs — an den `taken`-Kontrollen
 * vorbei, die weder verschoben noch überlappt werden dürfen (heute: die dem Sub bereits zugestellten).
 * Gefüllt wird immer die GRÖSSTE Lücke, bis keine mehr für die Mindest-Frist reicht.
 *
 * Anders als {@link spreadOverDay} füllt es ab JETZT (`minuteOf(now) + 1`) statt über den ganzen Tag —
 * das macht es zum Platzierer für alles, was mitten am Tag geplant wird.
 *
 * Trigger UND Frist bleiben in derselben Lücke — bewusst konservativer als {@link spreadOverDay}, das
 * im Fenster-Fall die Frist bis zum Schlaf-Beginn ziehen darf. Der Unterschied betrifft die letzte
 * Fenster-Minute, verhindert aber jede Überlappung mit dem nächsten Slot. Schlaf-Blöcke im Fenster
 * zählen als belegt → dort landet nie ein Trigger, und weil die Lücke am Schlaf-Block endet, liegt
 * auch die Frist nie im Schlaf.
 *
 * Reine Funktion (Zufall injizierbar). Die Achse ist dieselbe wie in {@link spreadOverDay} (Anker
 * Wach-Beginn), sonst lägen gefüllte und geplante Slots an einem Umstellungstag eine Stunde auseinander.
 */
export function fillFreeGaps(
  settings: AutoKontrolleSettings,
  taken: AutoKontrolleSlot[],
  count: number,
  now: Date,
  rand: () => number,
  tz: string,
): AutoKontrolleSlot[] {
  if (count <= 0) return [];
  const { von: fristVon, bis: fristBis } = fristRange(settings);
  const { at, minuteOf, lower, upper, occupied: domainOccupied } = planAxis(settings, now, tz);
  const occupied = [
    ...taken.map((t) => ({ start: minuteOf(t.wirksamAb), end: minuteOf(t.deadline) })),
    ...domainOccupied,
  ];

  const out: AutoKontrolleSlot[] = [];
  let gaps = freeGaps(Math.max(lower, minuteOf(now) + 1), upper, occupied);
  for (let i = 0; i < count; i++) {
    if (gaps.length === 0) break;
    const best = gaps.reduce((bi, g, gi) => (gapLen(g) > gapLen(gaps[bi]) ? gi : bi), 0);
    if (gapLen(gaps[best]) < fristVon) break; // kein Platz mehr
    const [gapStart, gapEnd] = gaps[best];
    const dur = Math.min(randomInt(fristVon, fristBis, rand), gapEnd - gapStart);
    const trig = randomInt(gapStart, gapEnd - dur, rand);
    out.push({ wirksamAb: at(trig), deadline: at(trig + dur) });
    gaps.splice(best, 1, [gapStart, trig], [trig + dur, gapEnd]);
    gaps = gaps.filter(([a, b]) => b > a);
  }
  return out;
}

/** Die Auto-Kontroll-Spalten einer User-Zeile — die Rohform von {@link AutoKontrolleSettings}. */
export interface AutoKontrolleUserFields {
  autoKontrolleAktiv: boolean; autoKontrollePerDayMin: number; autoKontrollePerDayMax: number;
  autoKontrolleRuheVon: string; autoKontrolleRuheBis: string;
  autoKontrolleFristVon: number; autoKontrolleFristBis: number;
  autoKontrolleFensterVon: string; autoKontrolleFensterBis: string;
  autoKontrolleNurBeiSperre: boolean;
  autoKontrolleDays: number;
  autoKontrolleDayRules: string | null;
  postLockInspectionEnabled: boolean;
  postLockInspectionDelayMin: number; postLockInspectionDelayMax: number;
  postLockInspectionDeadlineMinutes: number;
  postLockInspectionRequireBoxPhoto: boolean;
}

/** Eine User-Zeile, wie sie {@link AUTO_KONTROLLE_SETTINGS_SELECT} lädt: Settings plus die Identität
 *  und der Merker, für welchen Tag zuletzt gewürfelt wurde. AUS dem Select abgeleitet statt daneben
 *  gepflegt — sonst driften Spaltenliste und Typ auseinander, ohne dass es jemand merkt. */
export type AutoKontrolleUser = Prisma.UserGetPayload<{ select: typeof AUTO_KONTROLLE_SETTINGS_SELECT }>;

/** Liest die Auto-Kontroll-Settings aus einer User-Zeile. */
export function autoKontrolleSettingsFromUser(u: AutoKontrolleUserFields): AutoKontrolleSettings {
  return {
    aktiv: u.autoKontrolleAktiv,
    perDayMin: u.autoKontrollePerDayMin,
    perDayMax: u.autoKontrollePerDayMax,
    ruheVon: u.autoKontrolleRuheVon,
    ruheBis: u.autoKontrolleRuheBis,
    fristVon: u.autoKontrolleFristVon,
    fristBis: u.autoKontrolleFristBis,
    fensterVon: u.autoKontrolleFensterVon,
    fensterBis: u.autoKontrolleFensterBis,
    nurBeiSperre: u.autoKontrolleNurBeiSperre,
    days: u.autoKontrolleDays,
    dayRules: parseAutoInspectionDayRules(u.autoKontrolleDayRules),
    postLockEnabled: u.postLockInspectionEnabled,
    postLockDelayMin: u.postLockInspectionDelayMin,
    postLockDelayMax: u.postLockInspectionDelayMax,
    postLockDeadlineMinutes: u.postLockInspectionDeadlineMinutes,
    postLockRequireBoxPhoto: u.postLockInspectionRequireBoxPhoto,
  };
}

/**
 * Dieselben Einstellungen in MCP-Sprache — die Sicht, die `get_context.autoInspections` liefert und
 * gegen die `set_auto_inspections` seinen Diff zeigt. Hier neben {@link autoKontrolleSettingsFromUser}
 * statt im MCP-Lese-Modul, damit die Schreib-Seite dafür nicht die Lese-Seite importieren muss
 * (dieselbe Aufteilung wie `buildCleaningView` in `cleaningService`).
 *
 * `type` statt `interface`: nur ein Alias trägt die implizite Index-Signatur, die `diffFields`
 * (Record<string, unknown>) auf der Schreib-Seite verlangt.
 */
export type AutoInspectionsView = {
  active: boolean;
  perDayMin: number;
  perDayMax: number;
  sleepFrom: string;
  sleepUntil: string;
  deadlineMinFrom: number;
  deadlineMinTo: number;
  triggerWindowFrom: string | null;
  triggerWindowUntil: string | null;
  onlyDuringLockPeriod: boolean;
  /** An welchen Wochentagen überhaupt geplant wird: „daily" oder „mon,tue,…". */
  planDays: string;
  /** Die Tages-AUSNAHMEN, je eine Zeile („tue quiet 19:00-06:00"). Leer = überall der Grundstand.
   *  Als Zeilen statt als Objekte, aus demselben Grund wie bei den Reinigungs-Fenstern: der Diff
   *  soll die ganze alte gegen die ganze neue Liste zeigen, und Objekte liest dort niemand. */
  dayRules: string[];
  /** Kontrolle nach JEDEM erfassten Verschluss — eigenständig vom Tagesplan (`active`) und von
   *  `onlyDuringLockPeriod`. Eingeschaltet übernimmt sie auch den Reinigungs-Wiederverschluss. */
  postLockEnabled: boolean;
  postLockDelayMin: number;
  postLockDelayMax: number;
  postLockDeadlineMinutes: number;
  /** Box-Foto bei DIESER Kontrolle Pflicht statt freiwillig — ohne gemeldete Box wirkungslos. */
  postLockRequireBoxPhoto: boolean;
};

/** Domänen-Settings → {@link AutoInspectionsView}. EINE Übersetzung für die Lese-Seite (get_context)
 *  UND die Schreib-Seite (set_auto_inspections mit Preview/Diff) — sonst zeigte der Diff eines
 *  Schreibvorgangs andere Feldnamen als die Sicht, gegen die der Agent ihn liest. */
export function autoInspectionsView(s: AutoKontrolleSettings): AutoInspectionsView {
  return {
    active: s.aktiv,
    perDayMin: s.perDayMin,
    perDayMax: s.perDayMax,
    sleepFrom: s.ruheVon,
    sleepUntil: s.ruheBis,
    deadlineMinFrom: s.fristVon,
    deadlineMinTo: s.fristBis,
    // K-17: "" = kein Fenster → null (ehrlicher als ein leerer String neben echten "HH:MM"-Werten).
    triggerWindowFrom: s.fensterVon || null,
    triggerWindowUntil: s.fensterBis || null,
    onlyDuringLockPeriod: s.nurBeiSperre,
    planDays: weekdayMaskKeys(s.days),
    dayRules: s.dayRules.map(formatAutoInspectionDayRule),
    postLockEnabled: s.postLockEnabled,
    postLockDelayMin: s.postLockDelayMin,
    postLockDelayMax: s.postLockDelayMax,
    postLockDeadlineMinutes: s.postLockDeadlineMinutes,
    postLockRequireBoxPhoto: s.postLockRequireBoxPhoto,
  };
}

/** Die User-Spalten, aus denen `autoKontrolleSettingsFromUser` die Settings baut — plus Identität,
 *  Zeitzone und den Tages-Merker, die zusammen die Tagesplanung entscheiden.
 *  Exportiert, damit ein Aufrufer ausserhalb (Poller) dieselben Felder lädt, statt sie abzuschreiben. */
export const AUTO_KONTROLLE_SETTINGS_SELECT = {
  id: true, timezone: true, autoKontrolleAktiv: true, autoKontrollePerDayMin: true, autoKontrollePerDayMax: true,
  autoKontrolleRuheVon: true, autoKontrolleRuheBis: true,
  autoKontrolleFristVon: true, autoKontrolleFristBis: true,
  autoKontrolleFensterVon: true, autoKontrolleFensterBis: true,
  autoKontrolleNurBeiSperre: true, autoKontrolleDays: true, autoKontrolleDayRules: true,
  autoInspectionPlannedFor: true,
  postLockInspectionEnabled: true, postLockInspectionDelayMin: true, postLockInspectionDelayMax: true,
  postLockInspectionDeadlineMinutes: true, postLockInspectionRequireBoxPhoto: true,
} as const;

/** Die Felder, an denen der TAGESPLAN hängt: ändert sich eines, wird der Tag neu gewürfelt.
 *  `autoKontrolleNurBeiSperre` steht bewusst NICHT hier — es entscheidet erst bei Fälligkeit über die
 *  Zustellung und lässt die Planung unberührt. */
const PLANNING_FIELDS = [
  "autoKontrolleAktiv", "autoKontrollePerDayMin", "autoKontrollePerDayMax",
  "autoKontrolleRuheVon", "autoKontrolleRuheBis",
  "autoKontrolleFristVon", "autoKontrolleFristBis",
  "autoKontrolleFensterVon", "autoKontrolleFensterBis",
  // Beide sind Planung: die Maske entscheidet, OB der Tag geplant wird, die Ausnahmen, WANN.
  "autoKontrolleDays", "autoKontrolleDayRules",
] as const satisfies readonly (keyof AutoKontrolleUserFields)[];

/** Jede Auto-Kontroll-Einstellung ist entweder Planung oder bewusst keine — wer eine neue hinzufügt,
 *  muss sich hier entscheiden, sonst nennt der Compiler sie beim Namen. Ohne diese Zeile fiele ein
 *  vergessenes Feld LAUTLOS aus dem Neuwurf: es speichert und wirkt, nur eben erst am nächsten Tag.
 *  Das ist die einzige der zehn Feld-Listen dieses Moduls, deren Lücke man nicht sofort sieht. */
type AssertNever<T extends never> = T;
type _AllSettingsClassified = AssertNever<
  Exclude<
    keyof AutoKontrolleUserFields,
    (typeof PLANNING_FIELDS)[number] | "autoKontrolleNurBeiSperre"
    | "postLockInspectionEnabled" | "postLockInspectionDelayMin"
    | "postLockInspectionDelayMax" | "postLockInspectionDeadlineMinutes"
    | "postLockInspectionRequireBoxPhoto"
  >
>;

/** Dieselbe Grenze auf der Settings-Sicht — und mit derselben Zusicherung versehen, damit die beiden
 *  Listen nicht auseinanderlaufen können. Wer nur die Spalten-Liste pflegte, bekäme hier den Compiler. */
const PLANNING_SETTINGS = [
  "aktiv", "perDayMin", "perDayMax", "ruheVon", "ruheBis", "fristVon", "fristBis", "fensterVon", "fensterBis",
  "days", "dayRules",
] as const satisfies readonly (keyof AutoKontrolleSettings)[];
// Die Verschluss-Kontrolle steht bewusst NICHT in `PLANNING_SETTINGS`: sie hat keinen Tagesplan, den
// ein Wechsel neu zu würfeln zwänge — sie entsteht erst mit dem nächsten Verschluss. Stünde sie drin,
// löste das Umstellen einer Frist einen Neuwurf des ganzen Tages aus.
type _AllSettingsViewClassified = AssertNever<
  Exclude<
    keyof AutoKontrolleSettings,
    (typeof PLANNING_SETTINGS)[number] | "nurBeiSperre"
    | "postLockEnabled" | "postLockDelayMin" | "postLockDelayMax" | "postLockDeadlineMinutes"
    | "postLockRequireBoxPhoto"
  >
>;

/** Würde dieser Übergang den Tagesplan neu würfeln? Die Frage beantwortet sonst nur
 *  {@link setAutoKontrolleSettings} für sich selbst; ein Aufrufer, der sein Ergebnis BESCHREIBEN will
 *  (MCP `set_auto_inspections`), soll die Liste nicht ungeprüft abschreiben müssen. */
export function planningChanged(before: AutoKontrolleSettings, after: AutoKontrolleSettings): boolean {
  // `dayRules` ist als einziges Feld eine LISTE — `!==` wäre dort immer wahr und meldete jedem
  // Speichern einen Neuwurf, den es nicht gab. Verglichen wird deshalb ihr Inhalt; die Reihenfolge
  // zählt dabei mit, und das ist richtig: sie IST die Rangfolge der Regeln.
  return PLANNING_SETTINGS.some((k) => (k === "dayRules"
    ? JSON.stringify(before[k]) !== JSON.stringify(after[k])
    : before[k] !== after[k]));
}

/** Legt Auto-Kontroll-Zeilen für die gegebenen Slots an (frischer Code je Zeile, benachrichtigtAt=null).
 *  `extra` trägt die HERKUNFT (`cleaningRelock` bzw. `postLock`) — die eine Stelle, an der eine Auto-Zeile
 *  entsteht, bleibt damit auch die eine Stelle, die weiss, wie eine Auto-Zeile aussieht. */
async function createAutoKontrollen(
  userId: string,
  slots: { wirksamAb: Date; deadline: Date }[],
  extra: { cleaningRelock?: boolean; postLock?: boolean; requireBoxPhoto?: boolean } = {},
): Promise<number> {
  if (slots.length === 0) return 0;
  await prisma.kontrollAnforderung.createMany({
    data: slots.map((s) => ({
      userId, code: generateKontrollCode(), deadline: s.deadline, wirksamAb: s.wirksamAb,
      benachrichtigtAt: null, auto: true, ...extra,
    })),
  });
  return slots.length;
}

// ── Kontrolle nach einem Wiederverschluss, der eine Reinigungspause beendet ───

/** Liegt `at` im Schlaf-Fenster der Sub? Die Wanduhr-Minute kommt aus dem Zeitzonen-Formatter, nicht
 *  aus Minuten-Arithmetik ab einem Anker: hier wird EIN Zeitpunkt beurteilt, kein Plan aufgespannt,
 *  und die Formatierung ist auch an Umstellungstagen exakt (siehe `minuteAxis` für den Plan-Fall). */
export function isSleepingAt(settings: AutoKontrolleSettings, at: Date, tz: string): boolean {
  // Die Tages-Ausnahme gilt auch hier: schläft der Träger dienstags ab 19 Uhr, darf ihn die
  // Wiederverschluss-Kontrolle dienstags um 20 Uhr genauso wenig wecken wie eine geplante.
  //
  // Der RUHETAG dagegen nicht — deshalb `timesForDay` statt {@link settingsForDay}. Er stellt den
  // Tagesplan frei; die Kontrolle nach einer Reinigungspause ist keine geplante, sondern die
  // Antwort auf eine Handlung des Trägers (feste Regel, keine Einstellung). Sie an den Ruhetagen
  // mit abzuschalten hiesse, sich an genau den Tagen selbst öffnen zu können, an denen niemand
  // hinsieht.
  const today = timesForDay(settings, settings.dayRules, isoWeekdayInTZ(at, tz));
  return isInQuietMinutes(
    hhmmToMinutes(today.ruheVon), hhmmToMinutes(today.ruheBis),
    hhmmToMinutes(formatTime(at, "de-CH", tz)),
  );
}

/**
 * Die Verzögerung einer Kontrolle, die auf eine HANDLUNG des Trägers antwortet — und die Antwort auf
 * die Frage, ob sie in seinen Schlaf fällt.
 *
 * Erst mit der gewünschten Spanne rechnen, dann prüfen, wo sie landet: fällt die Handlung ODER die
 * daraus errechnete Auslösung ins Schlaf-Fenster, rückt die Auslösung näher heran.
 *
 * „Näher" ist dabei wörtlich zu nehmen und der Grund für das `Math.min`: die kurze Spanne ERSETZT
 * die gewünschte nicht, sie deckelt sie. Bei der festen Reinigungs-Regel (15–45 gegen 5–15) fällt
 * beides zusammen, weil die kurze immer darunter liegt. Die Verschluss-Kontrolle ist aber frei
 * einstellbar: bei 1–2 Minuten wäre ein Neuwurf aus 5–15 ein Schritt TIEFER in den Schlaf hinein —
 * die Schonung hätte den Träger später geweckt als die Einstellung, die sie schonen sollte.
 *
 * Ein zweiter Durchgang genügt damit weiterhin: die neue Verzögerung ist nie grösser als die, deren
 * Landung geprüft wurde, kann also nicht aus dem Fenster herausfallen, in das jene fiel.
 *
 * Beide Verschluss-Regeln teilen das Zeichen für Zeichen; sie unterscheiden sich nur in der Spanne,
 * die sie hineingeben. Als zwei Kopien war die Zwei-Schritt-Ordnung zweimal zu verstehen und einmal
 * zu ändern vergessen.
 */
function delayAnsweringAnAction(
  settings: AutoKontrolleSettings, spanne: { von: number; bis: number }, now: Date, tz: string, rand: () => number,
): { verzoegerung: number; imSchlaf: boolean } {
  const gewuenscht = randomInt(spanne.von, spanne.bis, rand);
  const imSchlaf =
    isSleepingAt(settings, now, tz) ||
    isSleepingAt(settings, new Date(now.getTime() + gewuenscht * 60_000), tz);
  return {
    imSchlaf,
    verzoegerung: imSchlaf
      ? Math.min(gewuenscht, randomInt(CLEANING_RELOCK_INSPECTION_DELAY_SLEEP.min, CLEANING_RELOCK_INSPECTION_DELAY_SLEEP.max, rand))
      : gewuenscht,
  };
}

/** Was {@link scheduleCleaningRelockInspection} geplant hat (null = nichts geplant). */
export interface CleaningRelockPlan {
  /** Wann die Kontrolle ausgelöst (= dem Sub zugestellt) wird. */
  wirksamAb: Date;
  deadline: Date;
  /** Die Kontrolle landet im Schlaf-Fenster: kurze Verzögerung, keine Eskalationsstufe 2. */
  imSchlaf: boolean;
  /** Die geplante Auto-Kontrolle, die sie ersetzt hat — null, wenn keine mehr offen war. */
  ersetzteId: string | null;
}

/**
 * Plant die Kontrolle NACH einem Wiederverschluss, der eine Reinigungspause beendet: „du hast dich
 * gerade selbst geöffnet — zeig mir, dass du wieder drin bist."
 *
 * - Verzögerung {@link CLEANING_RELOCK_INSPECTION_DELAY} (15–45 min), damit der Beleg nicht direkt an
 *   die Reinigung anschliesst; Frist wie bei jeder Auto-Kontrolle zufällig aus [fristVon, fristBis].
 * - Sie ERSETZT die nächste noch nicht zugestellte Auto-Kontrolle des Tages (die Tagesanzahl bleibt
 *   damit gleich). Ist keine mehr offen, wird sie trotzdem ausgelöst — der Anlass zählt, nicht das
 *   Kontingent. Eine bereits ZUGESTELLTE lässt sich nicht ersetzen: der Sub kennt sie schon.
 * - Landet die Kontrolle im Schlaf-Fenster, gilt die kurze Verzögerung
 *   ({@link CLEANING_RELOCK_INSPECTION_DELAY_SLEEP}, 5–15 min — der Sub ist beim Wiederverschluss ja
 *   ohnehin wach), und die Eskalation bleibt bei der Mahnung stehen: Stufe 2 (die einen
 *   AUTO_ENTFERNT-Eintrag schreibt und damit die laufende Session beendet) fällt aus. „Im
 *   Schlaf-Fenster" heisst hier: der Wiederverschluss ODER die daraus errechnete Auslösung liegt
 *   darin — eine Auslösung um 23:10 ist eine Nacht-Kontrolle, auch wenn der Verschluss um 22:55
 *   knapp davor lag. Der Verzicht auf Stufe 2 steht NICHT in der Zeile: der Poller leitet ihn beim
 *   Eskalieren aus `cleaningRelock` + {@link isSleepingAt} ab, damit ein verschobenes Schlaf-Fenster
 *   sofort gilt statt gegen einen beim Anlegen eingefrorenen Wert zu laufen.
 *
 * Folgt dem Hauptschalter der Automatik (`aktiv`); die Einstellung „nur während Sperrzeit" gilt
 * bewusst NICHT (der Anlass ist die Reinigung selbst — siehe `cleaningRelock` im Poller).
 * Ausgelöst wird das am SELBST-Erfassungs-Pfad des Subs (POST /api/entries); eine nachträgliche
 * Admin-Korrektur plant nichts (sie liegt in der Vergangenheit, siehe dort).
 * Fire-and-forget vom Aufrufer, deshalb wirft die Funktion nicht in den Request zurück.
 */
export async function scheduleCleaningRelockInspection(
  userId: string, now: Date = new Date(), rand: () => number = Math.random,
): Promise<CleaningRelockPlan | null> {
  // Gesundheits-Halt: gar nicht erst anlegen. Die Tagesplanung ist über die Nutzer-Auswahl gegated,
  // dieser Weg entsteht aber aus einem EINTRAG — der Träger kann sich auch während einer Pause
  // wieder verschliessen. Ohne diesen Wächter wäre der Halt die einzige Stelle, an der doch noch
  // Auto-Kontrollen entstehen, und die Zustellung müsste sie hinterher wieder wegräumen.
  if (await isHealthHoldActive(userId)) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
  if (!u) return null;
  const settings = autoKontrolleSettingsFromUser(u);
  // Ist die Verschluss-Kontrolle eingeschaltet, hat sie diesen Wiederverschluss schon abgedeckt —
  // er IST ein Verschluss. Ohne diese Schranke bekäme der Träger zwei Kontrollen für einen Vorgang.
  // Die Vorfahrt steht NUR hier, damit sie nicht an zwei Stellen auseinanderlaufen kann.
  if (settings.postLockEnabled) return null;
  if (!settings.aktiv) return null;
  const tz = u.timezone ?? APP_TZ;

  const { verzoegerung, imSchlaf } = delayAnsweringAnAction(
    settings, { von: CLEANING_RELOCK_INSPECTION_DELAY.min, bis: CLEANING_RELOCK_INSPECTION_DELAY.max }, now, tz, rand,
  );

  const { von: fristVon, bis: fristBis } = fristRange(settings);
  const wirksamAb = new Date(now.getTime() + verzoegerung * 60_000);
  const deadline = new Date(wirksamAb.getTime() + randomInt(fristVon, fristBis, rand) * 60_000);

  // Die zu ersetzende Zeile: die nächste geplante, noch NICHT zugestellte Auto-Kontrolle. Der
  // `benachrichtigtAt: null`-Filter steht bewusst auch im delete (wie im Neuwurf): zwischen Lesen
  // und Löschen kann der Minuten-Poller sie zugestellt haben, und eine zugestellte Kontrolle darf dem
  // Sub nicht unter den Händen verschwinden.
  const ersetzbar = await prisma.kontrollAnforderung.findFirst({
    where: { userId, ...AUTO_PLAN_WHERE, withdrawnAt: null, entryId: null, benachrichtigtAt: null, wirksamAb: { gt: now } },
    orderBy: { wirksamAb: "asc" },
    select: { id: true },
  });
  const geloescht = ersetzbar
    ? (await prisma.kontrollAnforderung.deleteMany({ where: { id: ersetzbar.id, benachrichtigtAt: null, withdrawnAt: null } })).count
    : 0;

  await createAutoKontrollen(userId, [{ wirksamAb, deadline }], { cleaningRelock: true });
  return { wirksamAb, deadline, imSchlaf, ersetzteId: geloescht > 0 ? ersetzbar!.id : null };
}

// ── Kontrolle nach JEDEM erfassten Verschluss ─────────────────────────────────

/** Was {@link schedulePostLockInspection} geplant hat (null = nichts geplant). */
export interface PostLockInspectionPlan {
  wirksamAb: Date;
  deadline: Date;
  /** Die Kontrolle landet im Schlaf-Fenster: kurze Verzögerung, keine Eskalationsstufe 2. */
  imSchlaf: boolean;
}

/**
 * Plant die Kontrolle NACH einem Verschluss: „du hast dich gerade eingeschlossen — zeig es mir."
 *
 * Unterschiede zur festen Reinigungs-Regel ({@link scheduleCleaningRelockInspection}), die sie bei
 * eingeschaltetem Schalter ablöst:
 *
 * - **Eigenständig.** Weder der Hauptschalter der Automatik (`aktiv`) noch „nur bei Sperrzeit"
 *   gelten; allein `postLockEnabled` entscheidet. Man kann den gewürfelten Tagesplan also ganz
 *   abschalten und trotzdem jeden Verschluss kontrollieren lassen.
 * - **Additiv.** Sie ersetzt KEINE geplante Auto-Kontrolle des Tages — die Tagesanzahl steigt um
 *   diese eine. Die Reinigungs-Regel nahm dem Plan dafür eine weg; wer den Schalter setzt, ändert
 *   damit auch das.
 * - **Feste Frist** aus den Einstellungen statt einer gewürfelten Spanne: der Anlass ist bekannt,
 *   die Überraschung liegt nicht in der Frist.
 *
 * Geerbt bleibt die Schonung im Schlaf-Fenster: fällt der Verschluss ODER die daraus errechnete
 * Auslösung hinein, gilt die kurze Spanne ({@link CLEANING_RELOCK_INSPECTION_DELAY_SLEEP}), und der
 * Poller lässt Eskalationsstufe 2 aus (`inspectionEscalationService`, über `postLock`).
 *
 * Ausgelöst wird beim ANLEGEN eines Verschluss-Eintrags — vom Träger wie von der Keyholderin —, und
 * zwar relativ zu JETZT, nicht zur Eintrags-Zeit: ein Nachtrag von gestern soll keine Kontrolle mit
 * Bezug auf gestern erzeugen. Fire-and-forget vom Aufrufer, deshalb wirft die Funktion nicht in den
 * Request zurück.
 */
export async function schedulePostLockInspection(
  userId: string, now: Date = new Date(), rand: () => number = Math.random,
): Promise<PostLockInspectionPlan | null> {
  // Gesundheits-Halt: gar nicht erst anlegen. Die Tagesplanung ist über die Nutzer-Auswahl gegated,
  // dieser Weg entsteht aber aus einem EINTRAG — der Träger kann sich auch während einer Pause
  // wieder verschliessen. Ohne diesen Wächter wäre der Halt die einzige Stelle, an der doch noch
  // Auto-Kontrollen entstehen, und die Zustellung müsste sie hinterher wieder wegräumen.
  if (await isHealthHoldActive(userId)) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
  if (!u) return null;
  const settings = autoKontrolleSettingsFromUser(u);
  if (!settings.postLockEnabled) return null;
  // Nur, wenn der Träger JETZT auch verschlossen ist. Die Keyholderin darf rückdatieren: ein
  // nachgetragenes, längst wieder geöffnetes Verschluss-Paar soll keine Kontrolle für jemanden
  // auslösen, der gar nicht zu ist. Der Wächter steht HIER und nicht an den drei Aufrufstellen —
  // an einer davon würde er sonst fehlen, und zwar unbemerkt.
  if (!(await getIsLocked(userId))) return null;
  const tz = u.timezone ?? APP_TZ;

  const { verzoegerung, imSchlaf } = delayAnsweringAnAction(settings, postLockDelayRange(settings), now, tz, rand);

  const wirksamAb = new Date(now.getTime() + verzoegerung * 60_000);
  const frist = clamp(settings.postLockDeadlineMinutes, POST_LOCK_INSPECTION_DEADLINE_RANGE);
  const deadline = new Date(wirksamAb.getTime() + frist * 60_000);

  // Verlangt DIESE Kontrolle das Box-Foto? Jetzt entschieden und in die Zeile geschrieben, nicht
  // beim Einreichen aus der Einstellung rekonstruiert: sonst änderte ein Umlegen des Schalters die
  // Regeln einer bereits laufenden Kontrolle, deren Frist tickt. Die Box-Abfrage kostet nur, wo der
  // Schalter überhaupt gesetzt ist — ohne gemeldete Box bliebe die Kontrolle sonst unerfüllbar.
  const requireBoxPhoto = settings.postLockRequireBoxPhoto
    && heimdallEnabled()
    && (await prisma.boxStatus.count({ where: { userId } })) > 0;

  await createAutoKontrollen(userId, [{ wirksamAb, deadline }], { postLock: true, requireBoxPhoto });
  return { wirksamAb, deadline, imSchlaf };
}

/**
 * Die Verschluss-Kontrolle anstossen, ohne auf sie zu warten.
 *
 * Der Anlege-Pfad des Trägers und der der Keyholderin rufen sie beide, und beide sind an dieser
 * Stelle mit dem Eintrag längst fertig: ein Fehler hier darf die geschriebene Zeile nicht mehr
 * gefährden. Als zwei Kopien von `void … .catch(console.error)` wäre schon die Logzeile
 * auseinandergelaufen — und man sähe an keinem der beiden Orte, dass es den anderen gibt.
 */
export function triggerPostLockInspection(userId: string): void {
  void schedulePostLockInspection(userId).catch((e) =>
    console.error("[autoKontrolle:postLock]", (e as Error).message));
}

/**
 * Ist diese Auto-Kontrolle aus einem VERSCHLUSS des Trägers entstanden statt aus dem Tagesplan?
 *
 * Zwei Herkünfte, eine Frage: die Reinigungs-Regel und die Verschluss-Kontrolle teilen beide
 * Folgen — kein Sperrzeit-Gate beim Zustellen, und Schonung im Schlaf-Fenster. Als zwei
 * Einzelabfragen stünden sie an drei Stellen (Poller, Eskalation, Vorhersage) je zweimal da, und
 * eine dritte Herkunft würde an einer davon vergessen.
 */
export function isEntryTriggeredInspection(ka: { cleaningRelock: boolean; postLock: boolean }): boolean {
  return ka.cleaningRelock || ka.postLock;
}

/** Hält fest, dass für diesen Sub-Tag gewürfelt wurde. Der Merker ist die EINZIGE Spur eines Wurfs auf
 *  „heute keine Kontrolle" (`perDayMin: 0`) — ohne ihn sähe der Minuten-Poller einen ungeplanten Tag
 *  und würfelte im nächsten Tick weiter, bis endlich eine Kontrolle herauskam. Aus 50 % Chance wurde so
 *  faktisch jeden Tag eine. */
async function markDayPlanned(userId: string, now: Date, tz: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { autoInspectionPlannedFor: midnightInTZ(now, tz) } });
}

/** Ist die Automatik für diesen Sub praktisch aus? Beide Einstiegspunkte (Tagesplanung und Neuwurf)
 *  müssen sich darüber einig sein — sie entscheidet, ob überhaupt geschrieben wird. */
function autoPlanningOff(settings: AutoKontrolleSettings): boolean {
  return !settings.aktiv || perDayRange(settings).max <= 0;
}

/**
 * **Die eine Stelle, an der ein Wochentag Einfluss auf die Planung bekommt.** Liefert die
 * Einstellungen, die an DIESEM Tag gelten — oder `null`, wenn an ihm gar nicht geplant wird.
 *
 * Beides zusammen, weil beide Einstiegspunkte (Tagesplanung und Neuwurf) beide Fragen stellen und
 * sich über beide einig sein müssen. Getrennt gestellt wäre der Ruhetag genau die Art Prüfung, die
 * an einer der zwei Stellen fehlt und dort still weiterplant.
 *
 * Der Ruhetag ist bewusst ein eigenes Feld und kein 24-Stunden-Schlaf-Fenster: `RuheVon == RuheBis`
 * liest der Planer als „kein Schlaf" (siehe {@link isInQuietMinutes}), ein ganztägiger Ruhetag wäre
 * über die Von/Bis-Spalten also gar nicht sagbar.
 *
 * Nach dem `null` bleibt für den Planer alles wie bisher: er bekommt genau EIN Schlaf- und EIN
 * Auslöse-Fenster, nur eben womöglich die des Tages. Deshalb steht die Auflösung hier und nicht in
 * der Arithmetik darunter.
 */
export function settingsForDay(settings: AutoKontrolleSettings, at: Date, tz: string): AutoKontrolleSettings | null {
  if (autoPlanningOff(settings)) return null;
  const isoDay = isoWeekdayInTZ(at, tz);
  if (!weekdayMaskHas(settings.days, isoDay)) return null;
  return timesForDay(settings, settings.dayRules, isoDay);
}

/** Legt die heutigen Auto-Kontrollen für EINEN User an — idempotent über den Tages-Merker. (Vom Poller,
 *  einmal pro Tag der Sub.) */
export async function ensureDailyAutoKontrollenForUser(user: AutoKontrolleUser, now: Date): Promise<number> {
  const tz = user.timezone ?? APP_TZ;
  const settings = settingsForDay(autoKontrolleSettingsFromUser(user), now, tz);
  // Kein Merker an einem Ruhetag: er hielte fest, dass „geplant wurde", und wäre damit von einem
  // gewürfelten 0-Tag nicht zu unterscheiden. Ein Ruhetag braucht ihn auch nicht — die Frage stellt
  // sich am nächsten Tick genauso schnell neu.
  if (!settings) return 0;
  const day = midnightInTZ(now, tz);
  if (user.autoInspectionPlannedFor?.getTime() === day.getTime()) return 0;

  // Eine Zählung pro Sub und Tag — sie fängt einen Tagesplan ab, den der Merker (noch) nicht kennt:
  // den am Deploy-Tag schon vorhandenen. Sie kann nur, was Zeilen hinterlassen hat; für einen Wurf auf
  // NULL ist allein der Merker zuständig.
  const already = await prisma.kontrollAnforderung.count({ where: todaysAutoPlanWhere(user.id, day) });
  if (already > 0) {
    await markDayPlanned(user.id, now, tz);
    return 0;
  }

  // Der Merker NOCHMAL, frisch: der Poller arbeitet mit einer Momentaufnahme aller Subs, und zwischen
  // dem Laden dieser Zeile und jetzt kann ein Neuwurf (Settings-Änderung) den Tag geplant haben — auch
  // auf NULL Kontrollen, was die Zählung oben prinzipiell nicht sehen kann. Ohne diese zweite Frage
  // überwürfe der Poller genau den 0-Tag, den zu bewahren der Sinn des Merkers ist.
  const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { autoInspectionPlannedFor: true } });
  if (fresh?.autoInspectionPlannedFor?.getTime() === day.getTime()) return 0;

  const created = await createAutoKontrollen(user.id, generateAutoKontrollen(settings, now, Math.random, tz));
  await markDayPlanned(user.id, now, tz);
  return created;
}

/**
 * Würfelt den heutigen Tagesplan NEU — der Weg, auf dem eine geänderte PLANUNGS-Einstellung sofort
 * wirkt (siehe {@link PLANNING_FIELDS}).
 *
 * Neu gewürfelt heisst wirklich neu: die Tages-Anzahl wird frisch aus `[perDayMin, perDayMax]` gezogen,
 * die noch nicht zugestellten Zeilen von heute fallen weg. Bereits ZUGESTELLTE bleiben stehen — der Sub
 * kennt Code und Frist, sie lassen sich nicht zurücknehmen — und zählen aufs neue Kontingent: würfelt
 * der Tag eine 1 und ist eine Kontrolle schon draussen, kommt heute keine mehr.
 *
 * Geplant wird über {@link fillFreeGaps}, also in die REST-Zeit des Tages und an den zugestellten
 * Kontrollen vorbei. Der Unterschied zu `spreadOverDay` ist load-bearing: ein Neuwurf um 20:00 mit
 * Segmenten über den ganzen Tag verwürfe fast alles, was er gerade gelöscht hat (die
 * Vormittags-Segmente sind vorbei), und der Tag endete meist leer. Dass für eine Änderung kurz vor
 * dem Schlaf-Fenster kein Platz mehr bleibt, ist dagegen richtig so.
 *
 * Hier steht `fillFreeGaps` fest, weil an den ZUGESTELLTEN Kontrollen vorbei geplant werden muss —
 * der Tagesplan hat die nicht und nimmt deshalb `spreadOverDay`. Die Anzahl kommt aus derselben
 * Quelle wie dort ({@link remainderOfDay}), zusätzlich gedeckelt durch das schon Zugestellte.
 */
export async function rerollTodayAutoKontrollenForUser(
  userId: string, settings: AutoKontrolleSettings, now: Date, tz: string = APP_TZ,
): Promise<number> {
  const day = midnightInTZ(now, tz);
  // `benachrichtigtAt`/`withdrawnAt` gehören ins DELETE selbst: zwischen dem Entschluss und dem
  // Löschen kann der Minuten-Poller eine Zeile verschickt haben, und eine zugestellte Kontrolle darf
  // dem Sub nicht unter den Händen verschwinden. Zurückgezogene bleiben ebenfalls liegen — an ihnen
  // hängt (versäumt/eskaliert) die History.
  await prisma.kontrollAnforderung.deleteMany({
    where: { ...todaysAutoPlanWhere(userId, day), benachrichtigtAt: null, withdrawnAt: null },
  });

  // Der Ruhetag greift NACH dem Löschen oben: wer den Sonntag gerade freigestellt hat, will die
  // schon gewürfelten Sonntags-Kontrollen los sein, nicht bloss keine neuen dazubekommen.
  const today = settingsForDay(settings, now, tz);
  let slots: AutoKontrolleSlot[] = [];
  if (today) {
    // Aufs Kontingent zählt, was der Sub heute WIRKLICH bekommen hat: zugestellt und nicht
    // zurückgenommen. Eine versäumte zählt mit (sie hat stattgefunden, das Vergehen hängt daran),
    // eine vom Keyholder zurückgezogene nicht — genau die Rangfolge von `GENUINELY_WITHDRAWN_WHERE`.
    const delivered = await prisma.kontrollAnforderung.findMany({
      where: {
        ...todaysAutoPlanWhere(userId, day),
        benachrichtigtAt: { not: null },
        NOT: GENUINELY_WITHDRAWN_WHERE,
      },
      select: { wirksamAb: true, deadline: true },
    });
    const { min, max } = perDayRange(today);
    // Zwei Obergrenzen, die kleinere gilt. Die Verrechnung mit dem schon Zugestellten wahrt die
    // Tages-Anzahl; der Anteil wahrt die DICHTE. Ohne ihn legte ein Einschalten um 21:00 die ganze
    // Tages-Anzahl in die letzte Stunde — die Verrechnung sieht dort nichts, weil noch nichts
    // zugestellt wurde. Ohne die Verrechnung bekäme ein normal gelaufener Tag nach einer Änderung am
    // Abend seine Kontrollen ein zweites Mal.
    const drawn = randomInt(min, max, Math.random);
    // `createAutoKontrollen` setzt immer ein `wirksamAb`; eine Zeile ohne ist nicht auf der Zeitachse
    // verortbar und kann deshalb keinen Zeitraum belegen (aufs Kontingent zählt sie trotzdem).
    const occupied = delivered.flatMap((d) => (d.wirksamAb ? [{ wirksamAb: d.wirksamAb, deadline: d.deadline }] : []));
    const remaining = Math.min(drawn - delivered.length, remainderOfDay(drawn, today, now, tz).count);
    slots = fillFreeGaps(today, occupied, remaining, now, Math.random, tz);
  }

  const created = await createAutoKontrollen(userId, slots);
  // Merker ZULETZT — dieselbe Reihenfolge wie in der Tagesplanung, und aus demselben Grund: scheitert
  // das Anlegen, bleibt der Tag ungemerkt und der Poller plant ihn neu. Andersherum stünde der Merker
  // auf einem Tag, für den nie Zeilen entstanden sind, und die Automatik schwiege bis Mitternacht —
  // der Ausgang des Vorfalls vom 28.07.2026 (siehe `keyholderVisibleKontrolleWhere` in queries.ts).
  await markDayPlanned(userId, now, tz);
  return created;
}

/** Legt die heutigen Auto-Kontrollen für ALLE aktiven User an (vom Poller, einmal pro Kalendertag der jeweiligen Sub). */
export async function ensureDailyAutoKontrollen(now: Date): Promise<void> {
  const users = await prisma.user.findMany({
    // Gesundheits-Halt: kein Tagesplan, und bewusst OHNE Merker — der Tag gilt damit als ungeplant
    // und wird nach dem Aufheben normal gewürfelt. Ein gesetzter Merker hielte fest, dass „geplant
    // wurde", und der erste Tag nach der Pause bliebe still leer.
    where: { autoKontrolleAktiv: true, ...USER_NOT_PAUSED_WHERE },
    select: AUTO_KONTROLLE_SETTINGS_SELECT,
  });
  for (const u of users) {
    try {
      await ensureDailyAutoKontrollenForUser(u, now);
    } catch (e) {
      console.error(`[autoKontrolle] Tagesplanung fehlgeschlagen (${u.id}):`, (e as Error).message);
    }
  }
}

/** Löscht am Tageswechsel die von der Automatik zurückgezogenen Auto-Kontrollen vergangener Tage
 *  (auto + wirklich zurückgezogen, createdAt vor der heutigen Sub-Mitternacht) — reines
 *  Listen-Rauschen ohne History-Wert. Erfüllte Auto-Kontrollen (withdrawnAt null) bleiben unberührt.
 *  createdAt < heute-Mitternacht schützt die heutigen Zeilen, die der Keyholder tagsüber noch sehen darf.
 *
 *  VERSÄUMTE Kontrollen bleiben ebenfalls unberührt: die Eskalation setzt zwar auch `withdrawnAt`,
 *  aber `GENUINELY_WITHDRAWN_WHERE` klammert sie über `autoMarkedRemovedAt` aus. Ohne das löschte
 *  dieser Lauf jede versäumte Auto-Kontrolle über Nacht — mitsamt dem Vergehen, das im Strafbuch
 *  genau an dieser Zeile hängt. */
export async function deleteWithdrawnAutoKontrollen(now: Date): Promise<number> {
  // Per-User-Tag-Grenze: die "heutige Mitternacht" hängt an der Sub-Zeitzone, deshalb kann nicht ein
  // globales midnightInTZ(now) alle Zeilen filtern — sonst würde für Nicht-CH-Subs zu früh/spät gelöscht.
  const candidates = await prisma.kontrollAnforderung.findMany({
    // Bewusst `auto: true` statt AUTO_PLAN_WHERE: zurückgezogenes Listen-Rauschen ist Rauschen,
    // egal aus welcher Quelle die Zeile stammt.
    where: { auto: true, ...GENUINELY_WITHDRAWN_WHERE },
    select: { id: true, createdAt: true, user: { select: { timezone: true } } },
  });
  const toDelete = candidates
    .filter((c) => c.createdAt < midnightInTZ(now, c.user.timezone ?? APP_TZ))
    .map((c) => c.id);
  if (toDelete.length === 0) return 0;
  const res = await prisma.kontrollAnforderung.deleteMany({ where: { id: { in: toDelete } } });
  return res.count;
}

/** Speichert die Auto-Kontroll-Settings eines Users (nur übergebene Felder; Zahlen geklemmt, HH:MM
 *  validiert, FristBis ≥ FristVon). Geteilt von PATCH /api/admin/users/[id]. */
export async function setAutoKontrolleSettings(userId: string, params: SetAutoKontrolleParams): Promise<ServiceResult<null>> {
  const data: Partial<AutoKontrolleUserFields> = {};

  if (params.aktiv !== undefined) data.autoKontrolleAktiv = Boolean(params.aktiv);
  if (params.perDayMin !== undefined) data.autoKontrollePerDayMin = clamp(params.perDayMin, AUTO_INSPECTION_PER_DAY_RANGE);
  if (params.perDayMax !== undefined) data.autoKontrollePerDayMax = clamp(params.perDayMax, AUTO_INSPECTION_PER_DAY_RANGE);
  // Ungültige Uhrzeit ist ein eigener Fehler — früher still verworfen, was sie mit dem
  // „keine Felder"-Fall vermischte und (über die Route) als Erfolg gemeldet wurde.
  if (params.ruheVon !== undefined) {
    if (!HHMM.test(params.ruheVon)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleRuheVon = params.ruheVon;
  }
  if (params.ruheBis !== undefined) {
    if (!HHMM.test(params.ruheBis)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleRuheBis = params.ruheBis;
  }
  if (params.fristVon !== undefined) data.autoKontrolleFristVon = clamp(params.fristVon, AUTO_INSPECTION_DEADLINE_FROM_RANGE);
  if (params.fristBis !== undefined) data.autoKontrolleFristBis = clamp(params.fristBis, AUTO_INSPECTION_DEADLINE_TO_RANGE);
  // Festes Auslöse-Fenster: "" schaltet es aus (kein Fenster), sonst muss es HH:MM sein.
  if (params.fensterVon !== undefined) {
    if (params.fensterVon !== "" && !HHMM.test(params.fensterVon)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleFensterVon = params.fensterVon;
  }
  if (params.fensterBis !== undefined) {
    if (params.fensterBis !== "" && !HHMM.test(params.fensterBis)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleFensterBis = params.fensterBis;
  }
  if (params.nurBeiSperre !== undefined) data.autoKontrolleNurBeiSperre = Boolean(params.nurBeiSperre);
  // Die Plan-Tage: `0` wäre eine zweite, stille Art, die Automatik abzuschalten — dafür gibt es
  // `aktiv`. Eine Einstellung, die dasselbe auf zwei Wegen sagt, widerspricht sich irgendwann
  // (`active: true` bei null Tagen liest sich in `get_context` wie ein Defekt).
  if (params.days !== undefined) {
    if (!weekdayMaskValid(params.days)) return serviceFail(400, INVALID_TIME);
    data.autoKontrolleDays = params.days;
  }
  if (params.dayRules !== undefined) {
    const problem = autoInspectionDayRulesProblem(params.dayRules);
    if (problem) return serviceFail(400, problem.code);
    const rules = parseAutoInspectionDayRules(params.dayRules);
    // Die BEDEUTUNGS-Prüfung steht hier und nicht im Regel-Modul: sie braucht die Fenster-Arithmetik
    // des Planers (`triggerWindowAllQuiet` — dieselbe Funktion, die das Fenster später liest), und
    // eine zweite Herleitung daneben liefe irgendwann gegen eine Regel, die der Planer nicht hat.
    if (rules.some((r) => triggerWindowAllQuiet(r))) {
      return serviceFail(400, "INSPECTION_TRIGGER_WINDOW_ALL_QUIET");
    }
    // Normalisiert ablegen (wie bei den Reinigungs-Fenstern): so vergleicht der Änderungs-Test
    // unten Zeichenkette gegen Zeichenkette und nicht Formatierung gegen Formatierung.
    data.autoKontrolleDayRules = JSON.stringify(rules);
  }
  if (params.postLockEnabled !== undefined) data.postLockInspectionEnabled = params.postLockEnabled;
  if (params.postLockDelayMin !== undefined) data.postLockInspectionDelayMin = clamp(params.postLockDelayMin, POST_LOCK_INSPECTION_DELAY_MIN_RANGE);
  if (params.postLockDelayMax !== undefined) data.postLockInspectionDelayMax = clamp(params.postLockDelayMax, POST_LOCK_INSPECTION_DELAY_MAX_RANGE);
  if (params.postLockDeadlineMinutes !== undefined) data.postLockInspectionDeadlineMinutes = clamp(params.postLockDeadlineMinutes, POST_LOCK_INSPECTION_DEADLINE_RANGE);
  if (params.postLockRequireBoxPhoto !== undefined) data.postLockInspectionRequireBoxPhoto = params.postLockRequireBoxPhoto;
  // „Bis" nie unter „Von" — nur wenn beide in diesem Patch bekannt (Von-/Bis-Paare: PerDay, Frist
  // und das Auslöse-Fenster der Verschluss-Kontrolle).
  // Nur die vorhandenen Bis-Keys anfassen, sonst würde undefined den „keine Felder"-Guard aushebeln.
  if (data.autoKontrollePerDayMax !== undefined) data.autoKontrollePerDayMax = raiseMaxToMin(data.autoKontrollePerDayMin, data.autoKontrollePerDayMax);
  if (data.autoKontrolleFristBis !== undefined) data.autoKontrolleFristBis = raiseMaxToMin(data.autoKontrolleFristVon, data.autoKontrolleFristBis);
  if (data.postLockInspectionDelayMax !== undefined) data.postLockInspectionDelayMax = raiseMaxToMin(data.postLockInspectionDelayMin, data.postLockInspectionDelayMax);

  // Leeres `data` heisst jetzt eindeutig: gar kein Feld übergeben (ungültige Uhrzeiten sind oben
  // schon als INVALID_TIME rausgeflogen).
  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);

  // Der Stand VOR dem Schreiben — nur so lässt sich eine echte Wertänderung von einem Speichern
  // unterscheiden, das denselben Wert nochmal schickt (das Formular sendet immer alle Felder).
  // Verglichen wird gegen `data`, also gegen die bereits geklemmten/normalisierten Zielwerte: ein
  // Wert, den `clamp` ohnehin auf den Bestand zurückholt, ist keine Änderung.
  const before = await prisma.user.findUnique({ where: { id: userId }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
  if (!before) return serviceFail(404, "USER_NOT_FOUND");

  // Das feste Auslöse-Fenster im ERGEBNIS-Stand. Bis hierher stand diese Prüfung NUR im MCP — mit der
  // Folge, dass dieselben Uhrzeiten je nach Weg 200 oder 400 ergaben: als Grundstand über das
  // Formular gespeichert, als Tages-Ausnahme abgelehnt. Der Planer übergeht beide Fälle stumm
  // (Fallback aufs Wach-Fenster bzw. gar keine Slots), und die Keyholderin wartet auf Kontrollen,
  // die nie kommen.
  //
  // Nur wenn der Patch eines der vier Zeit-Felder ANFASST: sonst sperrte eine schon gespeicherte
  // schlechte Kombination auch jede unbeteiligte Änderung (Anzahl, Frist) aus, bis jemand das
  // Fenster repariert. Wer die Zeiten anfasst, soll sie in Ordnung bringen — wer die Anzahl ändert,
  // muss es nicht.
  const WINDOW_FIELDS = ["autoKontrolleRuheVon", "autoKontrolleRuheBis", "autoKontrolleFensterVon", "autoKontrolleFensterBis"] as const;
  if (WINDOW_FIELDS.some((f) => f in data)) {
    const merged = { ...before, ...data };
    const times = {
      ruheVon: merged.autoKontrolleRuheVon, ruheBis: merged.autoKontrolleRuheBis,
      fensterVon: merged.autoKontrolleFensterVon, fensterBis: merged.autoKontrolleFensterBis,
    };
    if (times.fensterVon || times.fensterBis) {
      if (!fixedWindowMinutes(times)) return serviceFail(400, TIME_RANGE_INVALID);
      if (triggerWindowAllQuiet(times)) return serviceFail(400, "INSPECTION_TRIGGER_WINDOW_ALL_QUIET");
    }
  }
  const changed = (Object.keys(data) as (keyof AutoKontrolleUserFields)[]).filter((f) => data[f] !== before[f]);
  if (changed.length === 0) return { ok: true, data: null }; // Speichern ohne Änderung: kein Schreibzugriff

  const user = await prisma.user.update({ where: { id: userId }, data, select: AUTO_KONTROLLE_SETTINGS_SELECT });

  // Nur eine echte Änderung an einem Planungsfeld würfelt den laufenden Tag neu. Ein Speichern, das
  // nur „nur bei Sperre" umlegt, lässt den Tagesplan in Ruhe.
  if (changed.some((f) => (PLANNING_FIELDS as readonly string[]).includes(f))) {
    await rerollTodayAutoKontrollenForUser(userId, autoKontrolleSettingsFromUser(user), new Date(), user.timezone ?? APP_TZ)
      .catch((e) => console.error(`[autoKontrolle] Neuwurf nach Settings-Änderung fehlgeschlagen (${userId}):`, (e as Error).message));
  }
  return { ok: true, data: null };
}

