"use client";

import { Plus } from "lucide-react";

/**
 * Der Hinzufügen-Knopf unter einer bearbeitbaren Liste — das Gegenstück zu {@link RemoveRowButton}.
 *
 * Extrahiert beim vierten Vorkommen (Öffnungsgründe, Reinigungs-Fenster, Wiege-Fenster,
 * Tages-Ausnahmen der Kontrollen). Genau die Drift, gegen die der Entfernen-Knopf schon einmal
 * herausgezogen wurde, war hier bereits eingetreten: drei Listen setzten leise an
 * (`text-xs`, gedämpft), die vierte laut (`text-sm`, Akzentfarbe) — und zwei davon stehen in
 * derselben Admin-Spalte untereinander.
 *
 * `tone` hält den Unterschied fest, statt ihn zu vereinheitlichen: welche der beiden Formen die
 * richtige ist, wäre eine Design-Entscheidung — die Extraktion ist keine.
 */
export default function AddRowButton({ label, onClick, disabled = false, tone = "quiet" }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** `quiet` = gedämpft und klein (Vorgabe), `accent` = in der Akzentfarbe. */
  tone?: "quiet" | "accent";
}) {
  const quiet = tone === "quiet";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 disabled:opacity-50 w-fit ${
        quiet ? "text-xs text-foreground-muted hover:text-foreground" : "text-sm text-accent hover:opacity-80"
      }`}
    >
      <Plus size={quiet ? 14 : 16} /> {label}
    </button>
  );
}
