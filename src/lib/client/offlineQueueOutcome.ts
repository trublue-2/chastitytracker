/**
 * Was die Offline-Warteschlange mit der Antwort auf einen eingereihten Eintrag macht.
 *
 * Eigene, reine Funktion statt Verzweigung im Hook: die Zuordnung Status → Folge ist die Stelle,
 * an der Daten still verloren gingen (400/409 zählten als „synchronisiert") oder ewig liegen blieben
 * (401/403/404/413/429 fielen in keinen Zweig und wurden bei jedem `online`-Ereignis neu gesendet).
 *
 *   sent      angekommen — aus der Warteschlange nehmen, Erfolgsmeldung
 *   rejected  ENDGÜLTIG abgelehnt — aus der Warteschlange nehmen, aber NICHT als Erfolg melden:
 *             der Eintrag existiert auf dem Server nicht, der Nutzer muss das erfahren
 *   auth      nicht angemeldet / nicht berechtigt — liegen lassen und den Lauf anhalten; ein weiterer
 *             Versuch lohnt erst nach dem nächsten Login (ein Versuch je Lauf, keine Schleife)
 *   retry     vorübergehend (429, 5xx) — liegen lassen, Lauf anhalten, später erneut
 *   skip      unbekannte Ablehnung — liegen lassen, aber die übrigen Einträge nicht blockieren
 */
export type QueueOutcome = "sent" | "rejected" | "auth" | "retry" | "skip";

/** Antworten, die sich durch Wiederholen nie ändern: der Rumpf ist falsch, der Eintrag oder das Ziel
 *  existiert nicht (mehr), ein anderer Eintrag steht im Weg, die Datei ist zu gross. */
const FINAL_REJECTIONS: ReadonlySet<number> = new Set([400, 404, 409, 413, 422]);

export function classifyQueueResponse(status: number): QueueOutcome {
  if (status >= 200 && status < 300) return "sent";
  if (FINAL_REJECTIONS.has(status)) return "rejected";
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status >= 500) return "retry";
  return "skip";
}

/** Hält der Ausgang den Lauf an? (Die übrigen Einträge würden am selben Grund scheitern.) */
export function stopsQueueRun(outcome: QueueOutcome): boolean {
  return outcome === "auth" || outcome === "retry";
}
