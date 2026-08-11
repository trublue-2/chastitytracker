"use client";

import { usePathname } from "next/navigation";
import { isEntryFormRoute } from "@/lib/entryFormRoute";

/**
 * Reserviert auf Mobile am Ende des Content-Flusses den Platz der fixen Bottom-Nav (h-16 +
 * Versions-Fusszeile), damit sie kein Feld verdeckt. Auf den Erfassungs-/Bearbeitungs-Seiten ist die
 * Nav ausgeblendet (siehe {@link BottomNav}) und ihr Platz entfällt — dort sitzt stattdessen die fixe
 * Formular-Aktionsleiste, deren Abstand die Formular-Hülle selbst reserviert. Spiegelt exakt die
 * Sichtbarkeitsregel der Nav via {@link isEntryFormRoute}.
 */
export default function BottomNavSpacer() {
  const pathname = usePathname();
  if (isEntryFormRoute(pathname)) return null;
  // Die tatsächliche Höhe der Nav, Summand für Summand: 4rem Reiter-Zeile (`h-16`) + 1.5rem
  // Versions-Fusszeile (`h-6`) + 1px Oberkante (`border-t`). Vorher standen hier 5rem — neun Pixel
  // zu wenig, und genau so viel vom untersten Element jeder Dashboard-Seite lag unter der Leiste.
  // Bei einem Knopf heisst das: ein Teil der Tap-Fläche ist nicht erreichbar. Ändert sich die Nav,
  // ändert sich diese Zeile mit.
  return <div className="h-[calc(5.5rem+1px+env(safe-area-inset-bottom))] lg:hidden" aria-hidden />;
}
