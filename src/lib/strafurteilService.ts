import { prisma } from "@/lib/prisma";
import { buildStrafbuch, type StrafbuchData } from "@/lib/strafbuch";
import { notifyUser, type NotifyContent } from "@/lib/notify";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/**
 * Urteils-Lebenszyklus über erkannte Vergehen:
 *   erkannt → verworfen (DISMISSED) | bestraft (PUNISHED) → erledigt.
 * Single source of truth, geteilt von der Admin-Strafbuch-Route und dem MCP-Tool judge_offense.
 *
 * Die Strafe ist ein freies Textfeld (z.B. „20 Schläge") — kein Typen-Zoo, keine Sperrzeit-Kopplung.
 * Die Klugheit liegt im Urteilstext, nicht im Feld. „erledigtAt" schließt den Loop.
 */

/** MCP-kanonischer Vergehenstyp ↔ gespeicherter offenseType. */
export type OffenseCanonicalType =
  | "unauthorized_opening"
  | "late_control"
  | "rejected_control"
  | "auto_removed_control"
  | "cleaning_limit"
  | "wrong_device"
  | "missed_orgasm"
  | "late_lock"
  | "cleaning_not_relocked";

/** Canonical offense type → stored StrafeRecord.offenseType. Exported so the manual-punish route
 *  (src/app/api/admin/strafe/route.ts) can validate against the same list instead of a hand-copied one. */
export const STORED_TYPE: Record<OffenseCanonicalType, string> = {
  unauthorized_opening: "OEFFNEN_ENTRY",
  late_control: "KONTROLLANFORDERUNG",
  rejected_control: "KONTROLLANFORDERUNG",
  // Eigener Typ statt "KONTROLLANFORDERUNG" — eine vermutete Entfernung (Kontrolle nicht
  // beantwortet, System hat automatisch geöffnet) ist etwas anderes als eine verspätete Einreichung.
  auto_removed_control: "AUTO_ENTFERNT",
  cleaning_limit: "REINIGUNG_LIMIT",
  wrong_device: "FALSCHES_GERAET",
  missed_orgasm: "ORGASMUS_ANWEISUNG",
  late_lock: "VERSCHLUSS_ANFORDERUNG",
  cleaning_not_relocked: "REINIGUNG_NICHT_VERSCHLOSSEN",
};

export interface DetectedOffense {
  canonicalType: OffenseCanonicalType;
  offenseType: string;
  refId: string;
  at: Date | null;
}

/** cleaning_not_relocked shares its underlying OEFFNEN entry with cleaning_limit (both can fire on
 *  the same REINIGUNG opening — over the daily quota AND not relocked in time). StrafeRecord.refId
 *  is globally `@unique`, so the two offenses need disjoint ref namespaces — prefixed here rather
 *  than using the bare entry id. Exported so mcpOverview.ts's `judge()` call constructs the exact
 *  same ref (round-trips through judge_offense) and the admin route can reverse it for its IDOR check. */
export function cleaningNotRelockedRef(entryId: string): string {
  return `relock:${entryId}`;
}
export function entryIdFromCleaningNotRelockedRef(refId: string): string | null {
  return refId.startsWith("relock:") ? refId.slice("relock:".length) : null;
}

/** Flacht die buildStrafbuch-Listen zu einer einheitlichen Liste erkannter Vergehen mit stabiler ref.
 *  Dient der ref-Auflösung (judge_offense) und dem Zählen — keine Strafwertung. */
