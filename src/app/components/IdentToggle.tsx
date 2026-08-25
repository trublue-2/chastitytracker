"use client";

import { useEffect, useState } from "react";
import SegmentedControl from "@/app/components/SegmentedControl";
import { readStoredIdent, setStoredIdent, type Ident } from "@/lib/ident";

/**
 * Der Umschalter zwischen den beiden Farbwelten — Rosa oder Grün.
 *
 * Steht neben den Design-Umschaltern in den Einstellungen und nicht als schwebende Taste über der
 * App: er soll die Bildschirme vergleichbar machen, nicht auf jedem davon mit im Bild stehen.
 *
 * Er verschwindet mit der Entscheidung. Bis dahin ist er die einzige Art, die Frage zu
 * beantworten, ohne zwei Bauten nebeneinander zu halten.
 */
export default function IdentToggle({ label }: { label: string }) {
  const [ident, setIdent] = useState<Ident>("rosa");

  // Erst nach dem Einhängen lesen: `localStorage` gibt es serverseitig nicht, und ein abweichender
  // Anfangswert wäre ein Hydration-Unterschied. Das Aufblitzen verhindert das Inline-Skript.
  useEffect(() => setIdent(readStoredIdent()), []);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-neben font-medium text-foreground-faint mr-auto whitespace-nowrap">
        {label}
      </span>
      <SegmentedControl
        options={[
          { value: "rosa", label: "Rosa" },
          { value: "gruen", label: "Grün" },
        ]}
        value={ident}
        onChange={(v) => {
          const next = v as Ident;
          setIdent(next);
          setStoredIdent(next);
        }}
      />
    </div>
  );
}
