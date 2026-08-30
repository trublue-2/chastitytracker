import { prisma } from "@/lib/prisma";
import { resolveUserContext, notesForEntities, entityKey, makeIso, makeFmt, buildEnvelope, parseIsoDate, type Envelope, type NoteDTO } from "@/lib/mcp/common";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";
import { collectDetectedOffenses, cleaningNotRelockedRef, STORED_TYPE, type OffenseCanonicalType } from "@/lib/strafurteilService";
import { offenseState } from "@/lib/offenseTypes";
import { taskFailureKind, type TaskFailureKind } from "@/lib/tasks";
import { missedWeightRef } from "@/lib/weightObligation";

// ── Strafbuch-Snapshot ────────────────────────────────────────────────────────
// Wohnt hier, weil `getOffenses` sein einziger Aufrufer ist. Solange auch das (entfernte) V1-
// `get_strafbuch` daran hing, brauchte es einen Formatier-Schalter (`opts.iso`); jetzt gibt es
// nur noch EINEN Vertrag — ISO-8601 mit Offset — und der Schalter ist weg.

export interface OffenseJudgment {
  judgment: "open" | "dismissed" | "punished";
  /** Strafe (Freitext) bei judgment="punished". */
  penalty: string | null;
  /** Grund bei judgment="dismissed". */
  reason: string | null;
  judgedBy: string | null;
  /** NAME des Urteilenden, wo ein Mensch entschied. `null` bei dir selbst (deine Kennung steht in
   *  `judgedBy`), bei der automatischen Ahndung und im Altbestand — nicht „unbekannt". */
  judgedByName: string | null;
  judgedAt: string | null;
  /** Bei judgment="punished": ob die Strafe bereits erledigt ist. */
  done: boolean;
  doneAt: string | null;
  ref: { type: string; id: string };
}

/** A Kontroll-based offense in Strafbuch form (Zwischenstufe von `get_offenses`). */
export interface StrafbuchControlRow extends OffenseJudgment {
  /** null = Kontrolle ohne Code-Pflicht (Gerät mit `requireInspectionCode: false`). */
  code: string | null;
  deadline: string;
  fulfilledAt: string | null;
  entryTime: string | null;
  backdated: boolean;
  comment: string | null;
  entryNote: string | null;
}

