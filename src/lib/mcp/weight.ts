import { prisma } from "@/lib/prisma";
import { APP_TZ, round1 } from "@/lib/utils";
import { weightTrackingEnabled } from "@/lib/constants";
import {
  bmi, corridorBreach, dayNumber, effectiveCorridor, keyholderCorridorProblem, weightDayKey,
  weightProblem,
  type Corridor,
} from "@/lib/weight";
import { inWeighingWindow, parseWeighingWindows } from "@/lib/weightWindows";
import { buildWeightSeries } from "@/lib/weightSeries";
import { recordWeight } from "@/lib/weightService";
import { type TxClient, type WriteContext, type WriteDef, type WriteResult, diffFields } from "@/lib/mcp/writeFramework";

/**
 * Gewicht über den MCP — lesen und schreiben.
 *
 * Der Anspruch ist, dass die KI-Keyholderin hier alles kann, was die Keyholderin in der Oberfläche
 * kann. Also: die Reihe lesen, eine Messung nachtragen und die Grenzen NACHBESSERN — mit derselben
 * Nur-Weiten-Regel, die auch das Formular durchsetzt. Die Grenzen SELBST setzt weiterhin nur der
 * Träger; ihm über den MCP ein Ziel vorzuschreiben wäre genau das, was die Regel verhindert.
 *
 * Werte gehen metrisch raus und rein. Eine Anzeige-Einheit gibt es hier nicht: der MCP hat keine
 * Oberfläche, in der jemand Pfund liest, und eine zweite Einheit in der Antwort wäre bloss eine
 * weitere Stelle, an der jemand die falsche verwendet.
 */

export const WEIGHT_SCHEMA_VERSION = 1;

export interface WeightHistoryResult {
  schemaVersion: number;
  /** Führt diese Instanz das Feature — und hat die Keyholderin es für diesen Träger freigeschaltet? */
  enabled: boolean;
  heightCm: number | null;
  /** Der wirksame Korridor: der WEITERE aus Wunsch des Trägers und Nachbesserung. */
  corridor: { minKg: number | null; maxKg: number | null };
  /** Was der Träger sich selbst gesetzt hat — die Schranke, hinter die keine Nachbesserung zurück darf. */
  subCorridor: { minKg: number | null; maxKg: number | null };
  /** Tägliche Wiege-Fenster in der Wanduhrzeit des Trägers; leer = keine Fensterpflicht. */
  weighingWindows: { start: string; end: string }[];
  latest: { day: string; weightKg: number; bmi: number | null; inWindow: boolean } | null;
  /** Tage seit der letzten Meldung — die Zahl, an der die Meldepflicht hängt. */
  daysSinceLastReport: number | null;
  /** Veränderung im abgefragten Zeitraum. */
  changeKg: number | null;
  /** Gleitendes 7-Tage-Mittel des jüngsten Tages mit Messung — die Richtung ohne Tagesrauschen. */
  trendKg: number | null;
  points: { day: string; weightKg: number; inWindow: boolean; note: string | null }[];
}

