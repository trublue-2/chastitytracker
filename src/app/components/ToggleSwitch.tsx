/**
 * Nur die SCHIENE mit dem Knopf — das sichtbare Schalter-Bild, ohne Zeile, Label oder Bedienung.
 *
 * Herausgelöst, damit zwei Stellen DENSELBEN Schalter zeigen: die volle Einstellungs-Zeile
 * ({@link Toggle}, Label links, Schalter rechts) und der Schnellschalter der Keyholder-Übersicht
 * (`QuickSettingChip`, inline neben den Aktionen). „Wie sonst auch" ist damit wörtlich — beide
 * malen dieselben Pixel, statt den Zustand einmal als Pille und einmal als Schalter zu zeigen.
 *
 * Rein darstellend: `aria-hidden`, den Zustand sagt der Träger über `role="switch"`/`aria-checked`
 * bzw. eine `sr-only`-Zeile an. Klick/Fokus/Tastatur gehören zum umschliessenden Bedienelement.
 */
export default function ToggleSwitch({ checked }: { checked?: boolean }) {
  return (
    <span
      className={[
        "relative inline-flex shrink-0 w-12 h-7 rounded-full transition-colors duration-fast",
        checked ? "bg-btn-primary" : "bg-border-strong",
      ].join(" ")}
      aria-hidden="true"
    >
      {/* Der Knopf nimmt die Schrift-Farbe der Primärfläche, nicht Weiss.
          Weiss auf `--btn-primary` mass 3,4 (rosa), 2,9 (indigo) und 1,9 (grün) — der
          EINGESCHALTETE Zustand war damit schlechter ablesbar als der ausgeschaltete (8,6 auf
          `border-strong`), und in der grünen Welt verschwamm der Knopf mit seiner Schiene. Genau
          verkehrt herum: der Zustand, der etwas aussagt, muss der deutlichere sein. */}
      <span
        className={[
          "block w-6 h-6 mt-0.5 rounded-full shadow-card transition-transform duration-fast",
          checked ? "bg-btn-primary-text translate-x-[22px]" : "bg-foreground translate-x-0.5",
        ].join(" ")}
      />
    </span>
  );
}