export function collectDetectedOffenses(sb: StrafbuchData): DetectedOffense[] {
  const mk = (canonicalType: OffenseCanonicalType, refId: string, at: Date | null): DetectedOffense =>
    ({ canonicalType, offenseType: STORED_TYPE[canonicalType], refId, at });
  return [
    ...sb.unauthorizedOpenings.map((o) => mk("unauthorized_opening", o.id, o.startTime)),
    ...sb.lateControls.map((k) => mk("late_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.rejectedControls.map((k) => mk("rejected_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.autoRemovedControls.map((k) => mk("auto_removed_control", k.id, k.entryStartTime ?? k.deadline)),
    ...sb.reinigungLimitViolations.map((v) => mk("cleaning_limit", v.entryId, v.startTime)),
    ...sb.wrongDeviceViolations.map((v) => mk("wrong_device", v.entryId, v.startTime)),
    ...sb.missedOrgasmInstructions.map((m) => mk("missed_orgasm", m.id, m.endetAt)),
    ...sb.lateLocks.map((a) => mk("late_lock", a.id, a.fulfilledAt ?? a.endetAt)),
    ...sb.cleaningNotRelocked.map((c) => mk("cleaning_not_relocked", cleaningNotRelockedRef(c.entryId), c.relockAt ?? c.deadline)),
  ];
}

export interface JudgeOffenseParams {
  userId: string;
  refId: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: Strafe (bei punish, erforderlich) bzw. optionaler Grund (bei dismiss). */
  text?: string;
  judgedBy: "ai" | "admin";
}

export interface JudgeOffenseResult {
  status: "punished" | "dismissed" | "open";
  done: boolean;
}

/**
 * Fällt/aktualisiert ein Urteil über ein erkanntes Vergehen (per refId).
 * - dismiss: markiert DISMISSED (verbindlich), text = optionaler Grund.
 * - punish: markiert PUNISHED, text = Strafe (erforderlich), erledigtAt = null (offen).
 * - complete: setzt erledigtAt = now auf einer bestehenden Strafe (Loop schließen).
 * - reopen: entfernt das Urteil (revidieren).
 */
/** Betreff + Text der „Strafe verhängt"-Benachrichtigung — geteilt von judgeOffense (MCP) und
 *  der Admin-Strafe-Route, damit beide Wege identisch benachrichtigen. */
export function strafeVerhaengtNotice(reason: string | null): NotifyContent {
  return reason
    ? { subjectKey: "penaltySubject", messageKey: "penaltyMessage", params: { reason } }
    : { subjectKey: "penaltySubject", messageKey: "penaltyMessageNoReason" };
}

export async function judgeOffense(p: JudgeOffenseParams): Promise<ServiceResult<JudgeOffenseResult>> {
  const now = new Date();

  if (p.action === "reopen") {
    const del = await prisma.strafeRecord.deleteMany({ where: { userId: p.userId, refId: p.refId } });
    if (del.count === 0) return serviceFail(404, "JUDGMENT_NOT_FOUND");
    return { ok: true, data: { status: "open", done: false } };
  }

  if (p.action === "complete") {
    const rec = await prisma.strafeRecord.findUnique({ where: { refId: p.refId } });
    if (!rec || rec.userId !== p.userId) return serviceFail(404, "JUDGMENT_NOT_FOUND");
    if (rec.status !== "PUNISHED") return serviceFail(400, "PENALTY_NOT_PUNISHED");
    await prisma.strafeRecord.update({ where: { refId: p.refId }, data: { erledigtAt: rec.erledigtAt ?? now } });
    return { ok: true, data: { status: "punished", done: true } };
  }

  const text = p.text?.trim() || null;
  if (p.action === "punish" && !text) return serviceFail(400, "PENALTY_TEXT_REQUIRED");

  // Vergehen muss aktuell erkannt sein (verhindert Urteile über Nicht-Vergehen).
  const offenses = collectDetectedOffenses(await buildStrafbuch(p.userId, now));
  const offense = offenses.find((o) => o.refId === p.refId);
  // Die ref stand früher im Fehlertext; sie ist ein Aufrufer-Argument, das der MCP-Agent bereits
  // kennt — ein Code ohne Interpolation genügt und bleibt übersetzbar.
  if (!offense) return serviceFail(404, "OFFENSE_NOT_FOUND");

  const status = p.action === "punish" ? "PUNISHED" : "DISMISSED";
  await prisma.strafeRecord.upsert({
    where: { refId: p.refId },
    create: { userId: p.userId, offenseType: offense.offenseType, refId: p.refId, bestraftDatum: now, status, reason: text, judgedBy: p.judgedBy, erledigtAt: null },
    update: { status, reason: text, judgedBy: p.judgedBy, erledigtAt: null, bestraftDatum: now },
  });

  // Nur bei verhängter Strafe benachrichtigen (ein Verwerfen ist für den Nutzer belanglos).
  if (status === "PUNISHED") await notifyUser(p.userId, strafeVerhaengtNotice(text));

  return { ok: true, data: { status: status === "PUNISHED" ? "punished" : "dismissed", done: false } };
}
