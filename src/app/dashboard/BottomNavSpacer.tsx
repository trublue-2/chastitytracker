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
  return <div className="h-[calc(5rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden />;
}
