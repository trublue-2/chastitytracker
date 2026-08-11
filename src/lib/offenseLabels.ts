import type { OffenseCanonicalType } from "@/lib/offenseTypes";

/**
 * Der i18n-Schlüssel je Vergehensart im Namensraum `offenses` — `<key>.name` benennt die Art,
 * `<key>.desc` erklärt sie in einem Satz.
 *
 * Eine Stelle für ALLE Oberflächen, die Vergehensarten benennen: der Einstellungs-Abschnitt
 * „Vergehen", die Strafen-Sicht des Trägers, künftig der Kalender-Marker (#46). Jede von ihnen
 * bräuchte sonst ihre eigene Übersetzungstabelle — und die dritte Kopie wäre die, die eine neue Art
 * vergisst. Die Admin-Strafbuch-Seite behält ihre eigenen, ausführlicheren Sektions-Titel: dort
 * steht die Art in ihrem Kontext, hier steht sie für sich allein.
 */
export const OFFENSE_TYPE_I18N_KEYS: Record<OffenseCanonicalType, string> = {
  unauthorized_opening: "unauthorizedOpening",
  late_control: "lateControl",
  rejected_control: "rejectedControl",
  auto_removed_control: "autoRemovedControl",
  cleaning_limit: "cleaningLimit",
  wrong_device: "wrongDevice",
  missed_orgasm: "missedOrgasm",
  late_lock: "lateLock",
  cleaning_not_relocked: "cleaningNotRelocked",
  unfulfilled_task: "unfulfilledTask",
  admin_password_change: "adminPasswordChange",
  unauthorized_orgasm: "unauthorizedOrgasm",
  manual_offense: "manualOffense",
};

/** Die Reihenfolge, in der Vergehensarten angezeigt werden — vom Alltäglichen zum Seltenen, die
 *  beiden neuen am Schluss. Damit stehen sie in jeder Oberfläche gleich. */
export const OFFENSE_TYPE_ORDER: OffenseCanonicalType[] = [
  "unauthorized_opening",
  "late_control",
  "rejected_control",
  "auto_removed_control",
  "cleaning_limit",
  "cleaning_not_relocked",
  "late_lock",
  "missed_orgasm",
  "wrong_device",
  "unfulfilled_task",
  "unauthorized_orgasm",
  "manual_offense",
  "admin_password_change",
];