/** Strafbuch-Snapshot — Zwischenstufe, aus der `get_offenses` sein Ledger baut. ISO-8601 mit Offset. */
export interface StrafbuchOverview {
  /** Alle vom System erkannten Vergehen, über alle Kategorien — unabhängig davon, ob sie beurteilt
   *  wurden. Der Zähler, dem im Ledger jede Kategorie auch eine ZEILE schulden muss. */
  detectedOffenseCount: number;
  /** Relevante Vergehen = unbeurteilt ODER bestraft-aber-nicht-erledigt — genau die, die deine
   *  Aufmerksamkeit brauchen (judge_offense bzw. action="complete"). */
  openOffenseCount: number;
  /** Bestrafte Vergehen, deren Strafe noch nicht als erledigt markiert ist. */
  pendingPenaltyCount: number;
  unauthorizedOpenings: ({
    time: string; note: string | null;
    lockPeriodEndedAt: string | null; lockPeriodIndefinite: boolean;
  } & OffenseJudgment)[];
  lateControls: StrafbuchControlRow[];
  rejectedControls: StrafbuchControlRow[];
  /** Kontrollen, die der Sub nie beantwortet hat und die das System daraufhin als „Gerät vermutlich
   *  abgenommen" abgeschlossen hat (Eskalations-Stufe 2). Zählen längst in `detectedOffenseCount`
   *  — wurden aber bis v4.50.30 nie AUSGEGEBEN. Damit fehlte ausgerechnet dem häufigsten frischen
   *  Vergehen seine `ref`, und `judge_offense` war dafür nicht aufrufbar. */
  autoRemovedControls: StrafbuchControlRow[];
  cleaningLimitViolations: ({ time: string | null; note: string | null } & OffenseJudgment)[];
  /** Lock entries where a different device than the Anforderung specified was worn. */
  wrongDeviceViolations: ({ time: string | null; note: string | null; deviceName: string | null } & OffenseJudgment)[];
  /** Mandatory orgasm directives (ANWEISUNG) whose window ended without a matching orgasm. */
  missedOrgasmInstructions: ({ windowEndedAt: string; message: string | null; requiredType: string | null } & OffenseJudgment)[];
  /** Lock requests whose deadline passed without a timely VERSCHLUSS. */
  lateLocks: ({ deadline: string; fulfilledAt: string | null; message: string | null } & OffenseJudgment)[];
  /** REINIGUNG openings not (or too late) followed by a VERSCHLUSS within the re-lock deadline. */
  cleaningNotRelocked: ({ time: string; deadline: string; relockedAt: string | null; note: string | null } & OffenseJudgment)[];
  /** Aufgaben, die nicht erfüllt wurden — EIN Vergehenstyp, aber vier Arten ihn zu begehen.
   *
   *  `state` allein taugt nicht als Vorwurf: `missed` deckt drei davon ab (nie begonnen · begonnen
   *  und nur der Nachweis fehlt · Aufgabe ohne Bedingungen). Welcher es ist, sagt `failureKind` —
   *  dieselbe Entscheidung wie in der Web-Sicht (`taskFailureKind`), damit die Fläche, die am
   *  ehesten automatisch handelt, nicht als einzige das Falsche behauptet. */
  unfulfilledTasks: ({
    title: string; holdUntil: string; state: string; failedAt: string | null;
    failureKind: TaskFailureKind;
  } & OffenseJudgment)[];
  /** Passwortwechsel an einem Admin-Konto während einer laufenden Sperrzeit. `via` unterscheidet
   *  die Wege; `reset_token` heisst: über das Postfach neuen Zugang verschafft. */
  adminPasswordChanges: ({ time: string; adminUsername: string; via: string; lockPeriodEndedAt: string | null } & OffenseJudgment)[];
  /** Orgasmen ohne deckende Direktive. Erscheinen nur, wenn die Regel `unauthorized_orgasm` bei
   *  diesem Sub scharf ist (Default: aus) — die Reichweite (`lockedOnly`/`always`) steht in
   *  `get_context.offenseRules`. `lockPeriodEndedAt` ist gesetzt, wenn zur Tatzeit eine Sperrzeit lief. */
  unauthorizedOrgasms: ({
    time: string; orgasmType: string | null; note: string | null;
    lockPeriodEndedAt: string | null; lockPeriodIndefinite: boolean;
  } & OffenseJudgment)[];
  /** Versäumte Gewichts-Meldungen: je drei Tage ohne Angabe eine Zeile. Erscheinen nur, wenn die
   *  Regel `missed_weight_report` bei diesem Sub scharf ist (Default: aus). `day` ist der Tag, mit
   *  dem der Block voll wurde. */
  missedWeightReports: ({ time: string; day: string; days: number } & OffenseJudgment)[];
  /** Von Hand notierte Vergehen — die einzigen, die nicht aus Einträgen abgeleitet sind. Entstehen
   *  über `record_offense` bzw. die Admin-Oberfläche. */
  manualOffenses: ({ time: string; title: string; description: string | null; recordedBy: string } & OffenseJudgment)[];
}

/** Baut den Strafbuch-Snapshot. Nimmt den bereits aufgelösten User: `getOffenses` hat ihn ohnehin
 *  und fragte ihn sonst ein zweites Mal ab. Nicht exportiert — es ist eine Zwischenstufe, kein Tool. */
