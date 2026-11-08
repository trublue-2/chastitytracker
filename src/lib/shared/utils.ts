import type { NumberRange } from "@/lib/shared/constants";
import { toVerifyFailure, type VerifyFailure } from "@/lib/kontrollen/verifyReason";
import { isEffectiveEntry } from "@/lib/entries/lockPending";
import { getMidnightToday, getWeekStart, getMonthStart, getYearStart } from "@/lib/shared/time";

/** Auf eine Nachkommastelle runden.
 * @deprecated Use Number(n.toFixed(1)) instead.
 */
export const round1 = (n: number) => Number(n.toFixed(1));

/** Millisekunden → Stunden, auf eine Nachkommastelle gerundet. */
export const msToHours = (ms: number) => Number((ms / 3_600_000).toFixed(1));

/** Median einer Zahlenliste (leere Liste → 0). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Die Kennzahlen einer Dauern-Liste in ms. EINE Ableitung für die Geräte-Nutzung (UI, `deviceUsage`)
 *  und `device_stats` (MCP) — sonst nennen Chat und Statistik-Seite verschiedene Zahlen zur selben
 *  Frage. Der MCP rechnet die ms erst am Rand in Stunden um (`msToHours`).
 *  Leere Liste → alles 0 (der Aufrufer legt gar nicht erst einen Topf ohne Dauern an). */
export function summarizeDurations(durations: number[]): {
  count: number; totalMs: number; avgMs: number; medianMs: number; minMs: number; maxMs: number;
} {
  if (durations.length === 0) return { count: 0, totalMs: 0, avgMs: 0, medianMs: 0, minMs: 0, maxMs: 0 };
  const totalMs = durations.reduce((a, b) => a + b, 0);
  return {
    count: durations.length,
    totalMs,
    avgMs: totalMs / durations.length,
    medianMs: median(durations),
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
  };
}

/**
 * Zwei Positionen einer Liste vertauschen, als NEUE Liste.
 *
 * Für die Umsortier-Pfeile: dieselbe Vertauschung stand dreimal im Projekt, in drei Fassungen
 * (Destructuring auf einer Kopie, `map`-Ternär, Server-Swap). `ReorderButtons` hat die Knöpfe
 * vereinheitlicht — das hier ist die Bewegung dahinter.
 *
 * Ausserhalb der Liste wird NICHTS getauscht: ein Index daneben gibt die Liste unverändert zurück,
 * statt `undefined` einzusetzen. Die Pfeile sperren sich am Rand ohnehin selbst; diese Zusage ist
 * für den Aufrufer, der sie nicht ein zweites Mal hinschreiben soll.
 */
