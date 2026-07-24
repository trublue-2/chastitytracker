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
  /** Noch nicht von der Box abgeholtes Eintrags-Kommando (tracker-lokal, sofort nach dem Eintrag
   *  gesetzt) — der Spiegel hinkt bis zum nächsten Box-Sync nach. */
  pendingCommand: "lock" | "open" | null;
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

/** `BoxStatus.pendingCommand` ist in Prisma ein freier `String?` — hier auf die zwei gültigen Werte
 *  verengen. Geteilt von allen Stellen, die die DB-Zeile nach aussen reichen (`/api/box`, MCP),
 *  damit die Whitelist nicht an jeder Ausgabestelle einzeln steht und auseinanderläuft. */
export function toPendingCommand(raw: string | null | undefined): "lock" | "open" | null {
  return raw === "lock" || raw === "open" ? raw : null;
}

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

/**
 * Laufender Übergang, den erst ein Knopfdruck an der Box vollzieht (Präsenz-Gate, FW ≥ 0.2.34):
 * `"closing"`/`"opening"` — oder null, wenn Soll und Ist übereinstimmen.
 *
 * Zwei Quellen: SOFORT nach dem Eintrag das tracker-lokale `pendingCommand` (der Spiegel weiss
 * noch nichts); nach dem nächsten Box-Sync der Soll/Ist-Mismatch aus dem Spiegel (`locked` vs
 * `reportedLocked`), bis der Riegel bestätigt ist. `pendingCommand` gewinnt: es ist die jüngere
 * Absicht. Am Consume-Sync selbst (Kommando abgeholt, Push mit dem Mismatch noch nicht da) kann
 * der Übergang für einen Poll-Takt kurz auf null fallen — kosmetisch, kein Zustandsverlust.
 */
export function boxPendingTransition(b: BoxRow): "closing" | "opening" | null {
  if (b.pendingCommand === "lock") return "closing";
  if (b.pendingCommand === "open") return "opening";
  if (b.reportedLocked === null) return null; // Alt-Zeile: kein IST bekannt → kein Mismatch ableitbar
  if (b.locked && !b.reportedLocked) return "closing";
  if (!b.locked && b.reportedLocked) return "opening";
  return null;
}

/** Ist-Zustand der Box (Hardware-Wahrheit): offen, oder verschlossen (mit/ohne bestätigten Riegel).
 *  Nutzt das ECHTE IST — seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu sein soll. */
export function boxIstLabel(b: BoxRow, t: Translate): string {
  if (!boxIsPhysicallyLocked(b)) return t("istOpen");
  return b.simpleLock ? t("istLockedBolt") : t("istLocked");
}

/**
 * Verlangt gerade irgendeine Quelle, dass die Box zu ist? Die EINE Ableitung des SOLL — genutzt von
 * der Soll-Zeile UND von der Konflikt-Optik der Karte, damit die beiden nicht auseinanderlaufen.
 *
 * Die drei Quellen sind unterschiedlich frisch, und genau daran hängt die Reihenfolge hier:
 *
 *  • `keyholderLocked`/`lockUntil` sind NICHT aus dem Spiegel — `/api/box` überlagert sie bei jedem
 *    Poll mit der aktiven Sperrzeit aus der Tracker-DB. Immer frisch, immer verbindlich.
 *  • `simpleLock` kommt per Push von Heimdall und steht bis zum nächsten Box-Sync auf dem Stand VOR
 *    dem Öffnungs-Eintrag.
 *
 * Deshalb schlägt ein anstehendes `open` nur den Spiegel-Anteil, nie die Sperrzeit. Ohne diese
 * Trennung würde eine Box, die nach dem `open` nie wieder synct (leerer Akku, WLAN weg), eine
 * Keyholder-Sperre DAUERHAFT verstecken: `pendingCommand` löscht ausschliesslich der Box-Sync, es
 * bliebe also für immer stehen (Review-Befund 24.07 an genau dieser Funktion).
 *
 * Warum der Spiegel-Anteil überhaupt weichen muss: sonst behauptet die Karte nach einer
 * eingetragenen Öffnung minutenlang „Soll: verschlossen" und malt dazu einen Konflikt-Alarm („steht
 * offen, obwohl zu verlangt") — für einen Konflikt, den der Sub gerade selbst und regelkonform
 * aufgelöst hatte (Vorfall 24.07). Das ist derselbe Vorrang, den `boxPendingTransition` schon kennt:
 * das Kommando ist die JÜNGERE Absicht.
 *
 * Dass der Alarm dabei verstummt, ist sicher, weil eine VERBOTENE Öffnung gar kein `open` erzeugt:
 * `boxCommandForEntry` gibt bei gebrochener Sperrzeit `null` zurück („das Dokumentieren des
 * Verstosses darf ihn nicht vollstrecken"). Ein Sperrbruch lässt den Spiegel also unangetastet.
 *
 * Bewusst NICHT symmetrisch: ein anstehendes `lock` erzwingt hier kein „verschlossen". Ein `open`
 * ENTWERTET den gespiegelten SOLL (er sagte „zu", jetzt gilt er nicht mehr); ein `lock` würde ihn nur
 * ERGÄNZEN, und die Details kennt erst Heimdalls nächster Push — sie hier zu erfinden wäre schlechter
 * als kurz zu warten. Den laufenden Übergang zeigt ohnehin `boxPendingTransition` an.
 *
 * BEKANNTE RESTLÜCKE: der Sync, der das Kommando abholt, pusht im selben Request noch den Zustand
 * VOR der Öffnung und löscht dabei `pendingCommand`. Für ein Sync-Intervall fällt die Zeile deshalb
 * auf den (noch alten) `simpleLock` zurück. Vorher galt das die ganze Zeit, jetzt nur in diesem
 * Fenster — behoben ist es damit aber nicht.
 */
export function boxSollLocked(b: BoxRow): boolean {
  if (b.keyholderLocked || b.lockUntil !== null) return true;
  if (b.pendingCommand === "open") return false;
  return b.simpleLock;
}

/** Soll-Zustand (Keyholder-Wahrheit): Sperre bis / ohne Zeitlimit / eigene Frist / kein Soll. */
export function boxSollLabel(b: BoxRow, t: Translate, fmtDateTime: (iso: string) => string): string {
  if (!boxSollLocked(b)) return t("sollNone");
  if (b.keyholderLocked) return b.lockUntil ? t("sollLockedUntil", { date: fmtDateTime(b.lockUntil) }) : t("sollLockedIndefinite");
  if (b.lockUntil) return t("sollUntil", { date: fmtDateTime(b.lockUntil) });
  return t("sollIndefinite");
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