/** Die Reihe eines Trägers. `days` begrenzt den Zeitraum; `null` = seit Beginn. */
export async function weightHistory(userId: string, opts: { days: number | null }): Promise<WeightHistoryResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      weightTrackingEnabled: true, timezone: true, heightCm: true, weighingWindows: true,
      targetMinKg: true, targetMaxKg: true, targetMinKeyholderKg: true, targetMaxKeyholderKg: true,
    },
  });
  const subCorridor: Corridor = { minKg: user?.targetMinKg ?? null, maxKg: user?.targetMaxKg ?? null };
  const keyholderCorridor: Corridor = { minKg: user?.targetMinKeyholderKg ?? null, maxKg: user?.targetMaxKeyholderKg ?? null };
  const base = {
    schemaVersion: WEIGHT_SCHEMA_VERSION,
    enabled: weightTrackingEnabled() && !!user?.weightTrackingEnabled,
    heightCm: user?.heightCm ?? null,
    corridor: effectiveCorridor(subCorridor, keyholderCorridor),
    subCorridor,
    weighingWindows: parseWeighingWindows(user?.weighingWindows),
  };
  if (!user) return { ...base, latest: null, daysSinceLastReport: null, changeKg: null, trendKg: null, points: [] };

  const tz = user.timezone || APP_TZ;
  const rows = await prisma.weightEntry.findMany({
    where: { userId },
    orderBy: { measuredAt: "asc" },
    select: { dayKey: true, weightKg: true, inWindow: true, note: true },
  });
  const todayKey = weightDayKey(new Date(), tz);
  const series = buildWeightSeries(rows, { days: opts.days, todayKey, subCorridor, keyholderCorridor });
  const last = series.latest;

  return {
    ...base,
    latest: last
      ? { day: last.dayKey, weightKg: last.weightKg, bmi: bmiRounded(last.weightKg, user.heightCm), inWindow: last.inWindow }
      : null,
    // Aus dem GANZEN Bestand, nicht aus dem Zeitraum: „seit wann keine Meldung" darf nicht davon
    // abhängen, wie weit die Abfrage zurückblickt.
    daysSinceLastReport: rows.length ? dayNumber(todayKey) - dayNumber(rows[rows.length - 1].dayKey) : null,
    changeKg: series.changeKg,
    trendKg: series.trend.length ? series.trend[series.trend.length - 1].weightKg : null,
    points: series.points.map((p) => ({
      day: p.dayKey,
      weightKg: p.weightKg,
      inWindow: p.inWindow,
      note: rows.find((r) => r.dayKey === p.dayKey)?.note ?? null,
    })),
  };
}

function bmiRounded(weightKg: number, heightCm: number | null): number | null {
  const value = bmi(weightKg, heightCm);
  return value === null ? null : round1(value);
}

/** Der Kurz-Stand fürs Keyholder-Dashboard. */
export interface WeightSummary {
  latestKg: number;
  day: string;
  bmi: number | null;
  /** Gleitendes 7-Tage-Mittel — die Richtung ohne Tagesrauschen. */
  trendKg: number | null;
  corridor: { minKg: number | null; maxKg: number | null };
  /** Liegt der jüngste Wert ausserhalb des Korridors, und auf welcher Seite? */
  breach: "below" | "above" | null;
  daysSinceLastReport: number;
}

/**
 * Gewicht für das Dashboard — `null`, wenn das Feature hier nichts zu suchen hat oder noch nichts
 * erfasst wurde.
 *
 * Eigene Abfrage statt `weightHistory`: das Dashboard ist das Werkzeug, das die KI bei jeder Frage
 * zuerst aufruft. Die ganze Reihe dafür zu laden und neunundneunzig Prozent davon wegzuwerfen, wäre
 * bei jedem einzelnen Aufruf bezahlt. Vierzehn Tage reichen für das Sieben-Tage-Mittel.
 */
export async function weightSummary(userId: string): Promise<WeightSummary | null> {
  if (!weightTrackingEnabled()) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      weightTrackingEnabled: true, timezone: true, heightCm: true,
      targetMinKg: true, targetMaxKg: true, targetMinKeyholderKg: true, targetMaxKeyholderKg: true,
    },
  });
  if (!user?.weightTrackingEnabled) return null;

  const rows = await prisma.weightEntry.findMany({
    where: { userId },
    orderBy: { measuredAt: "desc" },
    take: 14,
    select: { dayKey: true, weightKg: true, inWindow: true },
  });
  if (rows.length === 0) return null;

  const tz = user.timezone || APP_TZ;
  const todayKey = weightDayKey(new Date(), tz);
  const corridor = effectiveCorridor(
    { minKg: user.targetMinKg, maxKg: user.targetMaxKg },
    { minKg: user.targetMinKeyholderKg, maxKg: user.targetMaxKeyholderKg },
  );
  const series = buildWeightSeries([...rows].reverse(), {
    days: null, todayKey,
    subCorridor: { minKg: user.targetMinKg, maxKg: user.targetMaxKg },
    keyholderCorridor: { minKg: user.targetMinKeyholderKg, maxKg: user.targetMaxKeyholderKg },
  });
  const last = series.latest!;
  return {
    latestKg: last.weightKg,
    day: last.dayKey,
    bmi: bmiRounded(last.weightKg, user.heightCm),
    trendKg: series.trend.length ? series.trend[series.trend.length - 1].weightKg : null,
    corridor,
    breach: corridorBreach(last.weightKg, corridor),
    daysSinceLastReport: dayNumber(todayKey) - dayNumber(last.dayKey),
  };
}

