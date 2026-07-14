import { releaseSperrzeitenOnOpen, getLatestKgEntry, type PrismaTx } from "@/lib/queries";
import { codedError } from "@/lib/codedError";

export interface CreateOeffnenParams {
  userId: string;
  startTime: Date;
  // Keeps the existing German field name (mirrors Entry.oeffnenGrund) rather than the usual
  // new-identifier-English rule — it's the same enum family as the pre-existing OEFFNEN_GRUENDE
  // values, and an English name here alongside the German DB column would confuse more than help.
  oeffnenGrund: string;
  note: string;
  /** "system" = auto-created (e.g. missed-inspection escalation), never chosen by a user. */
  source: "user" | "system";
}

export interface CreateOeffnenResult {
  entryId: string;
  withdrawnSperrzeit: boolean;
}

/**
 * Core state-check + Sperrzeit-release + entry-create logic. Takes a caller-supplied transaction
 * client so a caller that needs its OWN surrounding transaction (the inspection-escalation
 * auto-mark stage, which must atomically re-check the KontrollAnforderung row alongside creating
 * the entry) can call this directly instead of nesting `prisma.$transaction` calls (Prisma does
 * not support that — each would open its own connection). Throws `{ _code: "NOT_LOCKED" |
 * "TIME_BEFORE" }` on invalid state. The only current caller is autoMarkInspectionRemoved(); if a
 * second caller needs its own top-level transaction, wrap this with `prisma.$transaction((tx) =>
 * createOeffnenEntryTx(tx, params))` rather than reintroducing an unused convenience wrapper.
 */
export async function createOeffnenEntryTx(tx: PrismaTx, params: CreateOeffnenParams): Promise<CreateOeffnenResult> {
  const { userId, startTime, oeffnenGrund, note, source } = params;

  // tx zwingend durchreichen: der Guard muss in DERSELBEN Transaktion lesen (TOCTOU).
  const latest = await getLatestKgEntry(userId, tx);
  if (!latest || latest.type !== "VERSCHLUSS") {
    throw codedError("NOT_LOCKED");
  }
  if (startTime <= latest.startTime) {
    throw codedError("TIME_BEFORE");
  }

  const withdrawnSperrzeit = await releaseSperrzeitenOnOpen(userId, oeffnenGrund, tx, source);

  const created = await tx.entry.create({
    data: { userId, type: "OEFFNEN", startTime, oeffnenGrund, note, source },
  });

  return { entryId: created.id, withdrawnSperrzeit };
}
