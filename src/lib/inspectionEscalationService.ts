import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { clamp } from "@/lib/utils";
import { notifyUser } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { createOeffnenEntryTx } from "@/lib/oeffnenService";
import { AUTO_ENTFERNT_REASON, toLocale, NO_FIELDS_TO_UPDATE } from "@/lib/constants";
import type { ServiceResult } from "@/lib/serviceResult";

const DELAY_RANGE = { min: 5, max: 1440 } as const; // 5 min – 24 h, mirrors autoKontrolleService's FRIST_RANGE

interface InspectionEscalationUser {
  id: string;
  inspectionReminderEnabled: boolean;
  inspectionReminderDelayMinutes: number;
  inspectionAutoMarkEnabled: boolean;
  inspectionAutoMarkDelayMinutes: number;
}

/**
 * Stage 1: stamps `benachrichtigtReminderAt` on the given overdue KontrollAnforderung (the
 * clock-anchor Stage 2 counts its own delay from) and — only if the sub has the reminder
 * notification itself enabled — sends the reminder e-mail/push. The caller (kontrollePoller.ts'
 * `processInspectionEscalation`) is responsible for invoking this exactly once the delay has
 * elapsed, regardless of `inspectionReminderEnabled` — this function itself always stamps
 * unconditionally when called, but does NOT gate on delay/eligibility itself. This split is what
 * lets Stage 2 (auto-mark) run even when Stage 1's notification is turned off, per the "separate
 * toggles" design: the timestamp always advances once the caller invokes this, only the
 * user-visible notice is gated here.
 */
export async function sendInspectionReminder(ka: { id: string; code: string; user: InspectionEscalationUser }): Promise<void> {
  await prisma.kontrollAnforderung.update({
    where: { id: ka.id },
    data: { benachrichtigtReminderAt: new Date() },
  });
  if (ka.user.inspectionReminderEnabled) {
    await notifyUser(ka.user.id, {
      subjectKey: "inspectionReminderSubject",
      messageKey: "inspectionReminderMessage",
      params: { code: ka.code },
    });
  }
}

/**
 * Stage 2: auto-marks one overdue-and-reminded KontrollAnforderung as removed. Runs the
 * re-check + OEFFNEN-creation + KontrollAnforderung-update in a single transaction to close the
 * race window against a late self-submission (see createOeffnenEntryTx). Returns `{skipped:true}`
 * when there's nothing to do — either someone already resolved the row (race) or the sub is no
 * longer locked (self-opened without ever answering the Kontrolle); neither case is an error to
 * retry. On a "no longer locked" skip, the row is withdrawn so it stops being picked up every tick.
 */
export async function autoMarkInspectionRemoved(ka: { id: string; userId: string }): Promise<{ skipped: boolean }> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const fresh = await tx.kontrollAnforderung.findUnique({
      where: { id: ka.id },
      include: { user: { select: { locale: true } } },
    });
    if (!fresh || fresh.entryId || fresh.withdrawnAt || fresh.autoMarkedRemovedAt) {
      return { skipped: true }; // race: submitted/withdrawn/already auto-marked since the poller snapshot
    }

    let entryId: string;
    try {
      // Persisted, not just displayed once — the note stays on the Entry forever (Strafbuch/audit
      // history), so it's localized to the SUB's own stored language, not left hardcoded German.
      const tOpen = await getTranslations({ locale: toLocale(fresh.user.locale), namespace: "openForm" });
      const created = await createOeffnenEntryTx(tx, {
        userId: ka.userId,
        startTime: now,
        oeffnenGrund: AUTO_ENTFERNT_REASON,
        note: tOpen("autoEntferntNote"),
        source: "system",
      });
      entryId = created.entryId;
    } catch (e: unknown) {
      if ((e as { _code?: string })?._code === "NOT_LOCKED") {
        // Sub already opened themselves without ever answering — nothing to auto-mark. Withdraw so
        // this row drops out of the due-query instead of being re-checked every tick forever.
        await tx.kontrollAnforderung.update({ where: { id: ka.id }, data: { withdrawnAt: now } });
        return { skipped: true };
      }
      throw e;
    }

    await tx.kontrollAnforderung.update({
      where: { id: ka.id },
      data: { autoMarkedRemovedAt: now, withdrawnAt: now, autoMarkedEntryId: entryId },
    });
    return { skipped: false };
  });
}

/** Sends the Stage-2 "auto-marked-removed" notice to the sub AND their keyholders/admins. Call
 *  AFTER the transaction in {@link autoMarkInspectionRemoved} commits (notifications are not
 *  transactional and must never block/roll back the state change). */
export async function notifyInspectionAutoMarked(opts: { userId: string; username: string; code: string }): Promise<void> {
  const { userId, username, code } = opts;
  await notifyUser(userId, {
    subjectKey: "inspectionAutoRemovedSubjectSub",
    messageKey: "inspectionAutoRemovedMessageSub",
    params: { code },
  });
  const controllers = await getControllersOfUser(userId);
  await Promise.all(controllers.map((c) =>
    notifyUser(c.id, {
      subjectKey: "inspectionAutoRemovedSubjectKeyholder",
      messageKey: "inspectionAutoRemovedMessageKeyholder",
      params: { username, code },
    }),
  ));
}

export interface SetInspectionEscalationParams {
  reminderEnabled?: boolean;
  reminderDelayMinutes?: number;
  autoMarkEnabled?: boolean;
  autoMarkDelayMinutes?: number;
}

/** Persists the per-sub escalation settings (both stages independently toggleable). Minute
 *  values are clamped to DELAY_RANGE, mirroring autoKontrolleService's clamp-on-write pattern. */
export async function setInspectionEscalationSettings(
  userId: string,
  params: SetInspectionEscalationParams,
): Promise<ServiceResult<null>> {
  const data: Record<string, boolean | number> = {};
  if (params.reminderEnabled !== undefined) data.inspectionReminderEnabled = params.reminderEnabled;
  if (params.reminderDelayMinutes !== undefined) {
    data.inspectionReminderDelayMinutes = clamp(params.reminderDelayMinutes, { ...DELAY_RANGE, fallback: 5 });
  }
  if (params.autoMarkEnabled !== undefined) data.inspectionAutoMarkEnabled = params.autoMarkEnabled;
  if (params.autoMarkDelayMinutes !== undefined) {
    data.inspectionAutoMarkDelayMinutes = clamp(params.autoMarkDelayMinutes, { ...DELAY_RANGE, fallback: 60 });
  }

  // Gleicher Kontrakt wie setReinigungSettings/setAutoKontrolleSettings: ein leerer Patch ist ein
  // Aufruferfehler. Reine Geschwister-Konsistenz — über die Route unerreichbar (sie prüft vorher
  // „mind. ein Feld") und derzeit ohnehin folgenlos, da sie das ServiceResult verwirft.
  if (Object.keys(data).length === 0) return { ok: false, status: 400, error: NO_FIELDS_TO_UPDATE };
  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, data: null };
}