async function mcpStrafbuch(userId: string, timezone: string, now: Date): Promise<StrafbuchOverview> {
  const fmt = makeFmt(timezone);
  const sb = await buildStrafbuch(userId, now);

  // Urteil pro Vergehen (per refId aufgelöst).
  const judgmentByRef = new Map(sb.strafeRecords.map((r) => [r.refId, r]));
  const detected = collectDetectedOffenses(sb);

  // Relevanz in einem Durchlauf: pending-penalty ⊂ open (= unbeurteilt ODER bestraft-nicht-erledigt).
  let openOffenseCount = 0;
  let pendingPenaltyCount = 0;
  for (const o of detected) {
    const state = offenseState(judgmentByRef.get(o.refId));
    if (state === "open" || state === "punished") openOffenseCount++;
    if (state === "punished") pendingPenaltyCount++;
  }

  const judge = (canonicalType: string, refId: string): OffenseJudgment => {
    const rec = judgmentByRef.get(refId);
    // `offenseState` fasst „bestraft" und „bestraft + erledigt" zu zwei Zuständen zusammen; der
    // MCP-Vertrag trennt sie seit jeher in `judgment` + `done`. Hier also wieder auseinandergezogen
    // — die Ausgabe bleibt bitgleich, deshalb auch KEIN schemaVersion-Bump.
    const state = offenseState(rec);
    const judgment = state === "done" ? "punished" : state;
    return {
      judgment,
      penalty: judgment === "punished" ? (rec?.reason ?? null) : null,
      reason: judgment === "dismissed" ? (rec?.reason ?? null) : null,
      judgedBy: rec?.judgedBy ?? null,
      judgedByName: rec?.judgedByName ?? null,
      judgedAt: rec ? fmt(rec.bestraftDatum) : null,
      done: state === "done",
      doneAt: rec?.erledigtAt ? fmt(rec.erledigtAt) : null,
      ref: { type: canonicalType, id: refId },
    };
  };

  const toControlRow = (canonicalType: string) => (k: StrafbuchControlOffense): StrafbuchControlRow => ({
    code: k.code,
    deadline: fmt(k.deadline),
    fulfilledAt: k.fulfilledAt ? fmt(k.fulfilledAt) : null,
    entryTime: k.entryStartTime ? fmt(k.entryStartTime) : null,
    backdated: k.backdated,
    comment: k.kommentar,
    entryNote: k.entryNote,
    ...judge(canonicalType, k.id),
  });

  return {
    detectedOffenseCount: detected.length,
    openOffenseCount,
    pendingPenaltyCount,
    unauthorizedOpenings: sb.unauthorizedOpenings.map((o) => ({
      time: fmt(o.startTime),
      note: o.note,
      lockPeriodEndedAt: o.lockPeriodEndsAt ? fmt(o.lockPeriodEndsAt) : null,
      lockPeriodIndefinite: o.lockPeriodIndefinite,
      ...judge("unauthorized_opening", o.id),
    })),
    lateControls: sb.lateControls.map(toControlRow("late_control")),
    rejectedControls: sb.rejectedControls.map(toControlRow("rejected_control")),
    autoRemovedControls: sb.autoRemovedControls.map(toControlRow("auto_removed_control")),
    cleaningLimitViolations: sb.reinigungLimitViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      ...judge("cleaning_limit", v.entryId),
    })),
    wrongDeviceViolations: sb.wrongDeviceViolations.map((v) => ({
      time: v.startTime ? fmt(v.startTime) : null,
      note: v.note,
      deviceName: v.deviceName,
      ...judge("wrong_device", v.entryId),
    })),
    missedOrgasmInstructions: sb.missedOrgasmInstructions.map((m) => ({
      windowEndedAt: fmt(m.endetAt),
      message: m.nachricht,
      requiredType: m.requiredArt,
      ...judge("missed_orgasm", m.id),
    })),
    lateLocks: sb.lateLocks.map((a) => ({
      deadline: fmt(a.endetAt),
      fulfilledAt: a.fulfilledAt ? fmt(a.fulfilledAt) : null,
      message: a.nachricht,
      ...judge("late_lock", a.id),
    })),
    cleaningNotRelocked: sb.cleaningNotRelocked.map((c) => ({
      time: fmt(c.startTime),
      deadline: fmt(c.deadline),
      relockedAt: c.relockAt ? fmt(c.relockAt) : null,
      note: c.note,
      ...judge("cleaning_not_relocked", cleaningNotRelockedRef(c.entryId)),
    })),
    unfulfilledTasks: sb.unfulfilledTasks.map((t) => ({
      title: t.title,
      holdUntil: fmt(t.holdUntil),
      state: t.state,
      failedAt: t.failedAt ? fmt(t.failedAt) : null,
      // Nicht hier hergeleitet: `taskFailureKind` ist die EINE Stelle, die den Vorwurf entscheidet
      // (geteilt mit Träger-Karte und Strafbuch). Sie braucht dafür `startedAt` und
      // `hasRequirements`, die `buildStrafbuch` ohnehin mitliefert.
      failureKind: taskFailureKind({ state: t.state, started: t.startedAt !== null, hasRequirements: t.hasRequirements }),
      ...judge("unfulfilled_task", t.id),
    })),
    adminPasswordChanges: sb.adminPasswordChanges.map((p) => ({
      time: fmt(p.at),
      adminUsername: p.adminUsername,
      via: p.via,
      lockPeriodEndedAt: p.lockPeriodEndsAt ? fmt(p.lockPeriodEndsAt) : null,
      ...judge("admin_password_change", p.id),
    })),
    unauthorizedOrgasms: sb.unauthorizedOrgasms.map((o) => ({
      time: fmt(o.startTime),
      orgasmType: o.orgasmusArt,
      note: o.note,
      lockPeriodEndedAt: o.lockPeriodEndsAt ? fmt(o.lockPeriodEndsAt) : null,
      lockPeriodIndefinite: o.lockPeriodIndefinite,
      ...judge("unauthorized_orgasm", o.id),
    })),
    missedWeightReports: sb.missedWeightReports.map((m) => ({
      time: fmt(m.at),
      day: m.dayKey,
      days: m.days,
      ...judge("missed_weight_report", missedWeightRef(m.dayKey)),
    })),
    manualOffenses: sb.manualOffenses.map((m) => ({
      time: fmt(m.occurredAt),
      title: m.title,
      description: m.description,
      recordedBy: m.createdBy,
      ...judge("manual_offense", m.id),
    })),
  };
}

