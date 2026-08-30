import { buildPairs, getOpenPair, interruptionPauseMs, msToHours, type CleaningPauseRules } from "@/lib/utils";
import { inspectionTargetLabel } from "@/lib/inspectionTarget";

/**
 * Der LIVE-Zustand eines Subs — Verschluss, offene Kontrolle, laufende Sperrzeit, offenes
 * Orgasmus-Fenster, aktive Wear-Sessions.
 *
 * Reine Abbildung von DB-Zeilen auf die MCP-Form. Kein Prisma, kein Laden: die Zeilen holt der
 * Aufrufer über die Helfer in `queries.ts`.
 *
 * `fmt` formatiert einen Zeitpunkt (ISO-8601 mit Offset) — die Mapper entscheiden das nicht, sie
 * reichen es durch.
 */

/** Zeitformatierer des jeweiligen Tools. */
export type Fmt = (d: Date) => string;

const minutesUntil = (d: Date, now: Date) => Math.round((d.getTime() - now.getTime()) / 60_000);

// ── Verschluss-Zustand ────────────────────────────────────────────────────────

export interface LockState {
  isLocked: boolean;
  /** Verschlossen: Beginn des LAUFS (Session-Kopf, vor allen Reinigungspausen) — deckt sich mit
   *  `currentDurationHours` (A-01, MCP-Befundliste 2026-07-17: vorher der jüngste KG-Eintrag, also
   *  bei einem Lauf mit Pausen der letzte WIEDERVERSCHLUSS statt des Lauf-Anfangs — widersprach der
   *  gleichzeitig ausgewiesenen Dauer). Nicht verschlossen: `null` — kein aktiver Lauf, also kein
   *  Lauf-Anfang (früher trug das Feld hier den Öffnen-Zeitpunkt „offen seit", während
   *  durationHours/deviceName null waren — irreführend unter `currentRun`). */
  since: string | null;
  /** NUR bei isLocked: Beginn des AKTUELLEN SEGMENTS (letzter Wiederverschluss nach einer
   *  Reinigungspause, sonst identisch mit `since`). Der alte `since`-Wert vor A-01. */
  currentSegmentSince: string | null;
  currentDurationHours: number | null;
  /** Dauer des AKTUELLEN Segments (seit `currentSegmentSince`) — das Gegenstück zu
   *  `currentDurationHours`, das den ganzen Lauf misst. Ohne Reinigungspause identisch.
   *
   *  Existiert, weil `deviceName` das Gerät DIESES Segments nennt: wer den Namen mit der Lauf-Dauer
   *  paart, liest „Jura Cocoon seit 13.2 h", obwohl das Gerät erst beim letzten Wiederverschluss
   *  angelegt wurde. Ein Segment hat per Konstruktion keine Pause in sich, also ist das schlicht
   *  `now − currentSegmentSince`. */
  currentSegmentDurationHours: number | null;
  deviceName: string | null;
  /** Schlüssel-Deklaration des AKTUELLEN Verschlusses (siehe `Entry.keyInBox`). Nicht verschlossen → null. */
  keyInBox: boolean | null;
}

/** Minimalform eines Entrys für die Verschluss-Ableitung: was `buildPairs` braucht, plus der
 *  Gerätename für `deviceName`. */
export type LockEntry = {
  id: string;
  type: string;
  startTime: Date;
  oeffnenGrund: string | null;
  device: { name: string; categoryId?: string | null } | null;
  /** Siehe `Entry.keyInBox` (schema.prisma). Pflichtfeld: wäre es optional, könnte ein Select die
   *  Spalte weglassen und der Lock-Zustand meldete stillschweigend `null` — „nicht erklärt" statt
   *  „behält den Schlüssel". Der Compiler erzwingt so, dass JEDER Lock-Select sie lädt. */
  keyInBox: boolean | null;
};

/** Nur die Paar-Felder, die der Verschluss-Zustand liest — strukturell beschrieben, damit dieses
 *  Modul nicht den vollen `PairResult`-Typ aus `utils.ts` importieren muss. */
type LockPair<E> = {
  active: boolean;
  orphaned?: boolean;
  verschluss: E;
  interruptions: { oeffnen: E; verschluss: E }[];
};

/** Entries müssen nach `startTime` ABSTEIGEND sortiert sein (jüngster zuerst).
 *
 *  `prePairs`: schon gebaute `buildPairs`-Paare wiederverwenden statt sie erneut zu berechnen —
 *  dasselbe Sharing-Prinzip wie bei `buildSessions`s `prePairs` (siehe dort). Fehlt der Parameter
 *  (z.B. in `liveState.test.ts`, das mit rohen Entries direkt aufruft), rechnet diese Funktion die
 *  Paare wie bisher selbst. */
