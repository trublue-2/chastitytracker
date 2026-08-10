import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { APP_TZ, midnightInTZ, dateAtLocalMinutes, formatTime, clamp, randomInt } from "@/lib/utils";
import {
  NO_FIELDS_TO_UPDATE, INVALID_TIME, HHMM, AUTO_INSPECTION_PER_DAY_RANGE,
  AUTO_INSPECTION_DEADLINE_FROM_RANGE, AUTO_INSPECTION_DEADLINE_TO_RANGE,
  CLEANING_RELOCK_INSPECTION_DELAY, CLEANING_RELOCK_INSPECTION_DELAY_SLEEP,
} from "@/lib/constants";
import { generateKontrollCode } from "@/lib/utils";
import { GENUINELY_WITHDRAWN_WHERE, AUTO_PLAN_WHERE, todaysAutoPlanWhere } from "@/lib/queries";
import type { Prisma } from "@prisma/client";

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
}

export type SetAutoKontrolleParams = Partial<AutoKontrolleSettings>;

/** Ein geplanter Slot auf der Tages-Achse (Instants, wie sie in der DB stehen). */
export interface AutoKontrolleSlot {
  wirksamAb: Date;
  deadline: Date;
}

/** Geklemmter Min-/Max-Anzahl-Bereich pro Tag (`max` nie unter `min`). */
function perDayRange(s: AutoKontrolleSettings): { min: number; max: number } {
  const min = clamp(s.perDayMin, AUTO_INSPECTION_PER_DAY_RANGE);
  return { min, max: Math.max(min, clamp(s.perDayMax, AUTO_INSPECTION_PER_DAY_RANGE)) };
}

