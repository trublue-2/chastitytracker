"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  /** Beschriftung nur für Screenreader — für Kreuzchen in einer Liste, wo die Zeile daneben schon
   *  sagt, worum es geht. Der Text bleibt PFLICHT: ein Kreuzchen ohne Namen ist für einen
   *  Screenreader eine leere Schaltfläche. */
  labelHidden?: boolean;
  /** Leisere Erklärung unter der Beschriftung — dieselbe Zeilenform wie bei {@link Toggle}, damit
   *  ein Kästchen und ein Schalter untereinander nicht verschieden gebaut sind. Sie gehört INS
   *  Label und nicht daneben: ein zweites `<label>` um dieses Bauteil wäre verschachtelt, und ein
   *  Klick auf den Text schaltete zweimal. Mit `labelHidden` wirkungslos. */
  description?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, labelHidden, description, disabled, className = "", id: externalId, checked, ...rest },
  ref,
) {
  const autoId = useId();
  const id = externalId ?? autoId;
  const descId = `${id}-desc`;

  const row = (
    <label
      htmlFor={id}
      className={[
        // `items-center` auch mit Erklärung: das Kästchen sitzt dann neben der Mitte der zwei
        // Zeilen, nicht neben der ersten — sonst klebt es optisch an der Beschriftung.
        "inline-flex items-center gap-3 min-h-[48px] cursor-pointer select-none",
        // `aria-disabled` zählt hier mit: die Klassen dieses Bauteils hängen an der BESCHRIFTUNG,
        // das Attribut geht per Rest ans Eingabefeld — eine `aria-disabled:`-Variante von aussen
        // griffe deshalb am falschen Element. Ohne diese Zeile musste jede Aufrufstelle die
        // Dämpfung selbst als Klasse mitgeben und den Grund dafür danebenschreiben.
        disabled || rest["aria-disabled"] ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          // Die Erklärung ist eine BESCHREIBUNG, kein Teil des Namens: stünde sie im `<label>`,
          // läse der Screenreader beim Durchtabben neun Sätze statt neun Wörter. Dieselbe Trennung
          // wie bei `Toggle`, nur dort über `aria-label` gelöst.
          aria-describedby={description && !labelHidden ? descId : undefined}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={[
            "w-5 h-5 rounded border-2 transition-colors",
            "flex items-center justify-center",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
            checked
              ? "bg-btn-primary border-btn-primary"
              : "bg-surface border-border-strong",
            disabled ? "" : "peer-hover:border-foreground-faint",
          ].filter(Boolean).join(" ")}
          aria-hidden="true"
        >
          {checked && (
            <Check size={14} className="text-btn-primary-text" strokeWidth={3} />
          )}
        </span>
      </span>
      <span className={labelHidden ? "sr-only" : "text-sm text-foreground"}>{label}</span>
    </label>
  );

  // Ohne Erklärung bleibt es Zeichen für Zeichen bei der bisherigen Ausgabe — die acht bestehenden
  // Aufrufer sollen von diesem Prop nichts merken. Mit Erklärung tritt eine Hülle darum, weil die
  // Zeile dann aus ZWEI Zeilen besteht und die zweite nicht ins Label gehört (siehe
  // `aria-describedby` oben).
  if (!description || labelHidden) return row;

  return (
    <div className="flex flex-col">
      {row}
      {/* Eingerückt auf die Beschriftung: Kästchen (20 px) + Abstand (12 px). `-mt-2` holt die
          Zeile an das Label heran, dessen Zeilenhöhe auf 48 px Trefferfläche ausgelegt ist. */}
      <span id={descId} className="pl-8 -mt-2 text-xs text-foreground-faint">{description}</span>
    </div>
  );
});

export default Checkbox;
