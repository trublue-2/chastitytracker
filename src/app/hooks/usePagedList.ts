"use client";

import { useState } from "react";

/**
 * Der Blätter-Zustand einer Liste: aktuelle Seite, ihre Einträge, die Seitenzahl — zusammen mit
 * `ListPager` die eine Quelle dieses Musters.
 *
 * Der Grund für den Hook ist die Klemmung. Die Seite lebt im Client und überlebt einen
 * Server-Refresh; die Liste darunter kann dabei SCHRUMPFEN (eine Aufgabe wird gesichtet und fällt
 * aus dem Fenster, ein Eintrag wird gelöscht). Ohne Klemmung schneidet der Aufrufer dann hinter dem
 * Ende: leere Liste, dazu eine Fusszeile, die „6 / 5" behauptet.
 *
 * Geklemmt wird beim LESEN, nicht per Effekt: ein Effekt korrigiert erst NACH dem Rendern, die leere
 * Seite wäre also trotzdem kurz zu sehen. Gespeichert bleibt der rohe Wert — geklemmt wird, was
 * herauskommt, nicht was hineingeht. Wächst die Liste wieder, steht damit wieder die ursprüngliche
 * Seite da; sobald der Nutzer einmal blättert, rechnet er ohnehin vom geklemmten Wert aus weiter.
 */
export default function usePagedList<T>(items: T[], pageSize: number) {
  const [requested, setRequested] = useState(0);

  // Leere Liste = NULL Seiten, nicht eine leere. Die untere Klemme hält `page` trotzdem bei 0: ein
  // negativer Index schnitte in JS vom Ende her, statt zu erklären, was schiefging.
  const totalPages = Math.ceil(items.length / pageSize);
  const page = Math.max(0, Math.min(requested, totalPages - 1));

  /**
   * Nur eine ZAHL, bewusst nicht der rohe `useState`-Setter: dessen Updater-Form (`setPage(p => p-1)`)
   * bekäme `requested`, also den UNgeklemmten Wert. Steht der auf 5, während geklemmt Seite 4 zu
   * sehen ist, rechnet „Zurück" 5-1=4 und klemmt zurück auf 4 — ein Knopf, der aktiv aussieht und
   * nichts tut. Als Zahl-Signatur ist genau das ein Compile-Fehler statt eines toten Knopfes.
   */
  const setPage = (next: number) => setRequested(next);

  return {
    page,
    setPage,
    totalPages,
    /** Die Einträge dieser Seite. */
    visible: items.slice(page * pageSize, (page + 1) * pageSize),
  };
}
