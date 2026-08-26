import type { ReactNode } from "react";
import { blockInsetCls } from "@/app/components/inputStyles";

/**
 * Der Ton des Zustands — die Farbe des WORTES über der Zahl.
 *
 * Das Leuchten gehört nicht mehr dazu: es liegt seit v6 am Bereichs-Wrapper (`.world-glow` in
 * `globals.css`), bleibt beim Scrollen stehen und folgt der Welt statt dem Block. Ein zweites,
 * mitscrollendes Leuchten hier daneben wäre eine zweite Lichtquelle im selben Bild.
 */
export type StateHeroTone = "lock" | "unlock" | "warn" | "quiet";

const TONE: Record<StateHeroTone, string> = {
  // Verschlossen: die Zustandsfarbe.
  lock: "text-lock",
  // Eine Frist läuft — das will etwas, also bekommt es Aufmerksamkeit.
  warn: "text-warn",
  // Offen — der GEGENZUSTAND, nicht die Abwesenheit eines Zustands. Farbe ja, Leuchten nein: das
  // Leuchten spiegelt den Ton im Grund, und in der Keyholder-Welt (Indigo) gehört ihm der Grund
  // nicht. Für den Träger sagt seine eigene Welt bereits „offen"; dort bleibt `quiet` richtig.
  unlock: "text-unlock",
  // Kein Zustand, sondern gar keine Aussage — der Träger, von dem noch nichts vorliegt.
  quiet: "text-foreground-muted",
};

/**
 * Der Held eines Bildschirms: **ein leises Wort, eine grosse Zahl, eine leise Zeile.** Kein Kasten.
 *
 * Die Figur, an der dieses Redesign hängt, und die einzige Antwort auf die Leitfrage des jeweiligen
 * Bildschirms („bin ich verschlossen und wie lange schon", „wie viele brauchen meine
 * Entscheidung"). Vorher stand dieselbe Auskunft dreimal übereinander — eine Rubrik, ein Wert und
 * eine beschriftete Dauer, die alle dasselbe beantworteten.
 *
 * **Warum als Bauteil und nicht als Muster:** die Figur stand nach dem Umbau des offenen Zustands
 * (#83) VIERMAL zeichengleich im Baum — verschlossen, offen, Keyholder-Sicht und die Bauteil-Schau.
 * Genau so laufen Dinge auseinander: die drei Kopien entstanden in derselben Stunde und trugen
 * schon `pt-6` gegen `pt-8`. Was viermal gleich aussehen soll, muss einmal geschrieben sein.
 *
 * `tone` trägt die Regel des Entwurfs: Farbe markiert, was JETZT etwas will. Verschlossen und eine
 * laufende Frist wollen etwas, „gerade offen" nicht — deshalb steht `quiet` ohne Farbe da, und das
 * ist kein Mangel, sondern die Aussage.
 */
export default function StateHero({ word, tone, icon, value, footnote, children }: {
  /** Der Zustand als EIN Wort. */
  word: ReactNode;
  tone: StateHeroTone;
  /** Steht hinter dem Wort, nicht davor — das Wort ist die Aussage, das Zeichen die Beigabe. */
  icon: ReactNode;
  /** Die Zahl. Sie IST der Bildschirm. */
  value: ReactNode;
  /** Woher die Zahl kommt — eine Fussnote, keine zweite Aussage. */
  footnote?: ReactNode;
  /** Was darunter noch am Zustand hängt: Schlüssel-Zeile, Sperrzeit, ein Knopf. */
  children?: ReactNode;
}) {
  const wordCls = TONE[tone];
  return (
    <div className={`relative ${blockInsetCls} pt-8 pb-2`}>
      {/* Klein und in Versalien-Nähe, aber NICHT als Rubrik gesetzt: eine Rubrik benennt einen
          Abschnitt, dieses Wort ist der WERT — die Antwort, die die Zahl darunter beziffert. */}
      <p className={`relative inline-flex items-center gap-2 text-fliess font-semibold tracking-[0.02em] ${wordCls}`}>
        {word}
        {icon}
      </p>

      {/* `whitespace-nowrap`, weil eine Zahl, die umbricht, keine Zahl mehr ist: `text-zahl` skaliert
          mit der Fensterbreite, und „365T 23h 59min" trifft bei 375 px genau die Spaltenbreite. */}
      <p className="relative mt-3 text-zahl font-semibold tabular-nums tracking-[-0.045em] whitespace-nowrap text-foreground">
        {value}
      </p>

      {footnote && <p className="relative mt-3 text-neben text-foreground-muted">{footnote}</p>}
      {children}
    </div>
  );
}
