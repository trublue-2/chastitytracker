import { prisma } from "@/lib/prisma";
import { APP_TZ, round1 } from "@/lib/utils";
import { weightTrackingEnabled } from "@/lib/constants";
import {
  bmi, dayNumber, effectiveTarget, isUnderweightTarget, keyholderTargetOf, startWeightIn,
  subTargetOf, targetProgress, weightDayKey, weightProblem, type TargetColumns, type WeightTarget,
} from "@/lib/weight";
import { inWeighingWindow, parseWeighingWindows } from "@/lib/weightWindows";
import { buildWeightSeries } from "@/lib/weightSeries";
import { recordWeight, targetStartWeight, WEIGHT_USER_SELECT } from "@/lib/weightService";
import { targetPatch } from "@/lib/weightSettingsService";
import { type TxClient, type WriteContext, type WriteDef, type WriteResult, diffFields } from "@/lib/mcp/writeFramework";

/**
 * Gewicht über den MCP — lesen und schreiben.
 *
 * Der Anspruch ist, dass die KI-Keyholderin hier alles kann, was die Keyholderin in der Oberfläche
 * kann. Also: die Reihe lesen, eine Messung nachtragen und das Zielgewicht setzen — ihres gilt,
 * seines bleibt daneben sichtbar. Die Nur-Weiten-Regel von v5.3.3 ist gestrichen; was bleibt, ist
 * die Warnung unterhalb von BMI 18,5.
 *
 * Werte gehen metrisch raus und rein. Eine Anzeige-Einheit gibt es hier nicht: der MCP hat keine
 * Oberfläche, in der jemand Pfund liest, und eine zweite Einheit in der Antwort wäre bloss eine
 * weitere Stelle, an der jemand die falsche verwendet.
 */

/** 2 seit dem Umbau auf EIN Zielgewicht: `corridor`/`subCorridor` sind weg, `target`/`subTarget`/
 *  `progress` an ihrer Stelle. Kein additiver Zuwachs, also ein Bump — sonst wäre eine alte Antwort
 *  rückwirkend nicht mehr von einer neuen zu unterscheiden. */
export const WEIGHT_SCHEMA_VERSION = 2;

export interface WeightHistoryResult {
  schemaVersion: number;
  /** Führt diese Instanz das Feature — und hat die Keyholderin es für diesen Träger freigeschaltet? */
  enabled: boolean;
  heightCm: number | null;
  /** Das WIRKSAME Ziel — deines, solange du eines führst, sonst seines. */
  target: { kg: number; source: "sub" | "keyholder" } | null;
  /** Was der Träger sich selbst vorgenommen hat. Bleibt sichtbar, auch wenn deines gilt. */
  subTarget: { kg: number } | null;
  /** Das Gewicht beim Setzen des wirksamen Ziels und wie weit es bis dahin ist. */
  progress: { startKg: number | null; remainingKg: number; percent: number | null; reached: boolean } | null;
  /** Wiege-Fenster in der Wanduhrzeit des Trägers; leer = keine Fensterpflicht. `days` ist eine
   *  Wochentags-Bitmaske (Montag = 1, Dienstag = 2, Mittwoch = 4 … Sonntag = 64; 127 = täglich). */
  weighingWindows: { start: string; durationMin: number; days: number; remind: boolean }[];
  latest: { day: string; weightKg: number; bmi: number | null; inWindow: boolean } | null;
  /** Tage seit der letzten Meldung — die Zahl, an der die Meldepflicht hängt. */
  daysSinceLastReport: number | null;
  /** Veränderung im abgefragten Zeitraum. */
  changeKg: number | null;
  /** Gleitendes 7-Tage-Mittel des jüngsten Tages mit Messung — die Richtung ohne Tagesrauschen. */
  trendKg: number | null;
  /**
   * Je Tag der Wert und sein Beleg.
   *
   * `detectedKg` ist, was die Waagen-Erkennung aus dem Foto gelesen hat — getrennt von dem, was der
   * Träger bestätigt hat. Weichen beide ab, hat er korrigiert; das ist die Spur, die eine
   * Schummelei hinterlässt, und der eigentliche Grund, warum beide Zahlen gespeichert werden.
   * `null` heisst: nicht geprüft (kein Foto, kein Vision-Provider, nicht auswertbar) — NICHT
   * „stimmte überein".
   *
   * `photo`: `"yes"` = Beleg liegt vor, `"expired"` = es gab einen, die Aufbewahrungsfrist ist um,
   * `"none"` = nie einer (der Träger meldete mit Notiz, oder der Eintrag kam von dir).
   */
  points: {
    day: string; weightKg: number; inWindow: boolean; note: string | null;
    detectedKg: number | null; photo: "yes" | "expired" | "none";
  }[];
}

