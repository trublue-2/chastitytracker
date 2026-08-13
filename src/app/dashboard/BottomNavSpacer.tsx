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
  // Höhe aus dem Token `--bottom-nav-space` (globals.css) — dieselbe Quelle, aus der sich auch der
  // Admin-Platzhalter und die schwebenden Banner bedienen. Vorher stand die Zahl hier eigenständig
  // und war neun Pixel zu klein: so viel vom untersten Element jeder Seite lag unter der Leiste,
  // bei einem Knopf also ein Teil seiner Tap-Fläche.
  return <div className="h-[var(--bottom-nav-space)] lg:hidden" aria-hidden />;
}
