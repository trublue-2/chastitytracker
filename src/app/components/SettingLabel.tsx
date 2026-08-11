"use client";

/**
 * Die Beschriftung einer Einstellungs-Zeile: der Name, darunter die leisere Erklärung.
 *
 * Aus {@link Toggle} herausgezogen, als der Abschnitt „Vergehen" dieselbe Zeile mit einer AUSWAHL
 * statt eines Schalters brauchte. Zwei Zeilenarten stehen dort unmittelbar untereinander — ohne
 * gemeinsame Beschriftung driften sie beim nächsten Stil-Eingriff auseinander, und zwar genau dort,
 * wo es am meisten auffällt.
 */
export default function SettingLabel({ label, description }: {
  label: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {description && <span className="text-xs text-foreground-faint">{description}</span>}
    </div>
  );
}