/** Disziplin-Ledger (§4) — vereinheitlicht die getrennten Strafbuch-Kategorien zu EINER
 *  Offense-Liste mit durchgängiger Taxonomie, open-vs-judged, Auslöser und Folge. Reines
 *  MCP-Post-Processing über mcpStrafbuch — KEIN Eingriff in buildStrafbuch (Tracker-Core).
 *
 *  Cluster-Softening (§3.1/§5.3): das erwartete Gerät eines wrongDevice-Vergehens liegt nicht im
 *  Strafbuch-Output und liesse sich nur über Detection-Logik im Core rekonstruieren. Daher hängen
 *  wir den Cluster/securityLevel des GETRAGENEN Geräts als Kontext an (`deviceCluster`) und
 *  markieren `possiblyClusterInternal`, statt automatisch zu verwerfen — die Entscheidung trifft
 *  der Keyholder via judge_offense. */

/** Kanonische Offense-Taxonomie — ABGELEITET, nicht abgeschrieben. Die handgeführte Kopie hatte
 *  `auto_removed_control` nie mitbekommen und driftete still von der Wahrheit weg (`STORED_TYPE`).
 *  Genau dieselbe Klasse Fehler liess `get_offenses` eine ganze Vergehens-Kategorie unterschlagen. */
export const OFFENSE_TYPES = Object.keys(STORED_TYPE) as OffenseCanonicalType[];

export interface OffenseRow {
  id: string;
  type: string;
  /** ISO-8601 mit Offset. */
  detectedAt: string | null;
  status: "open" | "judged";
  judgment: OffenseJudgment["judgment"];
  /** Verhängte Folge (Freitext-Strafe) inkl. Erledigt-Status, falls bestraft. */
  consequence: { text: string | null; done: boolean; doneAt: string | null } | null;
  dismissReason: string | null;
  judgedBy: string | null;
  judgedByName: string | null;
  judgedAt: string | null;
  /** Typ-spezifischer Kontext (Zeiten, Gerät, Nachricht …). */
  context: Record<string, unknown>;
  notes: NoteDTO[];
}

export interface LedgerResult extends Envelope {
  /** v3: `context.code` einer Kontroll-Zeile kann jetzt `null` sein — das getragene Gerät verlangt
   *  keinen Kontroll-Code (`Device.requireInspectionCode: false`). Bis v2 war dort immer eine Zahl;
   *  ein `null` heisst NICHT „Code unbekannt", sondern „diese Kontrolle hatte keinen". */
  schemaVersion: 3;
  user: string;
  detectedOffenseCount: number;
  openOffenseCount: number;
  pendingPenaltyCount: number;
  offenses: OffenseRow[];
}

/** Baut die gemeinsamen Ledger-Felder aus einem OffenseJudgment + Detektionszeit + Kontext. */
function toRow(detectedAt: string | null, j: OffenseJudgment, context: Record<string, unknown>): OffenseRow {
  return {
    id: j.ref.id,
    type: j.ref.type,
    detectedAt,
    status: j.judgment === "open" ? "open" : "judged",
    judgment: j.judgment,
    consequence: j.judgment === "punished" ? { text: j.penalty, done: j.done, doneAt: j.doneAt } : null,
    dismissReason: j.judgment === "dismissed" ? j.reason : null,
    judgedBy: j.judgedBy,
    judgedByName: j.judgedByName,
    judgedAt: j.judgedAt,
    context,
    notes: [],
  };
}

