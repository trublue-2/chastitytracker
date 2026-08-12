import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { clamp, APP_TZ } from "@/lib/utils";
import { notifyUser, notifyControllers } from "@/lib/notify";
import { getControllersOfUser } from "@/lib/keyholder";
import { createOeffnenEntryTx } from "@/lib/oeffnenService";
import { prepareWearEntry } from "@/lib/queries";
import { resolveInspectionTarget, isKgTarget } from "@/lib/inspectionTarget";
import {
  AUTO_ENTFERNT_REASON, toLocale, NO_FIELDS_TO_UPDATE,
  INSPECTION_REMINDER_DELAY_RANGE, INSPECTION_AUTO_MARK_DELAY_RANGE,
} from "@/lib/constants";
import { codeOf } from "@/lib/codedError";
import { isSleepingAt, autoKontrolleSettingsFromUser, type AutoKontrolleUserFields } from "@/lib/autoKontrolleService";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/*
 * KEINE Nachricht dieses Moduls trägt einen `actor` — und das ist eine Entscheidung, kein Vergessen.
 *
 * Die Eskalation ist der eine Fall, in dem eine Frist verstreicht und die APP daraus etwas ableitet:
 * die Mahnung schickt eine Uhr, die automatische Ablage eine Regel, die der Keyholder einmal
 * eingeschaltet hat. Ihn hier zu nennen behauptete, er habe gerade gehandelt — er hat vor Wochen
 * einen Schalter umgelegt. Diese Zeilen bleiben deshalb System-Zeilen (siehe `senderFromAuthor`).
 */

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
/**
 * WANN Stufe 2 zuschlägt — dieselbe Rechnung, die `processInspectionEscalation` anwendet, nur
 * vorwärts statt rückwärts. `null` heisst „gar nicht".
 *
 * Liegt HIER und nicht beim Anzeiger, weil die Zwei-Stufen-Logik sonst an zwei Orten stünde und der
 * zweite nur die Hälfte der Regeln kennt. Genau das war der Fall: die erste Fassung im Dashboard
 * rechnete stur `deadline + beide Verzögerungen` und übersah dabei zweierlei.
 *
 * ANKER ist der Mahn-Stempel, sobald er gesetzt ist — Stufe 2 zählt ihre Frist ab ihm, nicht ab der
 * Kontrollfrist. Ohne diese Unterscheidung wäre die Ankündigung nicht bloss ungenau: wird
 * `inspectionReminderDelayMinutes` nachträglich hochgesetzt, nachdem gestempelt wurde, verspräche
 * die Anzeige Stunden, die es nicht gibt — und gebucht würde weit VOR der angekündigten Zeit. Eine
 * Ankündigung, die zu spät liegt, ist schlimmer als gar keine.
 *
 * KEINE Vorhersage für eine Reinigungs-Kontrolle, die im Schlaf-Fenster zugestellt wurde: für die
 * fällt Stufe 2 dauerhaft aus (siehe die Bedingung im Poller). Eine Drohung, die nie eintritt,
 * kostet die Glaubwürdigkeit aller anderen.
 */
export function predictAutoMarkAt(
  ka: {
    deadline: Date;
    benachrichtigtReminderAt: Date | null;
    benachrichtigtAt: Date | null;
    wirksamAb: Date | null;
    cleaningRelock: boolean;
  },
  // Nur die Felder, die die Rechnung liest — nicht der ganze User: so kann ein Aufrufer eine
  // schmale Zeile laden, statt eine breite laden zu müssen, weil der Typ sie verlangt.
  user: Pick<InspectionEscalationUser, "inspectionAutoMarkEnabled" | "inspectionReminderDelayMinutes" | "inspectionAutoMarkDelayMinutes">
    & AutoKontrolleUserFields & { timezone: string | null },
): Date | null {
  if (!user.inspectionAutoMarkEnabled) return null;
  if (ka.cleaningRelock && isSleepingAt(autoKontrolleSettingsFromUser(user), ka.benachrichtigtAt ?? ka.wirksamAb ?? ka.deadline, user.timezone ?? APP_TZ)) {
    return null;
  }
  const anchor = ka.benachrichtigtReminderAt
    ? ka.benachrichtigtReminderAt.getTime()
    : ka.deadline.getTime() + user.inspectionReminderDelayMinutes * 60_000;
  return new Date(anchor + user.inspectionAutoMarkDelayMinutes * 60_000);
}

