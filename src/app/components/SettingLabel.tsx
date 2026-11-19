"use client";

import type { ReactNode } from "react";
import InfoDot from "@/app/components/InfoDot";

/**
 * Die Beschriftung einer Einstellungs-Zeile: der Name, darunter die leisere Erklärung.
 *
 * Aus {@link Toggle} herausgezogen, als der Abschnitt „Vergehen" dieselbe Zeile mit einer AUSWAHL
 * statt eines Schalters brauchte. Zwei Zeilenarten stehen dort unmittelbar untereinander — ohne
 * gemeinsame Beschriftung driften sie beim nächsten Stil-Eingriff auseinander, und zwar genau dort,
 * wo es am meisten auffällt.
 */
export default function SettingLabel({ label, description, tone = "default", info, infoLabel }: {
  label: string;
  description?: string;
  /** `warn` färbt die Erklärung in die Warnfarbe — für eine Zeile, deren Erklärung ein HINDERNIS
   *  nennt statt einer Auskunft („Benachrichtigungen blockiert"). Gleiche Bedeutung wie bei {@link DetailField},
   *  aber in der Haus-Schreibweise `text-warn` — dessen `text-[var(--color-warn)]` ist die Ausnahme
   *  im Projekt, nicht die Regel, und soll sich nicht in ein zweites geteiltes Bauteil fortsetzen. */
  tone?: "default" | "warn";
  /** Seltene Erklärung hinter ein ⓘ neben dem Namen — wie bei {@link FieldLabel}. */
  info?: ReactNode;
  /** Zugänglicher Name des ⓘ: was dahinter steht, nicht der Name daneben. */
  infoLabel?: string;
}) {
  const name = <span className="text-sm font-medium text-foreground">{label}</span>;
  return (
    <div className="flex flex-col">
      {info == null ? name : (
        // `relative` + `anchor="parent"`: die Fläche setzt an der Zeile an, nicht am Zeichen — das
        // steht hinter dem Namen, und von dort lief sie auf dem Handy rechts aus dem Bild.
        <span className="relative flex items-center gap-1">
          {name}
          <InfoDot label={infoLabel ?? label} anchor="parent">{info}</InfoDot>
        </span>
      )}
      {description && (
        <span className={`text-xs ${tone === "warn" ? "text-warn" : "text-foreground-faint"}`}>
          {description}
        </span>
      )}
    </div>
  );
}
