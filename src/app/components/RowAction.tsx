import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Das Handlungswort am Ende einer antippbaren Zeile — Icon, Wort, Chevron.
 *
 * Ein Chevron allein sagt „hier geht es weiter", aber nicht, was dort passiert — genau das war offen
 * („Wo muss ich klicken, um ein Foto zu erfassen?", Rückmeldung 02.08.2026). Umgekehrt sagt ein
 * blosses Wort nicht, dass es ANTIPPBAR ist: eine Zeile, die aussieht wie Text, wird auch als Text
 * gelesen (Rückmeldung 15.08.2026 — „einige Links sind nicht als Funktionselemente erkennbar").
 * Beides zusammen beantwortet beide Fragen, und deshalb sind sie EIN Bauteil und nicht zwei.
 *
 * WARUM DAS BLEIBENDE ZEICHEN und nicht bloss ein `hover:`-Zustand: die App wird überwiegend auf dem
 * Handy bedient, und dort gibt es kein Hover. Ein Klickziel, das seine Natur erst beim Überfahren mit
 * der Maus verrät, ist auf dem Hauptgerät unsichtbar. Der Hover-Zustand kommt am Zeilen-Container
 * dazu, ersetzt dieses Zeichen aber nicht.
 *
 * Aus `TaskCard` herausgezogen, wo es als lokale Funktion stand, während dieselbe Frage an drei
 * weiteren Stellen je eigen (und uneinheitlich) beantwortet wurde: `CategoryLinkRow` überliess den
 * Chevron seinen AUFRUFERN — von zweien setzte ihn genau einer, dieselbe Zeile war also je nach
 * Dashboard-Block erkennbar oder nicht.
 */
export default function RowAction({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-foreground">
      {icon}
      {label}
      <ChevronRight size={14} className="text-foreground-faint" />
    </span>
  );
}