export async function sendInspectionReminder(ka: { id: string; code: string | null; user: InspectionEscalationUser }): Promise<void> {
  await prisma.kontrollAnforderung.update({
    where: { id: ka.id },
    data: { benachrichtigtReminderAt: new Date() },
  });
  if (ka.user.inspectionReminderEnabled) {
    await notifyUser(ka.user.id, {
      subjectKey: "inspectionReminderSubject",
      // Ohne Code eine eigene Variante statt `{code}` mit Leerstring zu füttern — sonst stünde
      // „Deine Kontrolle mit Code  ist überfällig" in der Mail.
      messageKey: ka.code ? "inspectionReminderMessage" : "inspectionReminderMessageNoCode",
      params: ka.code ? { code: ka.code } : {},
      inbox: { ref: { type: "control", id: ka.id } },
      alwaysNotify: true,
    });
  }
}

/**
 * Stage 2: auto-marks one overdue-and-reminded KontrollAnforderung as removed. Runs the
 * re-check + Entry-creation + KontrollAnforderung-update in a single transaction to close the
 * race window against a late self-submission (see createOeffnenEntryTx). Returns `{skipped:true}`
 * when there's nothing to do — either someone already resolved the row (race) or the target is no
 * longer active (sub opened/removed it without ever answering the Kontrolle); neither case is an
 * error to retry. On a "no longer active" skip, the row is withdrawn so it stops being picked up
 * every tick.
 *
 * Der erzeugte Eintrag folgt dem ZIEL: beim KG ein OEFFNEN („Gerät ab"), bei einer Trage-Kontrolle
 * ein WEAR_END auf dem getragenen Gerät. Beide sagen dasselbe — die Statistik soll keine Zeit
 * ausweisen, für die der Nachweis verweigert wurde.
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

    // Der Sub hat sich selbst geöffnet / abgelegt, ohne je zu antworten — nichts zu markieren.
    // Zurückziehen, damit die Zeile aus der Fällig-Abfrage fällt statt jeden Tick neu geprüft zu
    // werden. EIN Ausgang für beide Ziele, damit sich die Behandlung nicht auseinanderentwickelt.
    const skipInactive = async () => {
      await tx.kontrollAnforderung.update({ where: { id: ka.id }, data: { withdrawnAt: now } });
      return { skipped: true as const };
    };

    // „Läuft das Ziel noch, und mit welchem Gerät?" — über denselben Resolver wie das Anlegen. Eine
    // hier nachgebaute Antwort könnte von der abweichen, gegen die die Kontrolle gestellt wurde.
    const resolved = await resolveInspectionTarget(ka.userId, fresh, tx);
    if (!resolved.ok || !resolved.target.active) return skipInactive();
    const target = resolved.target;

    // Persisted, not just displayed once — the note stays on the Entry forever (Strafbuch/audit
    // history), so it's localized to the SUB's own stored language, not left hardcoded German.
    // Dieselbe Notiz für beide Ziele: der Anlass ist derselbe, nur der Eintragstyp unterscheidet sich.
    const tOpen = await getTranslations({ locale: toLocale(fresh.user.locale), namespace: "openForm" });
    const note = tOpen("autoEntferntNote");

    let entryId: string;
    if (!isKgTarget(target)) {
      // Trage-Kontrolle: die laufende Session beenden. `prepareWearEntry` ist derselbe
      // Invarianten-Guard wie auf dem Selbst-Erfassungs-Pfad (Reihenfolge, Zeitrichtung).
      // Beendet wird, was GETRAGEN wird — auch wenn die Kontrolle ein anderes Gerät verlangte:
      // der Nachweis fehlt für die laufende Session, und eine fremde kann sie nicht ersetzen.
      const wornDeviceId = target.activeDeviceId!;
      const wear = await prepareWearEntry(tx, ka.userId, "WEAR_END", wornDeviceId, now, null);
      if (!wear.ok) return skipInactive();
      const created = await tx.entry.create({
        data: { userId: ka.userId, type: "WEAR_END", startTime: now, deviceId: wornDeviceId, note, source: "system" },
      });
      entryId = created.id;
    } else {
      try {
        const created = await createOeffnenEntryTx(tx, {
          userId: ka.userId,
          startTime: now,
          oeffnenGrund: AUTO_ENTFERNT_REASON,
          note,
          source: "system",
        });
        entryId = created.entryId;
      } catch (e: unknown) {
        if (codeOf(e) === "NOT_LOCKED") return skipInactive();
        throw e;
      }
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
export async function notifyInspectionAutoMarked(opts: {
  userId: string; username: string; code: string | null; controlId: string;
  /** Trage-Kontrolle statt KG: Stufe 2 hat ein WEAR_END gebucht, kein Öffnen — und die Meldung
   *  muss sagen, was tatsächlich passiert ist. */
  wear?: boolean;
}): Promise<void> {
  const { userId, username, code, controlId, wear = false } = opts;
  // Vier Textvarianten aus zwei Achsen (Ziel × Code) — als Suffixe zusammengesetzt statt als
  // Kaskade von vier Ternären, die bei einer dritten Achse unlesbar würde.
  const variant = `${wear ? "Wear" : ""}${code ? "" : "NoCode"}` as "" | "Wear" | "NoCode" | "WearNoCode";
  await notifyUser(userId, {
    subjectKey: "inspectionAutoRemovedSubjectSub",
    messageKey: `inspectionAutoRemovedMessageSub${variant}`,
    params: code ? { code } : {},
    inbox: { ref: { type: "control", id: controlId } },
    alwaysNotify: true,
  });
  await notifyControllers(userId, await getControllersOfUser(userId), {
    subjectKey: "inspectionAutoRemovedSubjectKeyholder",
    messageKey: `inspectionAutoRemovedMessageKeyholder${variant}`,
    params: code ? { username, code } : { username },
    // DIESELBE Referenz wie oben beim Träger: beide Seiten reden über dieselbe Kontrolle. Ohne sie
    // trüge die Keyholder-Zeile als einzige keinen Bezug — kein Kommentar der Anforderung, und im
    // Posteingang stünde eine Meldung über einen Vorgang, den sie nicht benennen kann.
    inbox: { ref: { type: "control", id: controlId } },
  });
}

