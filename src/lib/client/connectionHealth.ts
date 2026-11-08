/**
 * Ob die Verbindung TRÄGT — die einzige Auskunft darüber, der zu trauen ist.
 *
 * **Warum `navigator.onLine` dafür nicht reicht.** Er beantwortet eine andere Frage: ob eine
 * Netzwerk-Schnittstelle existiert. Bei einem Balken Empfang steht er auf `true`, während nichts
 * durchkommt. Genau in diesem Fall — gemeldet 28.08.2026, Aufschluss unterwegs erfassen — blieb der
 * `OfflineIndicator` stumm, sprang die Offline-Warteschlange nicht an, und der Nutzer sah einen
 * Klick, der nichts tat. Der Flugmodus war abgedeckt, der häufigere Fall „schlecht" nicht.
 *
 * Umgekehrt gilt er weiterhin: `onLine === false` heisst zuverlässig „kein Netz". Unzuverlässig ist
 * nur das `true`. Deshalb ersetzt dieses Modul den Schalter nicht, es ergänzt ihn um das, was nur
 * der Versuch selbst weiss.
 *
 * Gespeist wird der Zustand von `fetchWithTimeout()` (`apiClient.ts`): jede abgelaufene Anfrage
 * meldet `reportStalled()`, jede Antwort — auch eine mit Fehlerstatus, sie kam ja an —
 * `reportReachable()`. Gelesen wird er ausschliesslich über `useConnectionStalled()`
 * (`app/hooks/`) — die drei Store-Funktionen darunter sind dessen Innenleben, kein Aufrufer sollte
 * sie direkt anfassen.
 *
 * Das Modul ist bewusst **importfrei** und rahmenlos (kein React): es hängt an der
 * Netzwerk-Schicht, die auch ausserhalb einer Komponente läuft, und ein Import von dort in einen
 * Hook wäre die falsche Richtung.
 */

let stalled = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (stalled === next) return;
  stalled = next;
  listeners.forEach((l) => l());
}

/** Eine Anfrage lief in ihr Zeitlimit — die Verbindung steht, trägt aber nicht. */
export function reportStalled() {
  set(true);
}

/**
 * Eine Antwort ist angekommen. Auch ein 500er zählt: die Frage ist, ob Pakete fliessen, nicht ob
 * der Server zufrieden war.
 */
export function reportReachable() {
  set(false);
}

/** Für `useSyncExternalStore` — beide Funktionen müssen stabil sein, deshalb Modul-Ebene. */
export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConnectionStalled(): boolean {
  return stalled;
}

/**
 * Der Server-Schnappschuss ist IMMER `false`, nicht der aktuelle Wert.
 *
 * `useSyncExternalStore` rendert damit serverseitig und beim ersten Client-Bild — stimmten die
 * beiden nicht überein, wäre es ein Hydrations-Fehler. Und auf dem Server hat „stockt" ohnehin
 * keine Bedeutung: der Modulzustand gehört einem Browser-Tab, nicht dem Prozess.
 */
export function getConnectionStalledServer(): boolean {
  return false;
}