/** Geklemmter Erfüllungsdauer-Bereich in Minuten (`bis` nie unter `von`). */
function fristRange(s: AutoKontrolleSettings): { von: number; bis: number } {
  const von = clamp(s.fristVon, AUTO_INSPECTION_DEADLINE_FROM_RANGE);
  return { von, bis: Math.max(von, clamp(s.fristBis, AUTO_INSPECTION_DEADLINE_TO_RANGE)) };
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

// ── Festes Auslöse-Fenster ─────────────────────────────────────────────────────

/** Parst das optionale feste Auslöse-Fenster (HH:MM–HH:MM). Gültig NUR, wenn beide Zeiten valide sind
 *  UND Von < Bis (ein festes Fenster wrappt bewusst nicht über Mitternacht); sonst null → Fallback aufs
 *  Wach-Fenster. "" (leer, Default) → null. */
export function fixedWindowMinutes(s: AutoKontrolleSettings): { start: number; end: number } | null {
  if (!HHMM.test(s.fensterVon) || !HHMM.test(s.fensterBis)) return null;
  const start = hhmmToMinutes(s.fensterVon);
  const end = hhmmToMinutes(s.fensterBis);
  return end > start ? { start, end } : null;
}

/** Liegt das feste Auslöse-Fenster VOLLSTÄNDIG im Schlaf-Fenster? Dann überspringt der Planer jeden
 *  Trigger (`isInQuietMinutes`) und der Tag bleibt lautlos leer. Die Schreib-Seite
 *  (`set_auto_inspections`) lehnt so eine Kombination damit ab, statt sie stumm wirkungslos zu
 *  speichern. Das Fenster wrappt bewusst nicht (siehe `fixedWindowMinutes`), das Schlaf-Fenster schon. */
export function triggerWindowAllQuiet(s: AutoKontrolleSettings): boolean {
  const fixed = fixedWindowMinutes(s);
  if (!fixed) return false;
  const von = hhmmToMinutes(s.ruheVon);
  const bis = hhmmToMinutes(s.ruheBis);
  if (von === bis) return false; // kein Schlaf
  return von < bis
    ? fixed.start >= von && fixed.end <= bis          // 02:00–05:00: Fenster liegt darin
    : fixed.start >= von || fixed.end <= bis;         // 22:00–06:00 (wrap): Fenster im Abend- ODER Morgen-Ast
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
  return spreadOverDay(settings, now, randomInt(min, max, rand), rand, tz);
}

/**
 * Verteilt `x` Slots über den GANZEN Tag: je ein gleich grosses Segment pro Slot. Für den frischen
 * Tagesplan, den der Poller zur Sub-Mitternacht anlegt.
 *
 * NUR dafür: die Segmente werden über das ganze Fenster gelegt und Slots, deren Trigger schon vorbei
 * ist, fallen weg. Zur Mitternacht ist das keiner — mitten am Tag wären es die meisten. Wer während
 * des Tages plant, nimmt {@link fillFreeGaps}; das füllt ab JETZT.
 */
function spreadOverDay(
  settings: AutoKontrolleSettings,
  now: Date,
  x: number,
  rand: () => number,
  tz: string,
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
    const segSize = (fixed.end - fixed.start) / x;
    for (let i = 0; i < x; i++) {
      const triggerMin = Math.ceil(fixed.start + i * segSize);
      const triggerMax = Math.floor(fixed.start + (i + 1) * segSize) - 1; // Trigger vor Segmentende → verteilt
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
  const segSize = (awakeEnd - awakeStart) / x;
  // Die Segment-Kappung darf die Mindest-Frist NICHT unterlaufen. Vorher stand unten `Math.max(1, …)`,
  // was in einem engen Wach-Fenster Slots mit 1-Minuten-Frist erzeugte — für den Sub unerfüllbar.
  // Lieber kein Slot als einer, den er nicht schaffen kann. Die Prüfung steht VOR der Schleife, weil `segSize` über alle
  // Segmente konstant ist: passt `fristVon` in eines nicht, passt es in keines. (Im Fenster-Zweig
  // muss `windowDeadlineMin` dagegen je Trigger entscheiden — dort kappt der Schlaf-Beginn, nicht
  // die Segmentgrösse.)
  const maxDur = Math.floor(segSize);
  if (maxDur < fristVon) return out;
  for (let i = 0; i < x; i++) {
    const segStart = awakeStart + i * segSize;
    const segEnd = awakeStart + (i + 1) * segSize;
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
  const { start: awakeStart, end: awakeEnd } = awakeWindow(settings);
  const { von: fristVon, bis: fristBis } = fristRange(settings);
  const { at, minuteOf } = minuteAxis(now, awakeStart, tz);
  const domain = triggerDomain(settings, { start: awakeStart, end: awakeEnd });
  const occupied = [
    ...taken.map((t) => ({ start: minuteOf(t.wirksamAb), end: minuteOf(t.deadline) })),
    ...domain.occupied,
  ];

  const out: AutoKontrolleSlot[] = [];
  let gaps = freeGaps(Math.max(domain.lower, minuteOf(now) + 1), domain.upper, occupied);
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
  };
}

/**
 * Dieselben Einstellungen in MCP-Sprache — die Sicht, die `get_context.autoInspections` liefert und
 * gegen die `set_auto_inspections` seinen Diff zeigt. Hier neben {@link autoKontrolleSettingsFromUser}
 * statt im MCP-Lese-Modul, damit die Schreib-Seite dafür nicht die Lese-Seite importieren muss
 * (dieselbe Aufteilung wie `buildReinigungView` in `reinigungService`).
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
  autoKontrolleNurBeiSperre: true, autoInspectionPlannedFor: true,
} as const;

/** Die Felder, an denen der TAGESPLAN hängt: ändert sich eines, wird der Tag neu gewürfelt.
 *  `autoKontrolleNurBeiSperre` steht bewusst NICHT hier — es entscheidet erst bei Fälligkeit über die
 *  Zustellung und lässt die Planung unberührt. */
const PLANNING_FIELDS = [
  "autoKontrolleAktiv", "autoKontrollePerDayMin", "autoKontrollePerDayMax",
  "autoKontrolleRuheVon", "autoKontrolleRuheBis",
  "autoKontrolleFristVon", "autoKontrolleFristBis",
  "autoKontrolleFensterVon", "autoKontrolleFensterBis",
] as const satisfies readonly (keyof AutoKontrolleUserFields)[];

/** Jede Auto-Kontroll-Einstellung ist entweder Planung oder bewusst keine — wer eine neue hinzufügt,
 *  muss sich hier entscheiden, sonst nennt der Compiler sie beim Namen. Ohne diese Zeile fiele ein
 *  vergessenes Feld LAUTLOS aus dem Neuwurf: es speichert und wirkt, nur eben erst am nächsten Tag.
 *  Das ist die einzige der zehn Feld-Listen dieses Moduls, deren Lücke man nicht sofort sieht. */
type AssertNever<T extends never> = T;
type _AllSettingsClassified = AssertNever<
  Exclude<keyof AutoKontrolleUserFields, (typeof PLANNING_FIELDS)[number] | "autoKontrolleNurBeiSperre">
>;

/** Dieselbe Grenze auf der Settings-Sicht — und mit derselben Zusicherung versehen, damit die beiden
 *  Listen nicht auseinanderlaufen können. Wer nur die Spalten-Liste pflegte, bekäme hier den Compiler. */
const PLANNING_SETTINGS = [
  "aktiv", "perDayMin", "perDayMax", "ruheVon", "ruheBis", "fristVon", "fristBis", "fensterVon", "fensterBis",
] as const satisfies readonly (keyof AutoKontrolleSettings)[];
type _AllSettingsViewClassified = AssertNever<
  Exclude<keyof AutoKontrolleSettings, (typeof PLANNING_SETTINGS)[number] | "nurBeiSperre">
>;

/** Würde dieser Übergang den Tagesplan neu würfeln? Die Frage beantwortet sonst nur
 *  {@link setAutoKontrolleSettings} für sich selbst; ein Aufrufer, der sein Ergebnis BESCHREIBEN will
 *  (MCP `set_auto_inspections`), soll die Liste nicht ungeprüft abschreiben müssen. */
export function planningChanged(before: AutoKontrolleSettings, after: AutoKontrolleSettings): boolean {
  return PLANNING_SETTINGS.some((k) => before[k] !== after[k]);
}

/** Legt Auto-Kontroll-Zeilen für die gegebenen Slots an (frischer Code je Zeile, benachrichtigtAt=null).
 *  `extra` trägt die HERKUNFT (heute `cleaningRelock`) — die eine Stelle, an der eine Auto-Zeile
 *  entsteht, bleibt damit auch die eine Stelle, die weiss, wie eine Auto-Zeile aussieht. */
async function createAutoKontrollen(
  userId: string, slots: { wirksamAb: Date; deadline: Date }[], extra: { cleaningRelock?: boolean } = {},
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
  return isInQuietMinutes(
    hhmmToMinutes(settings.ruheVon), hhmmToMinutes(settings.ruheBis),
    hhmmToMinutes(formatTime(at, "de-CH", tz)),
  );
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
  const u = await prisma.user.findUnique({ where: { id: userId }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
  if (!u) return null;
  const settings = autoKontrolleSettingsFromUser(u);
  if (!settings.aktiv) return null;
  const tz = u.timezone ?? APP_TZ;

  // Erst mit der langen Verzögerung rechnen, dann prüfen, wo sie landet: fällt Verschluss ODER
  // Auslösung in den Schlaf, gilt die kurze. Ein zweiter Durchgang genügt — die kurze Spanne liegt
  // ganz in der langen, kann also nicht aus dem Schlaf-Fenster herausfallen, in das die lange fiel.
  const langeVerzoegerung = randomInt(CLEANING_RELOCK_INSPECTION_DELAY.min, CLEANING_RELOCK_INSPECTION_DELAY.max, rand);
  const imSchlaf =
    isSleepingAt(settings, now, tz) ||
    isSleepingAt(settings, new Date(now.getTime() + langeVerzoegerung * 60_000), tz);
  const verzoegerung = imSchlaf
    ? randomInt(CLEANING_RELOCK_INSPECTION_DELAY_SLEEP.min, CLEANING_RELOCK_INSPECTION_DELAY_SLEEP.max, rand)
    : langeVerzoegerung;

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

/** Legt die heutigen Auto-Kontrollen für EINEN User an — idempotent über den Tages-Merker. (Vom Poller,
 *  einmal pro Tag der Sub.) */
export async function ensureDailyAutoKontrollenForUser(user: AutoKontrolleUser, now: Date): Promise<number> {
  const settings = autoKontrolleSettingsFromUser(user);
  if (autoPlanningOff(settings)) return 0;
  const tz = user.timezone ?? APP_TZ;
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
 * Kontrollen vorbei — nicht über `spreadOverDay`. Der Unterschied ist load-bearing: ein Neuwurf um
 * 20:00 mit Segmenten über den ganzen Tag verwürfe fast alles, was er gerade gelöscht hat (die
 * Vormittags-Segmente sind vorbei), und der Tag endete meist leer. Dass für eine Änderung kurz vor
 * dem Schlaf-Fenster kein Platz mehr bleibt, ist dagegen richtig so.
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

  let slots: AutoKontrolleSlot[] = [];
  if (!autoPlanningOff(settings)) {
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
    const { min, max } = perDayRange(settings);
    // `createAutoKontrollen` setzt immer ein `wirksamAb`; eine Zeile ohne ist nicht auf der Zeitachse
    // verortbar und kann deshalb keinen Zeitraum belegen (aufs Kontingent zählt sie trotzdem).
    const occupied = delivered.flatMap((d) => (d.wirksamAb ? [{ wirksamAb: d.wirksamAb, deadline: d.deadline }] : []));
    const remaining = randomInt(min, max, Math.random) - delivered.length;
    slots = fillFreeGaps(settings, occupied, remaining, now, Math.random, tz);
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
  const users = await prisma.user.findMany({ where: { autoKontrolleAktiv: true }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
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
  // „Bis" nie unter „Von" — nur wenn beide in diesem Patch bekannt (Von-/Bis-Paare: PerDay & Frist).
  // Nur die vorhandenen Bis-Keys anfassen, sonst würde undefined den „keine Felder"-Guard aushebeln.
  if (data.autoKontrollePerDayMax !== undefined) data.autoKontrollePerDayMax = raiseMaxToMin(data.autoKontrollePerDayMin, data.autoKontrollePerDayMax);
  if (data.autoKontrolleFristBis !== undefined) data.autoKontrolleFristBis = raiseMaxToMin(data.autoKontrolleFristVon, data.autoKontrolleFristBis);

  // Leeres `data` heisst jetzt eindeutig: gar kein Feld übergeben (ungültige Uhrzeiten sind oben
  // schon als INVALID_TIME rausgeflogen).
  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);

  // Der Stand VOR dem Schreiben — nur so lässt sich eine echte Wertänderung von einem Speichern
  // unterscheiden, das denselben Wert nochmal schickt (das Formular sendet immer alle Felder).
  // Verglichen wird gegen `data`, also gegen die bereits geklemmten/normalisierten Zielwerte: ein
  // Wert, den `clamp` ohnehin auf den Bestand zurückholt, ist keine Änderung.
  const before = await prisma.user.findUnique({ where: { id: userId }, select: AUTO_KONTROLLE_SETTINGS_SELECT });
  if (!before) return serviceFail(404, "USER_NOT_FOUND");
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
