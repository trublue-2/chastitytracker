/** Platz der fixen Bottom-Nav am Ende des Content-Flusses (Mobile); tritt mit ihr auf Formularen zurück. */
export default function BottomNavSpacer() {
  // Höhe aus dem Token `--bottom-nav-space` (globals.css) — dieselbe Quelle, aus der sich auch der
  // Admin-Platzhalter und die schwebenden Banner bedienen. Vorher stand die Zahl hier eigenständig
  // und war neun Pixel zu klein: so viel vom untersten Element jeder Seite lag unter der Leiste,
  // bei einem Knopf also ein Teil seiner Tap-Fläche.
  return <div data-yields-to-form className="h-[var(--bottom-nav-space)] lg:hidden" aria-hidden />;
}