export function buildLockState<E extends LockEntry>(
  entries: E[],
  cleaning: CleaningPauseRules,
  now: Date,
  fmt: Fmt,
  prePairs?: LockPair<E>[],
): LockState {
  const pairs: LockPair<E>[] = prePairs ?? buildPairs(entries, [], cleaning);
  const latest = entries.find((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN") ?? null;
  const isLocked = latest?.type === "VERSCHLUSS";

  const activePair = getOpenPair(pairs);
  const currentDurationHours = isLocked && activePair
    ? msToHours(now.getTime() - activePair.verschluss.startTime.getTime() - interruptionPauseMs(activePair.interruptions))
    : null;

  // Currently worn device = newest re-lock of the session (the lock following the last
  // REINIGUNG pause), falling back to the session-start lock. A device swap during a
  // cleaning pause does not change the session head, so reading activePair.verschluss
  // alone would report the pre-pause device.
  const currentLock = activePair
    ? (activePair.interruptions.at(-1)?.verschluss ?? activePair.verschluss)
    : null;

  // Verschlossen: Lauf-Anfang (Session-Kopf), nicht der jüngste Eintrag — deckt sich mit
  // currentDurationHours, die schon immer ab dem Session-Kopf rechnet (A-01).
  // Nicht verschlossen ⇒ kein aktiver Lauf ⇒ since null (konsistent mit durationHours/deviceName/
  // currentSegmentSince, die dann ebenfalls null sind). `latest` bleibt für isLocked oben in Gebrauch.
  const since = isLocked && activePair ? fmt(activePair.verschluss.startTime) : null;
  // Der alte `since`: der jüngste KG-Eintrag, also bei einer laufenden Pause-Serie der letzte
  // Wiederverschluss. Ohne Pause ist currentLock === activePair.verschluss — dann `since` wieder-
  // verwenden statt fmt() ein zweites Mal auf dasselbe Datum anzuwenden.
  const currentSegmentSince = !isLocked || !currentLock ? null
    : currentLock === activePair!.verschluss ? since
    : fmt(currentLock.startTime);

  return {
    isLocked,
    since,
    currentSegmentSince,
    currentDurationHours,
    // Aus DEMSELBEN Lock-Eintrag wie deviceName — die Zahl, die zum genannten Gerät gehört.
    currentSegmentDurationHours: isLocked && currentLock
      ? msToHours(now.getTime() - currentLock.startTime.getTime())
      : null,
    deviceName: isLocked ? (currentLock?.device?.name ?? null) : null,
    // Aus DEMSELBEN Lock-Eintrag wie deviceName: nach einer Reinigungspause gilt die Angabe des
    // Wiederverschlusses, nicht die des Session-Starts.
    keyInBox: isLocked ? (currentLock?.keyInBox ?? null) : null,
  };
}

// ── Offene Anforderungen ──────────────────────────────────────────────────────

export interface OpenKontrolleView {
  /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
  code: string | null;
  /** ZIEL der Kontrolle: Geräte- bzw. Kategoriename. null = der Keuschheitsgürtel. Seit v5.0.1
   *  können mehrere Kontrollen parallel laufen (eine je Ziel) — ohne dieses Feld wären sie nicht
   *  auseinanderzuhalten. */
  target: string | null;
  deadline: string; overdue: boolean; remainingMinutes: number; comment: string | null;
}

export function mapOpenKontrolle(
  k: { code: string | null; deadline: Date; kommentar: string | null; category?: { name: string } | null; device?: { name: string } | null } | null,
  now: Date, fmt: Fmt,
): OpenKontrolleView | null {
  if (!k) return null;
  return {
    code: k.code,
    target: inspectionTargetLabel(k),
    deadline: fmt(k.deadline),
    overdue: k.deadline < now,
    remainingMinutes: minutesUntil(k.deadline, now),
    comment: k.kommentar,
  };
}

export interface ActiveLockPeriodView { endsAt: string | null; indefinite: boolean; remainingMinutes: number | null; message: string | null; cleaningAllowed: boolean; deviceName: string | null }

export function mapActiveLockPeriod(
  s: { endsAt: Date | null; message: string | null; cleaningAllowed: boolean; device: { name: string } | null } | null,
  now: Date, fmt: Fmt,
): ActiveLockPeriodView | null {
  if (!s) return null;
  return {
    endsAt: s.endsAt ? fmt(s.endsAt) : null,
    indefinite: s.endsAt === null,
    remainingMinutes: s.endsAt ? minutesUntil(s.endsAt, now) : null,
    message: s.message,
    cleaningAllowed: s.cleaningAllowed,
    deviceName: s.device?.name ?? null,
  };
}

/** Eine offene Verschluss-Anforderung: der Sub SOLL sich einschliessen, hat es aber noch nicht getan. */
export interface OpenLockRequestView {
  /** Für `edit_lock_request` / `withdraw` — ohne id lässt sich EINE von mehreren offenen nicht ansprechen. */
  id: string;
  endsAt: string | null;
  overdue: boolean;
  remainingMinutes: number | null;
  message: string | null;
  dauerH: number | null;
  /** Absolutes Sperr-Ende nach dem Einschliessen (Alternative zu dauerH), oder null. */
  lockUntilAt: string | null;
  cleaningAllowed: boolean;
  deviceName: string | null;
}

export function mapOpenLockRequest(
  a: { id: string; endsAt: Date | null; message: string | null; dauerH: number | null; lockEndsAt: Date | null; cleaningAllowed: boolean; device: { name: string } | null } | null,
  now: Date, fmt: Fmt,
): OpenLockRequestView | null {
  if (!a) return null;
  return {
    id: a.id,
    endsAt: a.endsAt ? fmt(a.endsAt) : null,
    overdue: a.endsAt ? a.endsAt < now : false,
    remainingMinutes: a.endsAt ? minutesUntil(a.endsAt, now) : null,
    message: a.message,
    dauerH: a.dauerH,
    lockUntilAt: a.lockEndsAt ? fmt(a.lockEndsAt) : null,
    cleaningAllowed: a.cleaningAllowed,
    deviceName: a.device?.name ?? null,
  };
}

export interface OpenOrgasmusAnforderungView { art: string; beginntAt: string; endsAt: string; active: boolean; requiredType: string | null; message: string | null; remainingMinutes: number }

export function mapOpenOrgasmusAnforderung(
  o: { art: string; beginntAt: Date; endsAt: Date; vorgegebeneArt: string | null; message: string | null } | null,
  now: Date, fmt: Fmt,
): OpenOrgasmusAnforderungView | null {
  if (!o) return null;
  return {
    art: o.art,
    beginntAt: fmt(o.beginntAt),
    endsAt: fmt(o.endsAt),
    active: o.beginntAt <= now,
    requiredType: o.vorgegebeneArt,
    message: o.message,
    remainingMinutes: minutesUntil(o.endsAt, now),
  };
}

// ── Laufende Wear-Sessions ────────────────────────────────────────────────────

export interface ActiveWearSessionView { category: string; deviceName: string; since: string; durationHours: number }

export function mapActiveWearSessions(
  sessions: { categoryName: string; deviceName: string; since: Date }[],
  now: Date, fmt: Fmt,
): ActiveWearSessionView[] {
  return sessions.map((s) => ({
    category: s.categoryName,
    deviceName: s.deviceName,
    since: fmt(s.since),
    durationHours: msToHours(now.getTime() - s.since.getTime()),
  }));
}

// ── Unterbrochene Sperrzeit ───────────────────────────────────────────────────

export interface InterruptedLockPeriodView {
  /** Das ursprüngliche Ende, das die Keyholderin gesetzt hatte. null = war unbefristet. */
  originalEndsAt: string | null;
  indefinite: boolean;
  /** Wann die Öffnung sie aufgebrochen hat. */
  interruptedAt: string;
  message: string | null;
}

/**
 * Eine Sperrzeit, die durch eine Öffnung endete und deren ursprüngliches Ende noch nicht verstrichen
 * ist. Sie wird NICHT als `activeLockPeriod` gemeldet — sie wird gerade nicht vollstreckt, und ein
 * Keyholder-Agent darf sie nicht dafür halten. Sie steht daneben, damit `activeLockPeriod: null`
 * nicht länger „es gab nie eine Konsequenz" bedeutet.
 *
 * Neutral formuliert: ob die Öffnung erlaubt war, steht hier bewusst NICHT — das weiss das Strafbuch.
 */
export function mapInterruptedLockPeriod(
  s: { endsAt: Date | null; withdrawnAt: Date | null; message: string | null } | null,
  fmt: Fmt,
): InterruptedLockPeriodView | null {
  if (!s?.withdrawnAt) return null;
  return {
    originalEndsAt: s.endsAt ? fmt(s.endsAt) : null,
    indefinite: s.endsAt === null,
    interruptedAt: fmt(s.withdrawnAt),
    message: s.message,
  };
}