export function swapAt<T>(list: T[], i: number, j: number): T[] {
  if (i === j || i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  return list.with(i, list[j]).with(j, list[i]);
}

/**
 * Ein Element an den Anfang oder ans Ende ziehen, als NEUE Liste — die Bewegung hinter den
 * Doppel-Pfeilen von `ReorderButtons`.
 *
 * Das Ergebnis ist dasselbe wie eine Kette benachbarter `swapAt` (nachgerechnet in `utils.test.ts`)
 * — der Unterschied ist, dass es EINE Bewegung ist: ein Zustands-Update, eine Ansage an die
 * Assistenztechnik, ein Schritt zurück. Eine Schleife im Setter wäre dasselbe Ergebnis, aber
 * vierzehn Umordnungen für einen Tipp.
 *
 * Ausserhalb der Liste wird nichts bewegt, gleiche Zusage wie bei {@link swapAt}.
 */
export function moveToEdge<T>(list: T[], index: number, edge: "start" | "end"): T[] {
  if (index < 0 || index >= list.length) return list;
  const rest = list.toSpliced(index, 1);
  return edge === "start" ? [list[index], ...rest] : [...rest, list[index]];
}

/** Zeilen je `userId` bündeln — einmal O(n), statt je Nutzer die ganze Liste zu durchsuchen. */
export function groupByUser<T extends { userId: string }>(rows: readonly T[]): Map<string, T[]> {
  return Map.groupBy(rows, r => r.userId);
}

/** Fügt die vorhandenen Teile einer einzeiligen Beschriftung mit „ · " zusammen; bleibt nichts
 *  übrig, `null` — der Aufrufer reicht das Ergebnis meist als optionalen Text weiter, und ein
 *  leerer String erzeugte dort eine leere Zeile statt gar keiner. */
export function joinParts(...parts: (string | null | undefined | false)[]): string | null {
  return parts.filter(Boolean).join(" · ") || null;
}

/** Klemmt eine Zahl auf [min, max] und rundet; ungültige/0-Werte fallen auf `fallback`. */
export function clamp(value: number, { min, max, fallback }: NumberRange): number {
  return Math.max(min, Math.min(max, Math.round(value) || fallback));
}

/** Ganzzahl aus `[lo, hi]`, BEIDE Grenzen inklusive. `rand` ist injizierbar, damit die Planer, die
 *  darauf aufbauen, deterministisch testbar bleiben. Eine Kopie zu tippen ist die klassische
 *  Off-by-one-Falle (`hi - lo` statt `hi - lo + 1` schliesst die Obergrenze stumm aus), deshalb
 *  hier EINE Fassung für alle Würfel-Stellen. */
export function randomInt(lo: number, hi: number, rand: () => number = Math.random): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Client-side sibling of {@link clamp}: parses a raw `<input type="number">` string value and
 *  clamps it to the same range. Its single caller is `NumberInput`, which applies it on blur —
 *  applying it per keystroke is what once made those fields unclearable.
 *
 *  Deliberately NOT `clamp(Number(v), range)`: `clamp` treats a falsy value as "no input" and
 *  substitutes `fallback`, which is right for a missing field but wrong for a typed one — an entry
 *  rounding to 0 ("0.4") would jump to the default instead of the minimum. Only an empty or
 *  unreadable entry falls back here; every real number is merely rounded and clamped. */
export function clampInputValue(v: string, { min, max, fallback }: NumberRange): number {
  const parsed = Number(v);
  if (v.trim() === "" || Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

/** True if EXIF time differs from entry time by more than 1 hour */
export function hasExifMismatch(exifTime: Date, startTime: Date): boolean {
  return Math.abs(exifTime.getTime() - startTime.getTime()) > 3_600_000;
}

/** Tolerance for "Zeit korrigiert" detection: 5 minutes */
export const TIME_CORRECTION_THRESHOLD_MS = 300_000;

/** True if the user-provided time is more than 5 minutes before the server submission time */
export function isTimeCorrected(time: Date, submittedAt: Date | null | undefined): boolean {
  if (!submittedAt) return false;
  return time.getTime() < submittedAt.getTime() - TIME_CORRECTION_THRESHOLD_MS;
}

export type AnforderungStatus = "open" | "overdue" | "fulfilled" | "late" | "withdrawn" | "scheduled" | "missed";

/** `not_required`: diese Kontrolle hatte nichts zu verifizieren — das Gerät verlangt keinen Code
 *  (`Device.requireInspectionCode: false`) und es lief auch keine Siegel-Prüfung. Bewusst ein eigener
 *  Wert und nicht `unverified`: Letzteres heisst „geprüft und nicht bestätigt" und liest sich in der
 *  Liste wie ein Fehlschlag. Und nicht `ai`/`manual`: bestätigt wurde nichts. */
export type VerifikationStatus = "unverified" | "not_required" | "pending" | "ai" | "manual" | "rejected";

/** True if a deadline passed without a timely completion — completed after the deadline, or not
 *  yet completed and the deadline is already past. Shared primitive behind the Kontrolle "late"
 *  status and the Strafbuch late-lock / cleaning-relock detectors (src/lib/strafbuch/strafbuch.ts). */
export function isPastDeadlineUnfulfilled(deadline: Date, completedAt: Date | null, now: Date): boolean {
  return completedAt ? completedAt > deadline : deadline < now;
}

/**
 * Wurde die Kontrolle eingereicht, und war sie pünktlich?
 *
 * **Die Pünktlichkeit entscheidet `fulfilledAt`, NIE die Eintragszeit.** Auf dem Kontroll-Pfad
 * setzt der Server `fulfilledAt` auf seine eigene Uhr; die Eintragszeit dagegen wählt der Sub im
 * Formular selbst — solange der Status sie las, war „ich datiere mich vor die Frist" eine gültige
 * Ausrede. (Als Eigenschaft der SPALTE gilt das nicht: die Verschluss-Anforderung kennt den
 * Nachtrag bewusst. Die Asymmetrie steht in `entryFulfilment.ts`, geprüft wird sie in dessen Test.)
 *
 * Wo die Eintragszeit legitim gegen die Frist läuft, heisst das auch so — `backdated` in
 * `strafbuch.ts` stellt genau diese Rückdatierung fest, statt sie in den Status zu mischen.
 *
 * `scheduled`: vom Keyholder gesetzt, noch nicht ausgelöst (`wirksamAb` in der Zukunft) — nur in
 * Keyholder-Sichten sichtbar, der Sub sieht terminierte Direktiven nie.
 *
 * `missed`: die Eskalation (Stufe 2) hat die Kontrolle als versäumt abgeschlossen und das Gerät
 * auto-entfernt. Sie setzt AUCH `withdrawnAt` (damit die Zeile aus der Fällig-Query fällt) — die
 * Prüfung muss deshalb VOR `withdrawn` stehen, sonst sähe ein Versäumnis aus wie ein Rückzug.
 */
export function mapAnforderungStatus(
  k: { withdrawnAt: Date | null; entryId: string | null; deadline: Date; fulfilledAt?: Date | null; wirksamAb?: Date | null; autoMarkedRemovedAt: Date | null },
  now: Date
): AnforderungStatus {
  if (k.autoMarkedRemovedAt) return "missed";
  if (k.withdrawnAt) return "withdrawn";
  if (!k.entryId) {
    if (k.wirksamAb && k.wirksamAb > now) return "scheduled";
    return k.deadline < now ? "overdue" : "open";
  }
  return isPastDeadlineUnfulfilled(k.deadline, k.fulfilledAt ?? null, now) ? "late" : "fulfilled";
}

/** Normalizes a raw verifikationStatus string to VerifikationStatus */
export function mapVerifikationStatus(vs: string | null): VerifikationStatus {
  if (vs === "ai") return "ai";
  if (vs === "manual") return "manual";
  if (vs === "rejected") return "rejected";
  if (vs === "pending") return "pending";
  if (vs === "not_required") return "not_required";
  return "unverified";
}

/**
 * Die Fassung, die zu `at` galt: die jüngste Zeile mit `effectiveFrom <= at`, sonst `fallback`.
 *
 * Geteilt mit `offenseRuleResolver` (offenseRules.ts) — dieselbe Frage, zweimal gestellt: dort für
 * das OB einer Vergehensart, hier für die Reinigungs-Werte. Beim dritten Historie-Feature wäre das
 * sonst die dritte handgeschriebene Kopie.
 *
 * Linearer Scan statt Binärsuche: eine Zeile entsteht nur bei einer echten Änderung, die Listen sind
 * kurz, und der Aufwand liegt weit unter dem einen DB-Roundtrip, der sie geholt hat.
 */
export function effectiveAt<T extends { effectiveFrom: Date }, F>(rows: T[], at: Date, fallback: F): T | F {
  let found: T | F = fallback;
  let latest = -Infinity;
  for (const row of rows) {
    const from = row.effectiveFrom.getTime();
    if (from <= at.getTime() && from >= latest) {
      found = row;
      latest = from;
    }
  }
  return found;
}

export type CleaningPauseAllowance = { allowed: boolean; maxMinutes: number };

/**
 * Die Reinigungs-Regeln als das, was sie sind: ein Stand, der sich ÄNDERN kann.
 *
 * Ein festes Objekt beantwortet jeden Zeitpunkt gleich — richtig für die Durchsetzung („darf ich
 * JETZT öffnen?") und für Tests. Eine Funktion beantwortet ihn nach der Fassung von damals —
 * richtig für alles, was Vergangenes abbildet (Begründung am Modell `CleaningRuleChange`).
 *
 * Aufgelöst wird immer am Zeitpunkt der REINIGUNGSÖFFNUNG: sie entscheidet, ob diese Öffnung die
 * Session unterbricht oder beendet, und das ist eine Eigenschaft der Öffnung, nicht des späteren
 * Wiederverschlusses.
 */
export type CleaningPauseRules = CleaningPauseAllowance | ((at: Date) => CleaningPauseAllowance);

/** Die Fassung, die zu `at` galt. Ohne Regeln gilt „keine Reinigung" — derselbe Ausweichwert wie
 *  bisher, wenn ein Aufrufer sie gar nicht mitgibt. */
export function cleaningAt(rules: CleaningPauseRules | undefined, at: Date): CleaningPauseAllowance {
  if (!rules) return { allowed: false, maxMinutes: 0 };
  return typeof rules === "function" ? rules(at) : rules;
}

/**
 * Frische 5-stellige Zufalls-Nummer (10000–99999) — der handschriftliche Code, den ein Foto zeigen
 * muss, damit die Bilderkennung es überhaupt beurteilen kann.
 *
 * Hier und nicht im Kontroll-Service, obwohl sie dort entstand: sie hat keinerlei Bezug zur
 * `KontrollAnforderung` und wird inzwischen von drei fachlich verschiedenen Stellen gebraucht
 * (Kontrolle, Auto-Kontrolle, Aufgaben-Nachweis). Der Aufgaben-Service zog sich sonst über einen
 * Einzeiler den gesamten Mail-/Push-Importgraphen des Kontroll-Services herein.
 */
export function generateKontrollCode(): string {
  // Web Crypto statt `node:crypto`: utils.ts liegt auch im Client-Bundle. Verwerfungsverfahren, damit
  // die Verteilung gleichmässig bleibt (2^32 ist kein Vielfaches von 90000).
  const range = 90000;
  const limit = 0x100000000 - (0x100000000 % range);
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return String(10000 + (buf[0] % range));
}

/** Type-pair definition for pair-building. KG_PAIR is the default; WEAR_PAIR is for
 *  user-defined non-KG categories (Plug, Collar, etc.). */
export type PairTypes = { close: string; open: string };

export const KG_PAIR: PairTypes = { close: "VERSCHLUSS", open: "OEFFNEN" };

export const WEAR_PAIR: PairTypes = { close: "WEAR_BEGIN", open: "WEAR_END" };

/** Keine `categoryId`-Option: nach Kategorie zu paaren ist strukturell falsch, weil zwei Geräte
 *  derselben Kategorie gleichzeitig getragen werden können — der Ein-Slot-Zustandsautomat unten
 *  bildet immer nur EIN offenes Gerät ab. Wer je Kategorie rechnen will, paart je GERÄT und
 *  gruppiert danach: `wearSessionPairsByCategory` / `wearHourPairsByCategory` in `sessionModel.ts`. */
export type BuildPairsOptions = {
  types?: PairTypes;
  /** Only honored when `types === KG_PAIR`. Ignored for WEAR_PAIR. */
  cleaning?: CleaningPauseRules;
};

type PairResult<E, K> = {
  verschluss: E;
  oeffnen: E | null;
  active: boolean;
  /** True nur für ein Pair, das die Anomalie "zwei Schliess-Einträge ohne dazwischenliegenden
   *  Öffnen-Eintrag" abbildet (siehe buildPairs). `active` wird für solche Pairs auf `true` gesetzt,
   *  damit das Invariant `oeffnen===null ⟺ active` hält — Konsumenten, die "die aktuell laufende
   *  Session" suchen (statt nur das Invariant zu respektieren), müssen `orphaned` zusätzlich
   *  ausschliessen, sonst kann ein längst überholter Eintrag als "gerade jetzt aktiv" erscheinen. */
  orphaned?: boolean;
  kontrollen: K[];
  interruptions: { oeffnen: E; verschluss: E }[];
};

/** True iff the legacy 3rd arg shape (bare Regeln statt Options-Objekt) was passed. Eine FUNKTION
 *  ist immer die Legacy-Form: ein Options-Objekt ist nie aufrufbar. */
function isLegacyCleaningArg(arg: unknown): arg is CleaningPauseRules {
  if (typeof arg === "function") return true;
  return !!arg && typeof arg === "object"
    && "allowed" in arg
    && !("types" in arg) && !("cleaning" in arg);
}

function normalizeBuildPairsOptions(
  arg?: CleaningPauseRules | BuildPairsOptions,
): { types: PairTypes; cleaning: CleaningPauseRules | undefined } {
  if (!arg) return { types: KG_PAIR, cleaning: undefined };
  if (isLegacyCleaningArg(arg)) return { types: KG_PAIR, cleaning: arg };
  return { types: arg.types ?? KG_PAIR, cleaning: arg.cleaning };
}

/** Filters entries to the given pair-types, then sorts ascending by startTime.
 *  Exported for callers that hand `buildPairs`/`buildWearSessions` a pre-loaded, unsorted entry list
 *  (see `TaskEntrySource`) — they must not re-spell the type literals.
 *
 *  Hier fällt zugleich der schwebende Verschluss weg — der EINE Trichter der Speicher-Seite, siehe
 *  `lockPending.ts`. Deshalb sind `boltConfirmedAt` und `openAwaitsBolt` PFLICHTFELDER der Signatur:
 *  ein Aufrufer, der die Spalte nicht lädt, bekommt einen Compiler-Fehler statt einer Session, die
 *  einen noch gar nicht vollzogenen Verschluss enthält. (Für WEAR-Paare ist die Regel wirkungslos —
 *  sie kennen keinen VERSCHLUSS —, die Spalte mitzuladen kostet dort nichts.) */
export function filterAndSortPairEntries<E extends { type: string; startTime: Date; boltConfirmedAt: Date | null; openAwaitsBolt: boolean }>(
  entries: E[],
  types: PairTypes,
): E[] {
  return [...entries]
    .filter((e) => (e.type === types.close || e.type === types.open) && isEffectiveEntry(e))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/** Frist, bis zu der ein Wiederverschluss eine Reinigungsöffnung als blosse UNTERBRECHUNG der
 *  laufenden Session fortführt — danach zerfällt sie in zwei Sessions. Öffnung + `maxMinutes`.
 *
 *  Bewusst NICHT dieselbe Frist wie {@link import("../strafbuch/strafbuch").cleaningRelockObligation}: die
 *  beantwortet die Strafbuch-Frage („gibt es dafür ein Vergehen?"), hängt an einer aktiven
 *  Sperrzeit und reicht bei konfigurierten Fenstern bis ans Fensterende — bei einem 20–22-Uhr-
 *  Fenster also Stunden über diese Frist hinaus. Wer die beiden vertauscht, zeigt dem Sub einen
 *  Countdown, nach dessen Ablauf seine Session längst geteilt ist. Zwei Fragen, zwei Regeln. */
export function cleaningInterruptionDeadline(openStartTime: Date, maxMinutes: number): Date {
  return new Date(openStartTime.getTime() + maxMinutes * 60_000);
}

/** Läuft gerade eine Reinigungspause — und bis wann? `null`, wenn der jüngste KG-Eintrag keine
 *  Reinigungsöffnung ist, Reinigung nicht erlaubt ist oder die Frist schon verstrichen ist (dann
 *  ist die Session wirklich beendet und „Geöffnet seit …" die richtige Anzeige).
 *
 *  Dieselbe Bedingung, nach der {@link buildPairs} die Session fortführt — deshalb hier und nicht
 *  in der Seite: sonst beantworten Anzeige und Session-Modell dieselbe Frage verschieden. */
export function runningCleaningPauseUntil(
  latest: { type: string; oeffnenGrund?: string | null; startTime: Date } | null,
  cleaning: CleaningPauseRules,
  now: Date,
): Date | null {
  if (latest?.type !== KG_PAIR.open || latest.oeffnenGrund !== "REINIGUNG") return null;
  // Die Fassung DIESER Öffnung, wie in `buildPairs` — eine Pause, die beim Öffnen erlaubt war,
  // bleibt es bis zu ihrem Ende, auch wenn die Keyholderin zwischendurch umstellt.
  const rules = cleaningAt(cleaning, latest.startTime);
  if (!rules.allowed) return null;
  const until = cleaningInterruptionDeadline(latest.startTime, rules.maxMinutes);
  // `>=`, nicht `>`: {@link buildPairs} verschmilzt einen Wiederverschluss noch, der EXAKT auf der
  // Frist liegt. Mit `>` zeigte die Anzeige in dieser Millisekunde „beendet", während das Modell
  // die Session fortführt — genau der Widerspruch, den diese Ableitung ausschliessen soll.
  return until >= now ? until : null;
}

/** Builds close/open pairs with associated Kontrollen, newest first.
 *  Defaults to KG (VERSCHLUSS/OEFFNEN). Pass `{ types: WEAR_PAIR }` for user-defined categories —
 *  dann aber je GERÄT (siehe `buildWearSessions`), nie über eine ganze Kategorie hinweg.
 *  Reinigungs-interruption only applies to KG pairs.
 *
 *  Backward-compat: a bare `CleaningPauseAllowance` as the 3rd arg is accepted (legacy callers). */
export function buildPairs<
  E extends {
    id: string;
    type: string;
    startTime: Date;
    /** Siehe `filterAndSortPairEntries`: Pflichtfeld, damit kein Aufrufer die Spalte weglässt und
     *  damit still einen noch nicht vollzogenen Verschluss in die Sessions holt. */
    boltConfirmedAt: Date | null;
    openAwaitsBolt: boolean;
    oeffnenGrund?: string | null;
    device?: { categoryId?: string | null } | null;
  },
  K extends { time: Date }
>(
  entries: E[],
  kontrollen: K[],
  reinigungOrOptions?: CleaningPauseRules | BuildPairsOptions,
): PairResult<E, K>[] {
  const { types, cleaning } = normalizeBuildPairsOptions(reinigungOrOptions);
  /** Unterbricht eine Reinigungsöffnung zu IHRER Zeit die Session — und wenn ja, wie lange? Die
   *  Regeln je Öffnung statt einmal für die ganze Liste: sonst schriebe die heutige Fassung die
   *  Sessions der Vergangenheit um. Für WEAR_PAIR gibt es keine Reinigungspausen. */
  const cleaningPause = (o: E): CleaningPauseAllowance | null => {
    if (types !== KG_PAIR) return null;
    const rules = cleaningAt(cleaning, o.startTime);
    return rules.allowed ? rules : null;
  };

  const asc = filterAndSortPairEntries(entries, types);

  const pairs: PairResult<E, K>[] = [];
  let pending: E | null = null;
  /** Die angenommene Reinigungspause SAMT der Fassung, unter der sie angenommen wurde — die Frist
   *  des Wiederverschlusses gehört zur Öffnung, nicht zum Zeitpunkt des Verschlusses. */
  let pendingCleaning: { entry: E; maxMinutes: number } | null = null;
  let currentInterruptions: { oeffnen: E; verschluss: E }[] = [];

  for (const e of asc) {
    if (e.type === types.close) {
      if (pendingCleaning && pending) {
        if (e.startTime <= cleaningInterruptionDeadline(pendingCleaning.entry.startTime, pendingCleaning.maxMinutes)) {
          // Valid interruption – continue session
          currentInterruptions.push({ oeffnen: pendingCleaning.entry, verschluss: e });
          pendingCleaning = null;
        } else {
          // Timeout – close session at reinigung OEFFNEN, start new session
          pairs.push({ verschluss: pending, oeffnen: pendingCleaning.entry, active: false, kontrollen: [], interruptions: currentInterruptions });
          pendingCleaning = null;
          currentInterruptions = [];
          pending = e;
        }
      } else {
        if (pending) {
          // Daten-Anomalie: zwei Schliess-Einträge ohne dazwischenliegenden Öffnen-Eintrag (z.B.
          // Admin-Backdating, das zwischen ein bestehendes Paar rutscht). `active:true` hält das
          // Invariant oeffnen===null ⟺ active — Konsumenten der "aktuell laufenden Session"
          // müssen zusätzlich `orphaned` ausschliessen (siehe `getOpenPair`/`PairResult`).
          // Sichtbar für den Keyholder über `get_session`s `dataQualityFlags` (sessions.ts), nicht
          // hier geloggt — buildPairs läuft mehrfach pro Request, ein Log hier wäre reiner Lärm.
          pairs.push({ verschluss: pending, oeffnen: null, active: true, orphaned: true, kontrollen: [], interruptions: currentInterruptions });
        }
        currentInterruptions = [];
        pending = e;
      }
    } else if (e.type === types.open && pending) {
      const pause = e.oeffnenGrund === "REINIGUNG" ? cleaningPause(e) : null;
      if (pause) {
        pendingCleaning = { entry: e, maxMinutes: pause.maxMinutes };
      } else {
        if (pendingCleaning) {
          // Pending reinigung never got a re-lock in time → close at reinigung OEFFNEN
          pairs.push({ verschluss: pending, oeffnen: pendingCleaning.entry, active: false, kontrollen: [], interruptions: currentInterruptions });
          pendingCleaning = null;
          currentInterruptions = [];
          pending = null;
        } else {
          pairs.push({ verschluss: pending, oeffnen: e, active: false, kontrollen: [], interruptions: currentInterruptions });
          currentInterruptions = [];
          pending = null;
        }
      }
    }
  }

  // Handle open session (still wearing or pending reinigung)
  if (pending) {
    if (pendingCleaning) {
      // Device is currently open for cleaning – show session as ended at reinigung OEFFNEN.
      // If user re-locks within maxMinutes, the next page load will merge it as an interruption.
      pairs.push({ verschluss: pending, oeffnen: pendingCleaning.entry, active: false, kontrollen: [], interruptions: currentInterruptions });
    } else {
      pairs.push({ verschluss: pending, oeffnen: null, active: true, kontrollen: [], interruptions: currentInterruptions });
    }
  }

  for (const k of kontrollen) {
    const pair = pairs.reduce<PairResult<E, K> | null>((best, p) => {
      const start = p.verschluss.startTime.getTime();
      const end = p.oeffnen ? p.oeffnen.startTime.getTime() : Infinity;
      if (k.time.getTime() < start || k.time.getTime() > end) return best;
      if (!best) return p;
      return p.verschluss.startTime > best.verschluss.startTime ? p : best;
    }, null);
    if (pair) pair.kontrollen.push(k);
  }

  return pairs.reverse();
}

/** Die tatsächlich aktuell laufende Session/Pair aus einem `buildPairs`-Ergebnis. `active` allein
 *  reicht nicht: ein verwaistes Pair (siehe `orphaned` auf `PairResult`) bekommt `active:true` nur,
 *  um das Invariant oeffnen===null ⟺ active zu halten — es ist keine echte laufende Session.
 *  EINZIGE Stelle für diesen Check, damit ein künftiger Aufrufer den `orphaned`-Ausschluss nicht
 *  vergisst (sonst kann ein längst überholtes Pair wieder als "gerade jetzt aktiv" erscheinen). */
export function getOpenPair<P extends { active: boolean; orphaned?: boolean }>(pairs: P[]): P | null {
  return pairs.find((p) => p.active && !p.orphaned) ?? null;
}

/** Total pause duration from interruptions in ms */
export function interruptionPauseMs(interruptions: { oeffnen: { startTime: Date }; verschluss: { startTime: Date } }[]): number {
  return interruptions.reduce((s, i) => s + i.verschluss.startTime.getTime() - i.oeffnen.startTime.getTime(), 0);
}

/** Alle (Wieder-)Verschluss-Zeitpunkte einer Session mit Gerätenamen — der Session-Start plus jeder
 *  Wiederverschluss nach einer Reinigungspause. Basis für `wornDeviceNameAt`; geteilt von der
 *  Sessions-Liste und dem Laufende-Session-Timeline. */
export function buildLockPoints(pair: {
  verschluss: { startTime: Date; device?: { name?: string | null } | null };
  interruptions?: { verschluss: { startTime: Date; device?: { name?: string | null } | null } }[];
}): { time: Date; name: string | null }[] {
  return [
    { time: pair.verschluss.startTime, name: pair.verschluss.device?.name ?? null },
    ...(pair.interruptions ?? []).map((i) => ({ time: i.verschluss.startTime, name: i.verschluss.device?.name ?? null })),
  ];
}

/** Getragenes Gerät zu einem Zeitpunkt innerhalb einer Session: nach einer Reinigungspause gilt die
 *  Angabe des Wiederverschlusses, nicht die des Session-Starts (dasselbe Prinzip wie `currentLock` in
 *  liveState.ts). `lockPoints` = alle (Wieder-)Verschluss-Zeitpunkte mit Gerätenamen; zurück kommt das
 *  Gerät des jüngsten Verschlusses ≤ `at`. */
export function wornDeviceNameAt(lockPoints: { time: Date; name: string | null }[], at: Date): string | null {
  const sorted = [...lockPoints].sort((a, b) => a.time.getTime() - b.time.getTime());
  let name = sorted[0]?.name ?? null;
  for (const lp of sorted) {
    if (lp.time.getTime() <= at.getTime()) name = lp.name;
    else break;
  }
  return name;
}

/**
 * Die Dauer EINER abgeschlossenen Session: Öffnung minus Verschluss, abzüglich der
 * Reinigungspausen.
 *
 * Eigene Funktion, weil zwei Zählweisen darauf aufsetzen und nur in EINER Sache abweichen dürfen:
 * `completedPairsFrom` lässt nicht-positive Dauern weg (für Rekorde und Mittelwerte), die Summe
 * der Tragezeiten nimmt sie mit (`wearCountsCached`). Die Rechnung selbst muss dieselbe sein.
 */
export function pairDurationMs(pair: {
  verschluss: { startTime: Date };
  oeffnen: { startTime: Date };
  interruptions: { oeffnen: { startTime: Date }; verschluss: { startTime: Date } }[];
}): number {
  return pair.oeffnen.startTime.getTime() - pair.verschluss.startTime.getTime() - interruptionPauseMs(pair.interruptions);
}

/** Maps built pairs (from `buildPairs`) to completed sessions with interruption-adjusted
 *  duration. Drops open pairs and non-positive durations. */
export function completedPairsFrom<E extends { startTime: Date }>(
  pairs: { verschluss: E; oeffnen: E | null; interruptions: { oeffnen: E; verschluss: E }[] }[],
): { verschluss: E; oeffnen: E; durationMs: number }[] {
  return pairs
    .filter((p) => p.oeffnen !== null)
    .map((p) => ({
      verschluss: p.verschluss,
      oeffnen: p.oeffnen!,
      durationMs: pairDurationMs({ verschluss: p.verschluss, oeffnen: p.oeffnen!, interruptions: p.interruptions }),
    }))
    .filter((p) => p.durationMs > 0);
}

/** Aggregates completed session pairs: count, total/avg duration, longest & shortest pair.
 *  Generic over the pair shape — only `durationMs` is required. */
export function summarizeSessions<T extends { durationMs: number }>(completed: T[]): {
  count: number;
  totalMs: number;
  avgMs: number;
  longest: T | null;
  shortest: T | null;
} {
  const count = completed.length;
  const totalMs = completed.reduce((s, p) => s + p.durationMs, 0);
  return {
    count,
    totalMs,
    avgMs: count ? Math.round(totalMs / count) : 0,
    longest: count ? completed.reduce((a, b) => (a.durationMs > b.durationMs ? a : b)) : null,
    shortest: count ? completed.reduce((a, b) => (a.durationMs < b.durationMs ? a : b)) : null,
  };
}

/** Die Zeitpunkte aller Orgasmus-Einträge, AUFSTEIGEND — die Eingabe von {@link longestOrgasmFreeGap}
 *  (MCP `records`/`denial_trend`) und der orgasmusfreien Dauer eines Tagebuch-Eintrags (`journal.ts`).
 *  Der Rekorde-Block der Statistik-Seite kommt über `orgasmEntriesCached` an dieselbe Liste. */
export function orgasmTimes(entries: readonly { type: string; startTime: Date }[]): Date[] {
  return entries.filter((e) => e.type === "ORGASMUS").map((e) => e.startTime).sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Die längste orgasmusfreie Strecke: die grösste Lücke zwischen zwei aufeinanderfolgenden Orgasmen
 * ODER die gerade laufende Strecke (`now` − letzter Orgasmus), je nachdem welche länger ist. `times`
 * MUSS aufsteigend sortiert sein. `since` datiert den Beginn der Rekord-Strecke (der Orgasmus davor,
 * bzw. bei laufendem Rekord der letzte Orgasmus).
 *
 * Rückgabe `null` heisst „kein Orgasmus erfasst", also kein Rekord. EINE Quelle für UI (Rekorde-Block)
 * und MCP (`records`/`denial_trend`), damit beide dieselbe Zahl nennen.
 */
export function longestOrgasmFreeGap(
  times: Date[],
  now: Date,
): { ms: number; since: Date } | null {
  if (times.length === 0) return null;
  const last = times.at(-1)!; // already checked the length one line above, this cannot be undefined
  // Startwert ist die laufende Strecke; nur eine STRIKT längere abgeschlossene Lücke verdrängt sie —
  // bei Gleichstand bleibt es die laufende, denn die ist der lebendige (noch wachsende) Rekord.
  let best: { ms: number; since: Date } = { ms: now.getTime() - last.getTime(), since: last };
  for (let i = 1; i < times.length; i++) {
    const ms = times[i].getTime() - times[i - 1].getTime();
    if (ms > best.ms) best = { ms, since: times[i - 1] };
  }
  return best;
}

/** Returns photo verification status for an entry */
export function photoStatus(v: { imageUrl: string | null; imageExifTime: Date | null; startTime: Date }): "no-photo" | "exif-mismatch" | "ok" {
  if (!v.imageUrl) return "no-photo";
  if (v.imageExifTime && hasExifMismatch(v.imageExifTime, v.startTime)) return "exif-mismatch";
  return "ok";
}

// ── Pair-based wearing hours (for batch range queries like StatsMain) ────────

export type WearPair = { start: Date; end: Date };

/** Baut die KG-Trageintervalle (VERSCHLUSS→OEFFNEN); eine offene Session endet bei `now`.
 *
 *  BEWUSST nur KG: der eine `pending`-Slot genügt, weil immer nur EIN Gürtel getragen wird. Für
 *  Trage-Kategorien (Plug, Halsband …) taugt dieser Automat nicht — dort können zwei Geräte
 *  gleichzeitig laufen, und ein zweiter Beginn schlösse das erste Paar bei `now` statt beim
 *  Beginn. Deshalb nimmt die Funktion keine `types`/`categoryId` mehr entgegen: die
 *  Trage-Kategorien gehen über `wearHourPairsByCategory` (paart je GERÄT). */
export function buildKgWearPairs<
  E extends { type: string; startTime: Date; boltConfirmedAt: Date | null; openAwaitsBolt: boolean }
>(entries: E[], now: Date): WearPair[] {
  const asc = filterAndSortPairEntries(entries, KG_PAIR);
  const pairs: WearPair[] = [];
  let pending: { startTime: Date } | null = null;
  for (const e of asc) {
    if (e.type === KG_PAIR.close) {
      // Zweiter Verschluss ohne Öffnen dazwischen: das verwaiste Paar zählt NICHT (wie in
      // `buildPairs`, das es als `orphaned` markiert) — es bei `now` zu schliessen überlappte das
      // nächste und zählte die Stunden doppelt.
      pending = e;
    } else if (e.type === KG_PAIR.open && pending) {
      pairs.push({ start: pending.startTime, end: e.startTime });
      pending = null;
    }
  }
  if (pending) pairs.push({ start: pending.startTime, end: now });
  return pairs;
}

/** Verschmilzt überlappende (und aneinandergrenzende) Intervalle zu einer überlappungsfreien,
 *  aufsteigenden Folge — aus getragener Zeit wird damit WANDUHR-Zeit: zwei gleichzeitig getragene
 *  Geräte derselben Kategorie ergeben 2 h, nicht 4 h.
 *
 *  Nötig, weil `wearingHoursFromPairs` stumpf aufsummiert; überlappende Paare zählte es doppelt.
 *  KG-Paare überlappen nie (ein Gürtel), Trage-Paare je Gerät sehr wohl. */
export function mergeWearPairs(pairs: WearPair[]): WearPair[] {
  const asc = [...pairs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: WearPair[] = [];
  for (const p of asc) {
    const last = merged.at(-1);
    if (last && p.start.getTime() <= last.end.getTime()) {
      if (p.end.getTime() > last.end.getTime()) last.end = p.end;
    } else {
      merged.push({ start: p.start, end: p.end });
    }
  }
  return merged;
}

/** Calculates wearing hours from pre-built pairs within a date range.
 *  Summiert stumpf — überlappende Paare zählen doppelt. Wer Wanduhr-Zeit will, gibt hier bereits
 *  verschmolzene Paare hinein (`mergeWearPairs` / `wearHourPairsByCategory`). */
export function wearingHoursFromPairs(pairs: WearPair[], rangeStart: Date, rangeEnd: Date): number {
  let totalMs = 0;
  for (const p of pairs) {
    const overlap = Math.min(p.end.getTime(), rangeEnd.getTime()) - Math.max(p.start.getTime(), rangeStart.getTime());
    if (overlap > 0) totalMs += overlap;
  }
  return totalMs / 3600000;
}

/** Die vier KG-Tragestunden-Kennzahlen (heute / laufende Woche / Monat / Jahr) — Rückgabe von
 *  {@link calculateWearingHoursByRange}. EINE Quelle für die Form, die sonst an mehreren Stellen
 *  wortgleich stand (Ziel-Zeile, Kategorie-Ziel). */
export interface WearHours {
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
}

/** KG-Tragestunden für heute / laufende Woche / Monat / Jahr.
 *  Baut die Paare einmal und nutzt sie für alle vier Zeiträume (statt vier voller Sortierungen).
 *  `tz` ist die Zeitzone der SUB: „heute" muss denselben Tag meinen wie das aufgelöste Ziel
 *  (`resolveDayGoalTarget`) und die verstrichene Zeit daneben — sonst haben Zähler und Nenner
 *  desselben Fortschrittsbalkens zwei verschiedene Mitternachte. */
export function calculateWearingHoursByRange<
  E extends {
    type: string;
    startTime: Date;
    boltConfirmedAt: Date | null;
    openAwaitsBolt: boolean;
    oeffnenGrund?: string | null;
  }
>(
  entries: E[],
  now: Date,
  tz: string,
): WearHours {
  return wearHoursOfPairs(buildKgWearPairs(entries, now), now, tz);
}

/** Dieselben vier Kennzahlen aus BEREITS gebauten Paaren.
 *
 *  Getrennt von `calculateWearingHoursByRange`, weil `buildKgWearPairs` die ganze Historie filtert
 *  UND sortiert — wer die Paare ohnehin schon hat (gecacht oder für eine Ziel-Auswertung gebaut),
 *  soll sie nicht ein zweites Mal bauen. */
export function wearHoursOfPairs(pairs: WearPair[], now: Date, tz: string): WearHours {
  return {
    tagH: wearingHoursFromPairs(pairs, getMidnightToday(now, tz), now),
    wocheH: wearingHoursFromPairs(pairs, getWeekStart(now, tz), now),
    monatH: wearingHoursFromPairs(pairs, getMonthStart(now, tz), now),
    jahrH: wearingHoursFromPairs(pairs, getYearStart(now, tz), now),
  };
}

type KontrollAnforderungIn = {
  id: string; deadline: Date; kommentar: string | null;
  /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
  code: string | null;
  /** ZIEL: null = KG. Gesetzt = Trage-Kontrolle, die in dieser (KG-)Liste nichts zu suchen hat. */
  categoryId?: string | null;
  fulfilledAt: Date | null; createdAt: Date; withdrawnAt: Date | null; entryId: string | null;
  wirksamAb?: Date | null;
  /** Pflichtfeld: unterscheidet ein Versäumnis von einem Rückzug (beide setzen `withdrawnAt`).
   *  Fehlte es im `select`, fiele jedes Versäumnis stillschweigend auf "withdrawn" zurück. */
  autoMarkedRemovedAt: Date | null;
  entry: { id: string; startTime: Date; createdAt: Date; imageUrl: string | null; note: string | null; verifikationStatus: string | null; verifikationReason?: string | null; verifikationReasonDetected?: string | null; keyDetected?: boolean | null; boxImageUrl?: string | null } | null;
};

type PruefungEntryIn = {
  id: string; startTime: Date; createdAt: Date; imageUrl: string | null; note: string | null;
  kontrollCode: string | null; verifikationStatus: string | null;
  /** Grund des gescheiterten Foto-Checks. Optional getippt: ein `select` ohne diese Spalten
   *  kompiliert und liefert dann still `verifikationFailure: null` — die Grund-Zeile fehlt einfach.
   *  Heute holen alle drei Aufrufer die vollen Zeilen; wer künftig auf `select` umstellt, muss die
   *  beiden Spalten bewusst mitnehmen. */
  verifikationReason?: string | null; verifikationReasonDetected?: string | null;
  keyDetected?: boolean | null;
  boxImageUrl?: string | null;
  /** Gesetzt = das GEZEIGTE Gerät einer Trage-Kontrolle (v5.0.1); eine KG-Prüfung trägt keines
   *  (das verschlossene Gerät steht am VERSCHLUSS). Entscheidet die KG-Filterung unten. */
  deviceId?: string | null;
};

export type KontrolleItem = {
  id: string; time: Date; imageUrl: string | null; code: string | null;
  deadline: Date | null; kommentar: string | null; note: string | null;
  anforderungStatus: AnforderungStatus | null; verifikationStatus: VerifikationStatus | null;
  /** WARUM der automatische Foto-Check nicht gematcht hat; `null` = gematcht, nie gelaufen oder
   *  inzwischen von Hand beurteilt. Ohne dieses Feld sah der Träger in seiner Session-Liste nur die
   *  graue „Nicht verifiziert"-Pille und konnte nicht wissen, ob der Code unlesbar war, falsche
   *  Ziffern zeigte oder das Siegel fehlte — die Sackgasse, vor der `verifyReason.ts` warnt.
   *  Immer über `toVerifyFailure()` gebaut: nur die trägt die Schranke „gilt nur ohne Urteil".
   *
   *  PFLICHT — aber nur für die WEITERGABE: wer aus einem `KontrolleItem` eine Anzeige-Zeile baut,
   *  kann das Feld nicht vergessen, ohne einen Compile-Fehler zu bekommen. Dass der Grund auch
   *  wirklich GELADEN wurde, garantiert das NICHT: die Eingangs-Felder oben sind optional, ein
   *  `select` ohne die Spalten ergibt hier lautlos `null`. */
  verifikationFailure: VerifyFailure | null;
  entryId: string | null; submittedAt: Date | null;
  /** Wann der Eintrag WIRKLICH entstand (`Entry.createdAt`), unabhängig von der eingetippten Zeit.
   *  `time` ist sub-deklariert und rückdatierbar; wo eine Aussage von der Aktualität einer externen
   *  Quelle abhängt (Box-Telemetrie, `lib/boxKeyProof.ts`), zählt dieser Zeitpunkt. */
  recordedAt: Date;
  /** Urteil der Schlüssel-Erkennung auf dem Box-Foto DIESER Kontrolle (null = nicht geprüft).
   *  Trägt die zweite Hälfte des Nachweises: erst die Wiederholung bei jeder Kontrolle belegt,
   *  dass der Schlüssel drin GEBLIEBEN ist. */
  keyDetected: boolean | null;
  /** Foto durchs Sichtfenster der Box zu DIESER Kontrolle. */
  boxImageUrl: string | null;
};

/**
 * Builds a unified KontrolleItem list from KontrollAnforderungen + standalone PRUEFUNG entries.
 *
 * NUR KG-Kontrollen (v5.0.1). Die Liste hängt an der KG-Session — sie füttert die Paarbildung
 * (`buildPairs`), den Zeitstrahl und die Statistik. Eine Trage-Kontrolle gehört dort nicht hin: sie
 * beweist etwas über einen Plug, nicht über den Verschluss, und würde als Nachweis der laufenden
 * KG-Session gelesen. Gefiltert wird HIER statt an den drei Aufrufern — dort wäre es dreimal
 * dieselbe Regel, und wer sie an einer Stelle vergisst, bekommt keinen Fehler, sondern ein
 * falsches Bild.
 *
 * Das Kennzeichen ist das ZIEL: `categoryId === null` an der Anforderung, kein Gerät am Eintrag.
 * (Der KG-Prüfungs-Eintrag trägt bewusst nie eines, siehe /api/entries.)
 */
export function buildKontrolleItems(
  alleAnforderungenRaw: KontrollAnforderungIn[],
  pruefungEntriesRaw: PruefungEntryIn[],
  now: Date
): KontrolleItem[] {
  const alleAnforderungen = alleAnforderungenRaw.filter(k => (k.categoryId ?? null) === null);
  const pruefungEntries = pruefungEntriesRaw.filter(e => (e.deviceId ?? null) === null);
  const linkedEntryIds = new Set(alleAnforderungen.map(k => k.entryId).filter(Boolean));
  return [
    ...alleAnforderungen.map(k => ({
      id: k.id,
      time: k.entry ? k.entry.startTime : k.createdAt,
      imageUrl: k.entry?.imageUrl ?? null,
      code: k.code,
      deadline: k.deadline,
      kommentar: k.kommentar ?? null,
      note: k.entry?.note ?? null,
      anforderungStatus: mapAnforderungStatus(k, now),
      verifikationStatus: k.entry ? mapVerifikationStatus(k.entry.verifikationStatus) : null,
      // ROH-Status, nicht der gemappte: `mapVerifikationStatus` macht aus `null` bereits
      // "unverified", und `toVerifyFailure` würde den Grund dann als überholt verwerfen.
      verifikationFailure: k.entry
        ? toVerifyFailure(k.entry.verifikationStatus, k.entry.verifikationReason, k.entry.verifikationReasonDetected)
        : null,
      entryId: k.entry?.id ?? null,
      submittedAt: k.fulfilledAt ?? null,
      recordedAt: k.entry?.createdAt ?? k.createdAt,
      keyDetected: k.entry?.keyDetected ?? null,
      boxImageUrl: k.entry?.boxImageUrl ?? null,
    })),
    ...pruefungEntries
      .filter(e => !linkedEntryIds.has(e.id))
      .map(e => ({
        id: e.id,
        time: e.startTime,
        imageUrl: e.imageUrl,
        code: e.kontrollCode,
        deadline: null as Date | null,
        kommentar: null as string | null,
        note: e.note,
        anforderungStatus: null,
        verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
        verifikationFailure: toVerifyFailure(e.verifikationStatus, e.verifikationReason, e.verifikationReasonDetected),
        entryId: e.id,
        submittedAt: null as Date | null,
        recordedAt: e.createdAt,
        keyDetected: e.keyDetected ?? null,
        boxImageUrl: e.boxImageUrl ?? null,
      })),
  ];
}

/** Was der Sub von seinen Kontrollen zu sehen bekommt: alles ausser den WIRKLICH zurückgezogenen.
 *  Ein Rückzug (Keyholder, Auto-Kontrolle bei offenem KG, Überschneidungs-Schutz) ist ein
 *  Nicht-Ereignis. Ein VERSÄUMNIS bleibt sichtbar — es trägt den Status "missed", nicht "withdrawn".
 *  Die Keyholder-Kontroll-History filtert bewusst NICHT: sie zeigt der Keyholderin ihre eigenen
 *  Rückzüge. */
export function isSubVisibleKontrolle(item: { anforderungStatus: string | null }): boolean {
  return item.anforderungStatus !== "withdrawn";
}

/**
 * Ein aus der URL stammendes Weiterleitungsziel auf „interner Pfad" einengen — sonst `null`.
 *
 * Nötig, seit die Bedingungs-Links einer Aufgabe ein `?redirectTo=` mitgeben (Ketten-Weiterleitung
 * von Bedingung zu Bedingung). Alle anderen `redirectTo` im Projekt baut der Server selbst; sobald
 * der Wert aus der Adresszeile kommt, ist ein ungeprüftes `router.push(target)` eine offene
 * Weiterleitung: `//example.com` und `https://example.com` sind für den Router externe Ziele.
 * Backslashes fallen ebenfalls raus — manche Parser lesen `/\evil.com` wie `//evil.com`.
 */
export function safeInternalPath(path: string | undefined | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}
