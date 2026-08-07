"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Der Entfernen-Knopf einer Zeile in einer bearbeitbaren Liste.
 *
 * Extrahiert beim dritten Vorkommen (Öffnungsgründe, Reinigungsfenster, Aufgaben-Nachweise) —
 * dreimal dasselbe rohe `<button>` mit denselben Klassen, jedes Mal neu getippt.
 *
 * `icon` und `tone` sind Parameter und keine feste Wahl, weil die Bestandsseiten sich darin
 * unterscheiden: die Gründe-Liste löscht mit dem Papierkorb, die Fenster-Liste mit dem Kreuz, und
 * ihr Hover ist neutral statt warnend. Diese Unterschiede zu vereinheitlichen wäre eine
 * Design-Entscheidung — die Extraktion ist keine.
 */
export default function RemoveRowButton({
  onClick,
  ariaLabel,
  disabled = false,
  icon = <X size={16} />,
  tone = "warn",
}: {
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Abweichendes Symbol; Default ist das Kreuz. */
  icon?: ReactNode;
  /** `warn` = Hover wird zur Warnfarbe (Default), `neutral` = Hover nur etwas kräftiger. */
  tone?: "warn" | "neutral";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`p-1 text-foreground-faint disabled:opacity-50 shrink-0 transition ${
        tone === "warn" ? "hover:text-warn" : "hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
