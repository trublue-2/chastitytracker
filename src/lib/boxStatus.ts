// Geteilte, client-sichere Box-Status-Ableitung. EINE Quelle für Ist/Soll/Frische, genutzt von der
// Dashboard-Box-Status-Karte (BoxStatusCard). Keine Server-Imports — reine Formatierung; i18n bleibt
// beim Aufrufer (Labels via übergebenem `t`).

import type { ReinigungView, ReinigungsFenster } from "@/lib/reinigungService";
import type { CleaningBlockReason } from "@/lib/queries";

export type BoxRow = {
  boxId: string;
  name: string;
  /** SOLL: soll die Box zu sein (Heimdall-Entscheid, gespiegelt). */
  locked: boolean;
  /** Physisches IST der letzten Sync-Meldung — kann vom SOLL abweichen (Präsenz-Guard: „soll zu,
   *  steht offen und wartet auf Knopf/USB"). null = Alt-Zeile ohne IST-Meldung → SOLL gilt. */
  reportedLocked: boolean | null;
  simpleLock: boolean;
  keyholderLocked: boolean;
  /** Effektives Soll-Ende (Sperrzeit-Ende oder eigene Frist); null = ohne Zeitlimit / kein Soll. */
  lockUntil: string | null;
  /** Letzter Box-Sync (ISO) — Grundlage der Frische-Anzeige. null = noch nie gesynct. */
  lastSyncAt: string | null;
};

/** Reinigungs-Regeln des Subs: die `ReinigungView` des Servers plus das nächste Fenster.
 *  Nicht neu deklariert — sonst müsste ein neues Feld in `buildReinigungView` hier von Hand
 *  nachgezogen werden und die Karte läse still `undefined`. `import type` wird zur Laufzeit
 *  gelöscht, zieht also kein Prisma in dieses client-sichere Modul. */
export type BoxReinigungView = ReinigungView & {
  nextWindow: ReinigungsFenster | null;
  /** Das Live-Urteil des Servers (`cleaningBlockReason`), inklusive der AKTIVEN Sperrzeit. `allowed`
   *  allein kennt sie nicht — deshalb versprach die Karte Fenster, die eine reinigungsverbietende
   *  Sperre längst gesperrt hatte. */
  blockedBy: CleaningBlockReason | null;
};

export type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Die Zeile „wann gibt die Box den Schlüssel frei". null = nichts anzuzeigen (Reinigung ist für
 * diesen Sub kein Begriff).
 *
 * Verbietet die AKTIVE Sperrzeit Reinigung, nennt die Zeile genau das — sonst lüde sie zu einer
 * Öffnung ein, die der Server als Sperrbruch wertet. Ein noch nicht offenes Fenster blendet nichts
 * aus: dort zeigt die Karte wie bisher das nächste.
 *
 * Reihenfolge nach Dringlichkeit: Sperre zuerst (nichts geht), dann offenes Fenster (jetzt handeln),
 * sonst das nächste, sonst der Hinweis, dass keine Fenster konfiguriert sind (= nicht zeitgebunden).
 */
export function boxReinigungLabel(r: BoxReinigungView | null, t: Translate): string | null {
  if (!r?.allowed) return null;
  if (r.blockedBy === "lockPeriodForbids") return t("cleaningBlockedByLockPeriod");
  if (r.windowOpenNow) return t("cleaningWindowOpen", { until: r.windowOpenNow.until });
  if (r.nextWindow) return t("cleaningWindowNext", { start: r.nextWindow.start, end: r.nextWindow.end });
  return t("cleaningNoWindows");
}

/** „Heute 1 von 2 Reinigungsöffnungen" — null ohne Tages-Limit, und null während einer Sperrzeit,
 *  die Reinigung ohnehin verbietet: ein Kontingent, das niemand ausschöpfen darf, ist kein Angebot. */
export function boxReinigungQuotaLabel(r: BoxReinigungView | null, t: Translate): string | null {
  if (!r?.allowed || r.blockedBy === "lockPeriodForbids" || r.maxPausesPerDay === null) return null;
  return t("cleaningQuota", { count: r.usedToday, max: r.maxPausesPerDay });
}

/** Frischer als das → „gerade aktiv"; darüber → „zuletzt vor X". */
const LIVE_THRESHOLD_MS = 2 * 60_000;

/** Physisches IST der Box: das gemeldete `reportedLocked`, bei Alt-Zeilen ohne Meldung das SOLL. */
export const boxIsPhysicallyLocked = (b: BoxRow): boolean => b.reportedLocked ?? b.locked;

/** Ist-Zustand der Box (Hardware-Wahrheit): offen, oder verschlossen (mit/ohne bestätigten Riegel).
 *  Nutzt das ECHTE IST — seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu sein soll. */
export function boxIstLabel(b: BoxRow, t: Translate): string {
  if (!boxIsPhysicallyLocked(b)) return t("istOpen");
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