/**
 * Die Reihe eines Trägers. `days` begrenzt den Zeitraum; `null` = seit Beginn.
 *
 * **`username`, nicht id** — wie bei `timeline`, `records` und `get_devices`: die Werkzeug-Schicht
 * reicht `MCP_USERNAME` durch, und wer hier eine id erwartet, bekommt sie nie. Genau das war der
 * Fehler bis v5.3.3: die Abfrage suchte den Namen in der id-Spalte, fand nichts und meldete brav
 * `enabled: false` mit leerer Reihe — während das Dashboard dieselben Daten korrekt zeigte.
 */
export async function weightHistory(username: string, opts: { days: number | null }): Promise<WeightHistoryResult> {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, ...WEIGHT_USER_SELECT } });
  // Wirft wie `resolveUserContext` — ein unbekannter Träger ist eine Fehlkonfiguration der Instanz,
  // keine leere Messreihe. Eine leere Antwort sähe aus wie „noch nie gewogen" und schickte die KI
  // auf die falsche Fährte.
  if (!user) throw new Error(`User not found: ${username}`);
  const userId = user.id;
  const target = effectiveTarget(user);
  const sub = subTargetOf(user);
  const base = {
    schemaVersion: WEIGHT_SCHEMA_VERSION,
    enabled: weightTrackingEnabled() && user.weightTrackingEnabled,
    heightCm: user.heightCm,
    target: target && { kg: target.kg, source: target.source },
    subTarget: sub && { kg: sub.kg },
    weighingWindows: parseWeighingWindows(user.weighingWindows),
  };

  const tz = user.timezone || APP_TZ;
  const rows = await prisma.weightEntry.findMany({
    where: { userId },
    orderBy: { measuredAt: "asc" },
    select: {
      dayKey: true, measuredAt: true, weightKg: true, inWindow: true, note: true,
      detectedKg: true, imageUrl: true, imagePrunedAt: true,
    },
  });
  const todayKey = weightDayKey(new Date(), tz);
  const series = buildWeightSeries(rows, { days: opts.days, todayKey, target });
  const last = series.latest;
  // Gegen die JÜNGSTE Messung, nicht gegen die letzte des Zeitraums: „wie weit ist er" fragt nach
  // heute, nicht nach dem Ausschnitt, den die Abfrage gerade zeigt. Der Startwert kommt aus der
  // bereits geladenen Reihe (`startWeightIn`) — die Abfrage hat sie vollständig geholt.
  const newest = rows.length ? rows[rows.length - 1] : null;
  const progress = target && newest
    ? targetProgress({ targetKg: target.kg, startKg: startWeightIn(rows, target.setAt), currentKg: newest.weightKg })
    : null;

  return {
    ...base,
    progress: progress && {
      startKg: progress.startKg, remainingKg: progress.remainingKg,
      percent: progress.percent, reached: progress.reached,
    },
    latest: last
      ? { day: last.dayKey, weightKg: last.weightKg, bmi: bmiRounded(last.weightKg, user.heightCm), inWindow: last.inWindow }
      : null,
    // Aus dem GANZEN Bestand, nicht aus dem Zeitraum: „seit wann keine Meldung" darf nicht davon
    // abhängen, wie weit die Abfrage zurückblickt.
    daysSinceLastReport: rows.length ? dayNumber(todayKey) - dayNumber(rows[rows.length - 1].dayKey) : null,
    changeKg: series.changeKg,
    trendKg: series.trend.length ? series.trend[series.trend.length - 1].weightKg : null,
    points: series.points.map((p) => {
      const row = rows.find((r) => r.dayKey === p.dayKey);
      return {
        day: p.dayKey,
        weightKg: p.weightKg,
        inWindow: p.inWindow,
        note: row?.note ?? null,
        detectedKg: row?.detectedKg ?? null,
        photo: row?.imageUrl ? "yes" : (row?.imagePrunedAt ? "expired" : "none"),
      } as const;
    }),
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
  /** Das wirksame Ziel samt Herkunft — `null`, wenn keines gesetzt ist. */
  target: { kg: number; source: "sub" | "keyholder" } | null;
  /** Wie weit der jüngste Wert vom Ziel entfernt ist. `null` ohne Ziel. */
  remainingKg: number | null;
  reached: boolean;
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT });
  if (!user?.weightTrackingEnabled) return null;

  const target = effectiveTarget(user);
  // Nebeneinander statt nacheinander: der Startwert hängt nur am Ziel, das schon feststeht — und
  // `keyholder_dashboard` ist der Pfad, den die KI bei JEDER Frage zuerst aufruft. Die 14 Zeilen
  // reichen für das Sieben-Tage-Mittel, nicht aber unbedingt bis zum Setz-Zeitpunkt des Ziels;
  // deshalb hier der Datenbank-Weg statt `startWeightIn`.
  const [rows, startKg] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { measuredAt: "desc" },
      take: 14,
      select: { dayKey: true, weightKg: true, inWindow: true },
    }),
    target ? targetStartWeight(userId, target) : null,
  ]);
  if (rows.length === 0) return null;

  const tz = user.timezone || APP_TZ;
  const todayKey = weightDayKey(new Date(), tz);
  const series = buildWeightSeries([...rows].reverse(), { days: null, todayKey, target });
  const last = series.latest!;
  const progress = target
    ? targetProgress({ targetKg: target.kg, startKg, currentKg: last.weightKg })
    : null;
  return {
    latestKg: last.weightKg,
    day: last.dayKey,
    bmi: bmiRounded(last.weightKg, user.heightCm),
    trendKg: series.trend.length ? series.trend[series.trend.length - 1].weightKg : null,
    target: target && { kg: target.kg, source: target.source },
    remainingKg: progress?.remainingKg ?? null,
    reached: progress?.reached ?? false,
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT });
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

