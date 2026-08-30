"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/apiClient";

/**
 * Die Mechanik einer Listen-Aktion, die per `PATCH` etwas an einer Zeile ändert: Laufzustand,
 * Absenden, Neu-Laden.
 *
 * Extrahiert beim dritten Vorkommen (Rückzug einer Direktive, „als erledigt melden", Sichtung eines
 * Nachweises). Beim zweiten war die Rückstellung noch vertretbar — beim dritten ist es der Fall, für
 * den die Regel geschrieben ist.
 *
 * Bewusst NUR die Mechanik. Wie ein Fehler AUSSIEHT, entscheidet der Aufrufer: der Rückzug-Knopf
 * zeigt eine allgemeine Meldung, die Erledigt-Meldung einen Toast (sie läuft zusätzlich über die
 * Offline-Warteschlange), die Sichtung den aufgelösten Fehler-Code inline. Diese drei
 * zusammenzuzwingen hiesse, eine vierte Anzeigeform zu erfinden, die keiner der drei wollte.
 *
 * `run` liefert die Antwort zurück (oder `null`, wenn das Netz gar nicht antwortete) — genug für
 * jede der drei Auswertungen, ohne dass der Hook sie kennen muss.
 */
export function useActionPatch() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  /**
   * Sendet die Anfrage. Bei Erfolg wird die Seite neu geladen; sonst entscheidet der Aufrufer.
   *
   * `DELETE` ist zugelassen, weil es dieselbe Mechanik ist: Zeile anfassen, Laufzustand, neu laden.
   * Ohne Body — ein `DELETE` trägt keinen, und `JSON.stringify(undefined)` wäre `undefined` als
   * Rumpf, was manche Server als Syntaxfehler lesen.
   */
  async function run(url: string, body?: unknown, method: "PATCH" | "DELETE" = "PATCH"): Promise<Response | null> {
    setSaving(true);
    try {
      const res = await fetchWithTimeout(url, {
        method,
        ...(body === undefined ? {} : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
      if (res.ok) router.refresh();
      return res;
    } catch {
      // Netzfehler: kein `Response`, den der Aufrufer auswerten könnte.
      return null;
    } finally {
      setSaving(false);
    }
  }

  return { saving, run };
}
