/** Ein beschriftetes Feld im Detail-Panel (Foto-Vollbild, Kontroll-Liste, Eintrags-Details):
 *  Kleines Grossbuchstaben-Label über dem Wert.
 *
 *  Der WERT kommt als `children` statt als String-Prop — er ist zu verschieden, um ihn zu
 *  vereinheitlichen: mal hervorgehoben, mal gedämpft, mal eine Pille, mal ein Monospace-Code,
 *  mal mehrere Zeilen. Vereinheitlicht ist genau das, was überall gleich war: das Label.
 */
export default function DetailField({
  label,
  tone = "default",
  children,
}: {
  label: React.ReactNode;
  /** `warn` färbt das Label in die Warnfarbe (z.B. korrigierte Zeitangabe). */
  tone?: "default" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`text-xs uppercase tracking-wider font-semibold mb-0.5 ${
          tone === "warn" ? "text-[var(--color-warn)]" : "text-foreground-faint"
        }`}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