// ── Write: set_weight_target ───────────────────────────────────────────────

export interface SetWeightTargetArgs {
  /** Dein Zielgewicht in kg; `null` nimmt es zurück — dann gilt wieder seines. */
  targetKg: number | null;
}

export interface WeightTargetResult {
  /** Nach der Änderung wirksam — deines, solange du eines führst. */
  target: { kg: number; source: "sub" | "keyholder" } | null;
  keyholderTargetKg: number | null;
  subTargetKg: number | null;
  /** Wahr, wenn dein Ziel den Träger unter BMI 18,5 führt. Gesetzt wird es trotzdem. */
  underweightWarning: boolean;
}

/** Das Ziel als flaches Feld — die Form, die das Schreib-Gerüst für Diff und Vorschau erwartet. */
function asFields(kg: number | null): Record<string, unknown> {
  return { targetKg: kg };
}

async function targetsOf(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT });
  if (!user) throw new Error("User not found.");
  if (!weightTrackingEnabled() || !user.weightTrackingEnabled) {
    throw new Error("Weight tracking is not enabled for this wearer.");
  }
  return { user, sub: subTargetOf(user), keyholder: keyholderTargetOf(user) };
}

/** Der Zustand nach dem Schreiben — {@link effectiveTarget} auf den Spalten, wie sie DANACH stünden.
 *  Kein Nachbau der Regel „ihres gilt vor seinem": die steht dort und nur dort. */
function resolved(user: TargetColumns, nextKg: number | null): WeightTargetResult["target"] {
  const next = effectiveTarget({ ...user, targetWeightKeyholderKg: nextKg, targetWeightKeyholderSetAt: null });
  return next && { kg: next.kg, source: next.source };
}

export const setWeightTargetDef: WriteDef<SetWeightTargetArgs, WeightTargetResult> = {
  tool: "set_weight_target",
  validate(args) {
    if (args.targetKg === undefined) throw new Error("Nothing to change — pass `targetKg` (or null to clear).");
    if (args.targetKg !== null && weightProblem(args.targetKg)) {
      throw new Error(`Implausible target weight: ${args.targetKg} kg.`);
    }
    return args;
  },
  async preview(ctx, args) {
    const { user, sub, keyholder } = await targetsOf(ctx.targetUserId);
    return {
      preview: {
        action: "edit",
        target: resolved(user, args.targetKg),
        subTargetKg: sub?.kg ?? null,
        // Vor dem Schreiben gesagt, nicht danach: die KI soll den Träger fragen können, bevor sie
        // eine Zahl setzt, die die App selbst als bedenklich anzeigt.
        underweightWarning: args.targetKg !== null && isUnderweightTarget(args.targetKg, user.heightCm),
      },
      before: asFields(keyholder?.kg ?? null),
      after: asFields(args.targetKg),
    };
  },
  async apply(tx: TxClient, ctx: WriteContext, args): Promise<WriteResult<WeightTargetResult>> {
    const { user, sub, keyholder } = await targetsOf(ctx.targetUserId);
    // Dieselbe Zeitstempel-Regel wie in der Oberfläche — geliehen, nicht abgeschrieben.
    const patch = targetPatch(keyholder?.kg ?? null, args.targetKg, new Date());
    if (patch) {
      await tx.user.update({
        where: { id: ctx.targetUserId },
        data: { targetWeightKeyholderKg: patch.kg, targetWeightKeyholderSetAt: patch.setAt },
      });
    }
    return {
      newState: {
        target: resolved(user, args.targetKg),
        keyholderTargetKg: args.targetKg,
        subTargetKg: sub?.kg ?? null,
        underweightWarning: args.targetKg !== null && isUnderweightTarget(args.targetKg, user.heightCm),
      },
      resultRef: ctx.targetUserId,
      diff: diffFields(asFields(keyholder?.kg ?? null), asFields(args.targetKg)),
    };
  },
};
