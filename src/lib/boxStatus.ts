// Geteilte, client-sichere Box-Status-Ableitung. EINE Quelle für Ist/Soll/Frische, genutzt von der
// Dashboard-Box-Status-Karte (BoxStatusCard) UND der (+)-Menü-Box-Zeile (NewEntrySheet). Keine
// Server-Imports — reine Formatierung; i18n bleibt beim Aufrufer (Labels via übergebenem `t`).

export type BoxRow = {
  boxId: string;
  name: string;
  locked: boolean;
  simpleLock: boolean;
  keyholderLocked: boolean;
  /** Effektives Soll-Ende (Sperrzeit-Ende oder eigene Frist); null = ohne Zeitlimit / kein Soll. */
  lockUntil: string | null;
  /** Letzter Box-Sync (ISO) — Grundlage der Frische-Anzeige. null = noch nie gesynct. */
  lastSyncAt: string | null;
};

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Frischer als das → „gerade aktiv"; darüber → „zuletzt vor X". */
const LIVE_THRESHOLD_MS = 2 * 60_000;

/** Ist-Zustand der Box (Hardware-Wahrheit): offen, oder verschlossen (mit/ohne bestätigten Riegel). */
export function boxIstLabel(b: BoxRow, t: Translate): string {
  if (!b.locked) return t("istOpen");
  return b.simpleLock ? t("istLockedBolt") : t("istLocked");
}

/** Soll-Zustand (Keyholder-Wahrheit): Sperre bis / ohne Zeitlimit / eigene Frist / kein Soll. */
export function boxSollLabel(b: BoxRow, t: Translate, fmtDateTime: (iso: string) => string): string {
  if (b.keyholderLocked) return b.lockUntil ? t("sollLockedUntil", { date: fmtDateTime(b.lockUntil) }) : t("sollLockedIndefinite");
  if (b.lockUntil) return t("sollUntil", { date: fmtDateTime(b.lockUntil) });
  if (b.simpleLock) return t("sollIndefinite");
  return t("sollNone");
}

/** Frische aus `lastSyncAt`: „gerade aktiv" (< 2 Min), sonst „zuletzt vor X"; null → nie gesynct. */
export function boxFreshnessLabel(lastSyncAt: string | null, now: number, t: Translate): string {
  if (!lastSyncAt) return t("neverSynced");
  const ageMs = Math.max(0, now - new Date(lastSyncAt).getTime());
  if (ageMs < LIVE_THRESHOLD_MS) return t("live");
  const min = Math.floor(ageMs / 60_000);
  if (min < 60) return t("lastSeenMinutes", { count: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("lastSeenHours", { count: hours });
  return t("lastSeenDays", { count: Math.floor(hours / 24) });
}

/** Wohin die (+)-Box-Zeile springt: offene Box → verschliessen, verschlossene → öffnen. */
export function boxJumpHref(b: BoxRow): string {
  return b.locked ? "/dashboard/new/oeffnen" : "/dashboard/new/verschluss";
}
