import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Eine Zeile, die sagt, dass etwas nicht stimmt — Warndreieck, Warnfarbe, ein Satz.
 *
 * Die kleinste Warn-Figur des Systems, unterhalb von `FormError` (die eine Fläche mitbringt) und
 * unterhalb der kompakten Banner (die eine Frist und eine Aktion tragen). Sie steht dort, wo ein
 * Zustand nur BENANNT wird und es nichts anzuklicken gibt.
 */
export default function WarnLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-neben font-medium text-warn">
      <AlertTriangle size={14} className="shrink-0" aria-hidden />
      {children}
    </p>
  );
}