// ── Write: log_weight ──────────────────────────────────────────────────────

export interface LogWeightArgs {
  weightKg: number;
  /** ISO-Zeitpunkt der Messung; fehlt er, gilt jetzt. */
  measuredAt?: string;
  note?: string;
}

export interface LogWeightResult {
  day: string;
  weightKg: number;
  inWindow: boolean;
  replaced: boolean;
}

/** Der geplante Zustand einer Messung — für Vorschau UND Commit dieselbe Rechnung. */
async function projectWeight(userId: string, args: LogWeightArgs) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { weightTrackingEnabled: true, timezone: true, weighingWindows: true },
  });
  if (!user) throw new Error("User not found.");
  if (!weightTrackingEnabled() || !user.weightTrackingEnabled) {
    throw new Error("Weight tracking is not enabled for this wearer.");
  }
  const tz = user.timezone || APP_TZ;
  const measuredAt = args.measuredAt ? new Date(args.measuredAt) : new Date();
  if (Number.isNaN(measuredAt.getTime())) throw new Error("`measuredAt` is not a valid timestamp.");
  const dayKey = weightDayKey(measuredAt, tz);
  const existing = await prisma.weightEntry.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { weightKg: true },
  });
  return {
    measuredAt,
    dayKey,
    inWindow: inWeighingWindow(user.weighingWindows, measuredAt, tz),
    existing,
  };
}

export const logWeightDef: WriteDef<LogWeightArgs, LogWeightResult> = {
  tool: "log_weight",
  validate(args) {
    const problem = weightProblem(args.weightKg);
    // Der Dienst prüft dasselbe noch einmal — hier steht es, damit der Dry-Run schon scheitert und
    // nicht erst der Commit.
    if (problem) throw new Error(`Implausible weight: ${args.weightKg} kg.`);
    return args;
  },
  async preview(ctx, args) {
    const p = await projectWeight(ctx.targetUserId, args);
    return {
      preview: {
        action: p.existing ? "replace" : "create",
        day: p.dayKey,
        weightKg: args.weightKg,
        inWindow: p.inWindow,
        replaces: p.existing?.weightKg ?? null,
      },
      ...(p.existing ? { before: { weightKg: p.existing.weightKg }, after: { weightKg: args.weightKg } } : {}),
    };
  },
  async apply(_tx, ctx, args): Promise<WriteResult<LogWeightResult>> {
    const p = await projectWeight(ctx.targetUserId, args);
    // Bewusst über den GETEILTEN Dienst statt über `tx`: Tagesschlüssel, Fenster-Urteil, Beleg-Regel
    // und die Grenz-Meldung an die Keyholder hängen dort zusammen. Ein zweiter Schreibweg daneben
    // wäre genau die Kopie, die beim ersten Nachziehen auseinanderläuft — und die KI schriebe dann
    // Zeilen, die das Formular so nie erzeugt. Der Preis: dieser eine Commit läuft ausserhalb der
    // Audit-Transaktion des Frameworks.
    const result = await recordWeight(ctx.targetUserId, {
      weightKg: args.weightKg,
      measuredAt: p.measuredAt,
      note: args.note ?? null,
      source: "agent",
      createdById: "ai",
    });
    if (!result.ok) throw new Error(result.error);
    return {
      newState: {
        day: result.data.dayKey,
        weightKg: args.weightKg,
        inWindow: result.data.inWindow,
        replaced: result.data.replaced,
      },
      resultRef: result.data.id,
      ...(p.existing ? { diff: diffFields({ weightKg: p.existing.weightKg }, { weightKg: args.weightKg }) } : {}),
    };
  },
};