export interface SetInspectionEscalationParams {
  reminderEnabled?: boolean;
  reminderDelayMinutes?: number;
  autoMarkEnabled?: boolean;
  autoMarkDelayMinutes?: number;
}

/** Persists the per-sub escalation settings (both stages independently toggleable). Minute values
 *  are clamped to the range constant of their own field, mirroring autoKontrolleService's
 *  clamp-on-write pattern — the admin form clamps against the very same constants. */
export async function setInspectionEscalationSettings(
  userId: string,
  params: SetInspectionEscalationParams,
): Promise<ServiceResult<null>> {
  const data: Record<string, boolean | number> = {};
  if (params.reminderEnabled !== undefined) data.inspectionReminderEnabled = params.reminderEnabled;
  if (params.reminderDelayMinutes !== undefined) {
    data.inspectionReminderDelayMinutes = clamp(params.reminderDelayMinutes, INSPECTION_REMINDER_DELAY_RANGE);
  }
  if (params.autoMarkEnabled !== undefined) data.inspectionAutoMarkEnabled = params.autoMarkEnabled;
  if (params.autoMarkDelayMinutes !== undefined) {
    data.inspectionAutoMarkDelayMinutes = clamp(params.autoMarkDelayMinutes, INSPECTION_AUTO_MARK_DELAY_RANGE);
  }

  // Gleicher Kontrakt wie setReinigungSettings/setAutoKontrolleSettings: ein leerer Patch ist ein
  // Aufruferfehler. Reine Geschwister-Konsistenz — über die Route unerreichbar (sie prüft vorher
  // „mind. ein Feld"), aber ihr Ergebnis wird dort ausgewertet und durchgereicht.
  if (Object.keys(data).length === 0) return serviceFail(400, NO_FIELDS_TO_UPDATE);
  await prisma.user.update({ where: { id: userId }, data });
  return { ok: true, data: null };
}
