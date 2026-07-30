import type { ReactNode } from "react";
import { inlineLabelCls } from "@/app/components/inputStyles";

/**
 * Eine Zeile der Admin-Settings im Inline-Stil: Beschriftung – Eingabe(n) – Einheit.
 * Eine Fassung für alle Toggles, damit Abstände und Beschriftungs-Stil nicht je Datei driften.
 */
export default function InlineSettingRow({ label, unit, children }: {
  label: string;
  /** Nachgestellte Einheit/Erläuterung („min", „pro Tag") — entfällt, wenn keine gebraucht wird. */
  unit?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <span className={inlineLabelCls}>{label}</span>
      {children}
      {unit && <span className={inlineLabelCls}>{unit}</span>}
    </div>
  );
}
