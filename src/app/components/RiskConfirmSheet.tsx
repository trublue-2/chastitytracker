"use client";

import { type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import Button from "@/app/components/Button";
import Sheet from "@/app/components/Sheet";

/**
 * Rückfrage vor einem Schritt, der ERLAUBT ist, aber Folgen hat: eine Reinigung über dem
 * Tageskontingent, ein Öffnen während einer Sperrzeit, das Ablegen eines Geräts, das eine laufende
 * Aufgabe verlangt.
 *
 * Zwei Dinge unterscheiden sie von {@link ConfirmDialog} und sind der Grund, warum sie eine eigene
 * Komponente ist statt eines Flags dort:
 *
 *  - **Umgekehrte Knopf-Hierarchie.** Primär ist das ZURÜCKTRETEN, sekundär das Weitermachen. Bei
 *    einer Rückfrage, die den Nutzer vor sich selbst schützt, darf die riskante Wahl nicht die
 *    optisch betonte sein. `ConfirmDialog` betont umgekehrt (dort bestätigt der Nutzer, was er
 *    ohnehin will) — beides im selben Formular nebeneinander wäre genau die Verwechslung, die eine
 *    Rückfrage verhindern soll.
 *  - **Reicher Inhalt.** Der Körper ist `children`, keine Textzeile: die Aufrufer zeigen mehrere
 *    Absätze, bedingte Zusatzhinweise (Box bleibt verschlossen, Sperrzeit läuft bis …) und Listen
 *    von Aufgaben-Fristen.
 *
 * `Sheet` statt eines nativen `confirm()` aus demselben Grund wie überall sonst: das native steht
 * ausserhalb des Design-Systems und ist nicht beschriftbar.
 */
export default function RiskConfirmSheet({
  open,
  onClose,
  title,
  stayLabel,
  proceedLabel,
  onProceed,
  proceeding = false,
  children,
}: {
  open: boolean;
  /** Zurücktreten — sowohl der primäre Knopf als auch das Wegwischen des Sheets. */
  onClose: () => void;
  title: string;
  /** Beschriftung des primären („doch nicht") Knopfes. */
  stayLabel: string;
  /** Beschriftung des sekundären („trotzdem") Knopfes. */
  proceedLabel: string;
  onProceed: () => void;
  /** Läuft die Aktion noch (Netzabruf), zeigt der Weitermachen-Knopf seinen Spinner. */
  proceeding?: boolean;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <AlertCircle size={28} className="flex-shrink-0 text-warn mt-0.5" />
          <div className="flex flex-col gap-1.5">
            <p className="font-bold text-foreground text-base leading-snug">{title}</p>
            {children}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="primary" fullWidth onClick={onClose}>
            {stayLabel}
          </Button>
          <Button type="button" variant="secondary" fullWidth loading={proceeding} onClick={onProceed}>
            {proceedLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
