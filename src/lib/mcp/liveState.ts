import { buildPairs, interruptionPauseMs, type ReinigungSettings } from "@/lib/utils";
import { msToHours } from "@/lib/mcp/format";

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
  since: string | null;
  currentDurationHours: number | null;
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
  verschluss: E;
  interruptions: { oeffnen: E; verschluss: E }[];
};

/** Entries müssen nach `startTime` ABSTEIGEND sortiert sein (jüngster zuerst).
 *
 *  War bis zum Wegfall der V1-Schicht in zwei Funktionen geteilt: `get_overview` baute die Paare
 *  ohnehin für seine Session-Statistik und reichte sie herein, um `buildPairs` nicht zweimal laufen
 *  zu lassen. Diesen Aufrufer gibt es nicht mehr — der verbliebene baut die Paare nirgends sonst,
 *  also ist die Aufteilung nur noch eine Naht ohne Zweck. */
export function buildLockState<E extends LockEntry>(
  entries: E[],
  reinigung: ReinigungSettings,
  now: Date,
  fmt: Fmt,
): LockState {
  const pairs: LockPair<E>[] = buildPairs(entries, [], reinigung);
  const latest = entries.find((e) => e.type === "VERSCHLUSS" || e.type === "OEFFNEN") ?? null;
  const isLocked = latest?.type === "VERSCHLUSS";

  const activePair = pairs.find((p) => p.active) ?? null;
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

  return {
    isLocked,
    since: latest ? fmt(latest.startTime) : null,
    currentDurationHours,
    deviceName: isLocked ? (currentLock?.device?.name ?? null) : null,
    // Aus DEMSELBEN Lock-Eintrag wie deviceName: nach einer Reinigungspause gilt die Angabe des
    // Wiederverschlusses, nicht die des Session-Starts.
    keyInBox: isLocked ? (currentLock?.keyInBox ?? null) : null,
  };
}

// ── Offene Anforderungen ──────────────────────────────────────────────────────

export interface OpenKontrolleView { code: string; deadline: string; overdue: boolean; remainingMinutes: number; comment: string | null }

export function mapOpenKontrolle(
  k: { code: string; deadline: Date; kommentar: string | null } | null,
  now: Date, fmt: Fmt,
): OpenKontrolleView | null {
  if (!k) return null;
  return {
    code: k.code,
    deadline: fmt(k.deadline),
    overdue: k.deadline < now,
    remainingMinutes: minutesUntil(k.deadline, now),
    comment: k.kommentar,
  };
}

export interface ActiveSperrzeitView { endetAt: string | null; indefinite: boolean; remainingMinutes: number | null; message: string | null; reinigungErlaubt: boolean; deviceName: string | null }

export function mapActiveSperrzeit(
  s: { endetAt: Date | null; nachricht: string | null; reinigungErlaubt: boolean; device: { name: string } | null } | null,
  now: Date, fmt: Fmt,
): ActiveSperrzeitView | null {
  if (!s) return null;
  return {
    endetAt: s.endetAt ? fmt(s.endetAt) : null,
    indefinite: s.endetAt === null,
    remainingMinutes: s.endetAt ? minutesUntil(s.endetAt, now) : null,
    message: s.nachricht,
    reinigungErlaubt: s.reinigungErlaubt,
    deviceName: s.device?.name ?? null,
  };
}

/** Eine offene Verschluss-Anforderung: der Sub SOLL sich einschliessen, hat es aber noch nicht getan. */
export interface OpenLockRequestView { endetAt: string | null; overdue: boolean; remainingMinutes: number | null; message: string | null; dauerH: number | null; reinigungErlaubt: boolean; deviceName: string | null }

export function mapOpenLockRequest(
  a: { endetAt: Date | null; nachricht: string | null; dauerH: number | null; reinigungErlaubt: boolean; device: { name: string } | null } | null,
  now: Date, fmt: Fmt,
): OpenLockRequestView | null {
  if (!a) return null;
  return {
    endetAt: a.endetAt ? fmt(a.endetAt) : null,
    overdue: a.endetAt ? a.endetAt < now : false,
    remainingMinutes: a.endetAt ? minutesUntil(a.endetAt, now) : null,
    message: a.nachricht,
    dauerH: a.dauerH,
    reinigungErlaubt: a.reinigungErlaubt,
    deviceName: a.device?.name ?? null,
  };
}

export interface OpenOrgasmusAnforderungView { art: string; beginntAt: string; endetAt: string; active: boolean; requiredType: string | null; message: string | null; remainingMinutes: number }

export function mapOpenOrgasmusAnforderung(
  o: { art: string; beginntAt: Date; endetAt: Date; vorgegebeneArt: string | null; nachricht: string | null } | null,
  now: Date, fmt: Fmt,
): OpenOrgasmusAnforderungView | null {
  if (!o) return null;
  return {
    art: o.art,
    beginntAt: fmt(o.beginntAt),
    endetAt: fmt(o.endetAt),
    active: o.beginntAt <= now,
    requiredType: o.vorgegebeneArt,
    message: o.nachricht,
    remainingMinutes: minutesUntil(o.endetAt, now),
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

export interface InterruptedSperrzeitView {
  /** Das ursprüngliche Ende, das die Keyholderin gesetzt hatte. null = war unbefristet. */
  originalEndetAt: string | null;
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
export function mapInterruptedSperrzeit(
  s: { endetAt: Date | null; withdrawnAt: Date | null; nachricht: string | null } | null,
  fmt: Fmt,
): InterruptedSperrzeitView | null {
  if (!s?.withdrawnAt) return null;
  return {
    originalEndetAt: s.endetAt ? fmt(s.endetAt) : null,
    indefinite: s.endetAt === null,
    interruptedAt: fmt(s.withdrawnAt),
    message: s.nachricht,
  };
}
