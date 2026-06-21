import { prisma } from "@/lib/prisma";
import { buildStrafbuch, type StrafbuchData } from "@/lib/strafbuch";
import { notifyUser } from "@/lib/notify";
import type { ServiceResult } from "@/lib/serviceResult";

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
  | "cleaning_limit"
  | "wrong_device"
  | "missed_orgasm";

const STORED_TYPE: Record<OffenseCanonicalType, string> = {
  unauthorized_opening: "OEFFNEN_ENTRY",
  late_control: "KONTROLLANFORDERUNG",
  rejected_control: "KONTROLLANFORDERUNG",
  cleaning_limit: "REINIGUNG_LIMIT",
  wrong_device: "FALSCHES_GERAET",
  missed_orgasm: "ORGASMUS_ANWEISUNG",
};

export interface DetectedOffense {
  canonicalType: OffenseCanonicalType;
  offenseType: string;
  refId: string;
  at: Date | null;
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
    ...sb.reinigungLimitViolations.map((v) => mk("cleaning_limit", v.entryId, v.startTime)),
    ...sb.wrongDeviceViolations.map((v) => mk("wrong_device", v.entryId, v.startTime)),
    ...sb.missedOrgasmInstructions.map((m) => mk("missed_orgasm", m.id, m.endetAt)),
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
export async function judgeOffense(p: JudgeOffenseParams): Promise<ServiceResult<JudgeOffenseResult>> {
  const now = new Date();

  if (p.action === "reopen") {
    const del = await prisma.strafeRecord.deleteMany({ where: { userId: p.userId, refId: p.refId } });
    if (del.count === 0) return { ok: false, status: 404, error: "Kein Urteil zu diesem Vergehen gefunden." };
    return { ok: true, data: { status: "open", done: false } };
  }

  if (p.action === "complete") {
    const rec = await prisma.strafeRecord.findUnique({ where: { refId: p.refId } });
    if (!rec || rec.userId !== p.userId) return { ok: false, status: 404, error: "Kein Urteil zu diesem Vergehen gefunden." };
    if (rec.status !== "PUNISHED") return { ok: false, status: 400, error: "Nur eine verhängte Strafe kann erledigt werden." };
    await prisma.strafeRecord.update({ where: { refId: p.refId }, data: { erledigtAt: rec.erledigtAt ?? now } });
    return { ok: true, data: { status: "punished", done: true } };
  }

  const text = p.text?.trim() || null;
  if (p.action === "punish" && !text) return { ok: false, status: 400, error: "Eine Strafe (text) ist erforderlich." };

  // Vergehen muss aktuell erkannt sein (verhindert Urteile über Nicht-Vergehen).
  const offenses = collectDetectedOffenses(await buildStrafbuch(p.userId, now));
  const offense = offenses.find((o) => o.refId === p.refId);
  if (!offense) return { ok: false, status: 404, error: `Kein offenes Vergehen mit ref ${p.refId}.` };

  const status = p.action === "punish" ? "PUNISHED" : "DISMISSED";
  await prisma.strafeRecord.upsert({
    where: { refId: p.refId },
    create: { userId: p.userId, offenseType: offense.offenseType, refId: p.refId, bestraftDatum: now, status, reason: text, judgedBy: p.judgedBy, erledigtAt: null },
    update: { status, reason: text, judgedBy: p.judgedBy, erledigtAt: null, bestraftDatum: now },
  });

  // Nur bei verhängter Strafe benachrichtigen (ein Verwerfen ist für den Nutzer belanglos).
  if (status === "PUNISHED") {
    await notifyUser(p.userId, {
      subject: "Strafe verhängt",
      message: text ? `Der Keyholder hat eine Strafe verhängt: ${text}` : "Der Keyholder hat eine Strafe verhängt.",
    });
  }

  return { ok: true, data: { status: status === "PUNISHED" ? "punished" : "dismissed", done: false } };
}