// ── Write: set_weight_limits ───────────────────────────────────────────────

export interface SetWeightLimitsArgs {
  /** Untergrenze der Keyholderin; `null` nimmt die Nachbesserung zurück. */
  minKg?: number | null;
  maxKg?: number | null;
}

export interface WeightLimitsResult {
  /** Nach der Änderung wirksam — der weitere aus beiden. */
  corridor: { minKg: number | null; maxKg: number | null };
  keyholderCorridor: { minKg: number | null; maxKg: number | null };
  subCorridor: { minKg: number | null; maxKg: number | null };
}

/** Der Korridor als flaches Feld-Paar — die Form, die das Schreib-Gerüst für Diff und Vorschau
 *  erwartet (`Record<string, unknown>`). */
function asFields(c: Corridor): Record<string, unknown> {
  return { minKg: c.minKg, maxKg: c.maxKg };
}

/** Der Korridor nach dem Patch — ungesetzte Felder behalten den Bestand. */
function merged(current: Corridor, args: SetWeightLimitsArgs): Corridor {
  return {
    minKg: args.minKg === undefined ? current.minKg : args.minKg,
    maxKg: args.maxKg === undefined ? current.maxKg : args.maxKg,
  };
}

async function limitsOf(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      weightTrackingEnabled: true,
      targetMinKg: true, targetMaxKg: true, targetMinKeyholderKg: true, targetMaxKeyholderKg: true,
    },
  });
  if (!user) throw new Error("User not found.");
  if (!weightTrackingEnabled() || !user.weightTrackingEnabled) {
    throw new Error("Weight tracking is not enabled for this wearer.");
  }
  return {
    sub: { minKg: user.targetMinKg, maxKg: user.targetMaxKg } as Corridor,
    keyholder: { minKg: user.targetMinKeyholderKg, maxKg: user.targetMaxKeyholderKg } as Corridor,
  };
}

/** Die Nur-Weiten-Prüfung als Satz, den ein Agent lesen kann. */
function assertWidens(sub: Corridor, next: Corridor): void {
  const problem = keyholderCorridorProblem(sub, next);
  if (!problem) return;
  if (problem === "WEIGHT_CORRIDOR_NARROWER") {
    throw new Error(
      "You may only WIDEN the wearer's target range, never tighten it — and only where they set a limit themselves. " +
      `Their own range is ${sub.minKg ?? "–"}–${sub.maxKg ?? "–"} kg.`,
    );
  }
  throw new Error(`Invalid target range (${problem}).`);
}

export const setWeightLimitsDef: WriteDef<SetWeightLimitsArgs, WeightLimitsResult> = {
  tool: "set_weight_limits",
  validate(args) {
    if (args.minKg === undefined && args.maxKg === undefined) {
      throw new Error("Nothing to change — pass `minKg` and/or `maxKg`.");
    }
    return args;
  },
  async preview(ctx, args) {
    const { sub, keyholder } = await limitsOf(ctx.targetUserId);
    const next = merged(keyholder, args);
    assertWidens(sub, next);
    return {
      preview: { action: "edit", subCorridor: sub, keyholderCorridor: next, corridor: effectiveCorridor(sub, next) },
      before: asFields(keyholder),
      after: asFields(next),
    };
  },
  async apply(tx: TxClient, ctx: WriteContext, args): Promise<WriteResult<WeightLimitsResult>> {
    const { sub, keyholder } = await limitsOf(ctx.targetUserId);
    const next = merged(keyholder, args);
    assertWidens(sub, next);
    await tx.user.update({
      where: { id: ctx.targetUserId },
      data: { targetMinKeyholderKg: next.minKg, targetMaxKeyholderKg: next.maxKg },
    });
    return {
      newState: { corridor: effectiveCorridor(sub, next), keyholderCorridor: next, subCorridor: sub },
      resultRef: ctx.targetUserId,
      diff: diffFields(asFields(keyholder), asFields(next)),
    };
  },
};
