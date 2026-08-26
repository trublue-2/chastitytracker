"use client";

import { useCallback, useState } from "react";

/**
 * Eine Zeile, die nur die Assistenztechnik hört: „Auswahlmodus aktiv", „Filter geändert: 12
 * Nachrichten", „Aufgaben ist jetzt an Position 3 von 12".
 *
 * Es gibt sie als eigenes Bauteil, weil eine Live-Region drei Eigenschaften braucht, die man
 * einzeln leicht vergisst — und jede davon macht sie still oder aufdringlich:
 *
 *  - **`polite`, nie `assertive`.** `assertive` unterbricht den Screenreader mitten im Satz.
 *  - **Sie steht IMMER im Baum, auch leer.** Eine Region, die erst zusammen mit ihrem Text
 *    erscheint, wird von den meisten Screenreadern nicht vorgelesen: sie beobachten nur Regionen,
 *    die es beim Aufbau der Seite schon gab.
 *  - **Ihr Inhalt ändert sich nur durch eine Handlung.** In `TimerDisplay` sass einmal ein
 *    `aria-live` auf einer Zahl, die im Sekundentakt neu geschrieben wurde — der Screenreader sagte
 *    die Dauer endlos an und unterbrach sich dabei selbst; auf dem Dashboard mit laufender Session
 *    war nichts anderes mehr hörbar. Wer diese Zeile an einen tickenden Wert hängt, baut denselben
 *    Fehler nach.
 *
 * Der Text kommt als fertiger Satz vom Aufrufer, nicht als Bausteine: er ist die einzige Form, in
 * der die Änderung überhaupt wahrgenommen wird, und gehört deshalb dorthin, wo man weiss, was sich
 * geändert hat.
 */
export default function LiveStatus({ children, seq = 0 }: { children?: React.ReactNode; seq?: number }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {children}
      {/* Ein unsichtbares Zeichen, das bei jeder Meldung wechselt.
          
          Ohne es bleibt DERSELBE Satz zweimal hintereinander stumm: der Textknoten ändert sich nicht,
          also gibt es für den Screenreader kein Ereignis. Zu treffen ist das sofort — Kategorie
          wechseln von einem Filter mit zwölf Treffern auf einen anderen mit zwölf Treffern, und die
          zweite Ansage fällt aus. Das Nullbreiten-Leerzeichen wird nicht vorgelesen. */}
      {seq % 2 === 1 ? "\u200B" : ""}
    </p>
  );
}

/**
 * Der Zustand hinter einer {@link LiveStatus}-Zeile: `announce(satz)` setzen, `{...x}` ausgeben.
 *
 * Über einen Hook statt über zwei `useState` je Aufrufer, damit niemand den Zähler vergisst — und
 * ein vergessener Zähler fällt nicht auf, weil er nur die WIEDERHOLUNG einer Meldung betrifft.
 */
export function useAnnouncement() {
  const [state, setState] = useState({ children: "" as React.ReactNode, seq: 0 });
  const announce = useCallback((text: React.ReactNode) => {
    setState((prev) => ({ children: text, seq: prev.seq + 1 }));
  }, []);
  return { ...state, announce };
}
