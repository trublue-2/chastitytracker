"use client";

/**
 * Die Beschriftung einer Einstellungs-Zeile: der Name, darunter die leisere Erklärung.
 *
 * Aus {@link Toggle} herausgezogen, als der Abschnitt „Vergehen" dieselbe Zeile mit einer AUSWAHL
 * statt eines Schalters brauchte. Zwei Zeilenarten stehen dort unmittelbar untereinander — ohne
 * gemeinsame Beschriftung driften sie beim nächsten Stil-Eingriff auseinander, und zwar genau dort,
 * wo es am meisten auffällt.
 */
export default function SettingLabel({ label, description, tone = "default" }: {
  label: string;
  description?: string;
  /** `warn` färbt die Erklärung in die Warnfarbe — für eine Zeile, deren Erklärung ein HINDERNIS
   *  nennt statt einer Auskunft („Benachrichtigungen blockiert"). Gleiche Bedeutung wie bei {@link DetailField},
   *  aber in der Haus-Schreibweise `text-warn` — dessen `text-[var(--color-warn)]` ist die Ausnahme
   *  im Projekt, nicht die Regel, und soll sich nicht in ein zweites geteiltes Bauteil fortsetzen. */
  tone?: "default" | "warn";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {description && (
        <span className={`text-xs ${tone === "warn" ? "text-warn" : "text-foreground-faint"}`}>
          {description}
        </span>
      )}
    </div>
  );
}