/** Die drei Kontroll-Kategorien (verspätet / abgelehnt / auto-entfernt) teilen sich Zeile UND
 *  Kontext — nur `lateControls` trägt zusätzlich `backdated`. Vorher stand dieser Kontext dreimal
 *  wortgleich da, und genau so verschwand `autoRemovedControls`: eine Kopie zu wenig. */
function controlRows(
  rows: StrafbuchControlRow[],
  extra: (c: StrafbuchControlRow) => Record<string, unknown> = () => ({}),
): OffenseRow[] {
  return rows.map((c) => toRow(c.entryTime ?? c.deadline, c, {
    code: c.code, deadline: c.deadline, fulfilledAt: c.fulfilledAt,
    comment: c.comment, entryNote: c.entryNote, ...extra(c),
  }));
}

/** Kontext eines Geräts für die wrongDevice-Cluster-Softening — mehr braucht der Zeilenbau nicht. */
export type DeviceCluster = { lookalikeClusterId: string | null; securityLevel: string | null };

/**
 * Strafbuch-Kategorien → EINE Offense-Liste. Rein und exportiert, weil hier der Vertrag sitzt, den
 * `get_offenses` gebrochen hat: JEDE Kategorie, die in `detectedOffenseCount` zählt, muss hier auch
 * eine Zeile bekommen. Fehlt eine (`autoRemovedControls` fehlte), meldet das Dashboard ein offenes
 * Vergehen, das im Ledger nicht auftaucht — und ohne `ref` kann der Keyholder es nicht beurteilen.
 * `ledger.test.ts` hält das gegen `OFFENSE_TYPES` fest.
 */
export function buildOffenseRows(
  sb: StrafbuchOverview,
  clusterByName: Map<string, DeviceCluster>,
): OffenseRow[] {
  return [
    ...sb.unauthorizedOpenings.map((o) => toRow(o.time, o, { note: o.note, lockPeriodEndedAt: o.lockPeriodEndedAt, lockPeriodIndefinite: o.lockPeriodIndefinite })),
    ...controlRows(sb.lateControls, (c) => ({ backdated: c.backdated })),
    ...controlRows(sb.rejectedControls),
    ...controlRows(sb.autoRemovedControls),
    ...sb.cleaningLimitViolations.map((v) => toRow(v.time, v, { note: v.note })),
    ...sb.wrongDeviceViolations.map((v) => {
      const dev = v.deviceName ? clusterByName.get(v.deviceName) : null;
      return toRow(v.time, v, {
        note: v.note,
        deviceName: v.deviceName,
        deviceCluster: dev?.lookalikeClusterId ?? null,
        deviceSecurityLevel: dev?.securityLevel ?? null,
        // Hinweis: erwartetes Gerät liegt nicht vor → echte Cluster-Prüfung braucht Keyholder-Urteil.
        possiblyClusterInternal: dev?.lookalikeClusterId != null,
      });
    }),
    ...sb.missedOrgasmInstructions.map((m) => toRow(m.windowEndedAt, m, { message: m.message, requiredType: m.requiredType })),
    ...sb.lateLocks.map((a) => toRow(a.fulfilledAt ?? a.deadline, a, { deadline: a.deadline, fulfilledAt: a.fulfilledAt, message: a.message })),
    ...sb.cleaningNotRelocked.map((c) => toRow(c.relockedAt ?? c.deadline, c, { time: c.time, deadline: c.deadline, relockedAt: c.relockedAt, note: c.note })),
    ...sb.unfulfilledTasks.map((t) => toRow(t.failedAt ?? t.holdUntil, t, { title: t.title, holdUntil: t.holdUntil, state: t.state, failedAt: t.failedAt, failureKind: t.failureKind })),
    ...sb.adminPasswordChanges.map((p) => toRow(p.time, p, { adminUsername: p.adminUsername, via: p.via, lockPeriodEndedAt: p.lockPeriodEndedAt })),
    ...sb.unauthorizedOrgasms.map((o) => toRow(o.time, o, { note: o.note, orgasmType: o.orgasmType, lockPeriodEndedAt: o.lockPeriodEndedAt, lockPeriodIndefinite: o.lockPeriodIndefinite })),
    ...sb.missedWeightReports.map((m) => toRow(m.time, m, { day: m.day, days: m.days })),
    ...sb.manualOffenses.map((m) => toRow(m.time, m, { title: m.title, description: m.description, recordedBy: m.recordedBy })),
  ];
}

/** Optionale Filter für get_offenses (K-14, MCP-Restliste 2026-07-17) — das Ledger wächst monoton
 *  und lieferte sonst immer alle Zeilen seit März. Die Zähler bleiben davon UNBERÜHRT (Gesamtstände). */
export interface GetOffensesOptions {
  /** Nur einen Vergehenstyp (aus OFFENSE_TYPES). */
  type?: string;
  /** Nur noch nicht beurteilte (`status: "open"`). Anmerkung: `pendingPenaltyCount` (bestraft, Strafe
   *  offen) ist ein SEPARATER Zustand und wird davon NICHT erfasst. */
  openOnly?: boolean;
  /** ISO-8601-Zeitfenster auf `detectedAt`. Zeilen ohne `detectedAt` fallen bei gesetztem Fenster raus. */
  from?: string;
  to?: string;
  /** Neueste zuerst, dann auf `limit` gekürzt. */
  limit?: number;
}

/** Filtert/beschränkt die Offense-Zeilen. Pure (kein prisma), damit direkt testbar. */
export function filterOffenses(rows: OffenseRow[], opts: GetOffensesOptions): OffenseRow[] {
  // parseIsoDate validiert + wirft bei Murks (wie actionlog/timeline) — statt still NaN durchzureichen.
  const fromMs = parseIsoDate(opts.from, "from")?.getTime() ?? null;
  const toMs = parseIsoDate(opts.to, "to")?.getTime() ?? null;
  const timeFiltered = fromMs != null || toMs != null;
  const out = rows.filter((r) => {
    if (opts.type && r.type !== opts.type) return false;
    if (opts.openOnly && r.status !== "open") return false;
    if (timeFiltered) {
      if (r.detectedAt == null) return false; // zeitlich nicht platzierbar → bei Zeitfilter raus
      const t = Date.parse(r.detectedAt);
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t > toMs) return false;
    }
    return true;
  });
  if (opts.limit == null) return out;
  // Für ein sinnvolles `limit` (neueste zuerst) explizit nach detectedAt absteigend sortieren — die
  // Kategorien-Reihenfolge von buildOffenseRows ist sonst willkürlich. Zeilen ohne detectedAt ans Ende.
  const ms = (r: OffenseRow) => (r.detectedAt ? Date.parse(r.detectedAt) : -Infinity);
  return out.sort((a, b) => ms(b) - ms(a)).slice(0, opts.limit); // `out` ist schon eine frische Filter-Kopie

}

/** Liefert das vereinheitlichte Disziplin-Ledger mit Cluster-Kontext bei wrongDevice + inline Notes. */
export async function getOffenses(username: string, opts: GetOffensesOptions = {}): Promise<LedgerResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  const iso = makeIso(timezone);
  const now = new Date();
  const [sb, deviceClusters] = await Promise.all([
    mcpStrafbuch(userId, timezone, now),
    prisma.device.findMany({ where: { userId }, select: { name: true, lookalikeClusterId: true, securityLevel: true } }),
  ]);
  // Filtern VOR dem Notes-Query, damit Inline-Notes nur für überlebende Zeilen geladen werden.
  const rows = filterOffenses(buildOffenseRows(sb, new Map(deviceClusters.map((d) => [d.name, d]))), opts);

  // Inline-Notes je Offense in EINEM Query.
  const notesByEntity = await notesForEntities(userId, rows.map((r) => ({ entityType: "offense" as const, entityId: r.id })), {}, undefined, timezone);
  for (const r of rows) r.notes = notesByEntity.get(entityKey("offense", r.id)) ?? [];

  return {
    schemaVersion: 3,
    user: username,
    ...buildEnvelope(now, iso, timezone),
    detectedOffenseCount: sb.detectedOffenseCount,
    openOffenseCount: sb.openOffenseCount,
    pendingPenaltyCount: sb.pendingPenaltyCount,
    offenses: rows,
  };
}
