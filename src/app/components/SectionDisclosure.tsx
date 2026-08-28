"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Die Zuklapp-Mechanik eines Abschnitts — der einzige Teil von `Section`, der einen Zustand hat.
 *
 * **Warum als eigene Datei und nicht als `"use client"` an `Section`:** `Section` steht an rund
 * dreissig Stellen (14 direkt, gut ein Dutzend über `SettingsSection`), viele in Server-Komponenten. Eine Direktive dort machte jeden dieser
 * Abschnitte zur Client-Insel — für eine Fähigkeit, die eine Handvoll Blöcke braucht. Der Zustand
 * bekommt deshalb seine eigene Grenze, und `Section` reicht Kopf und Inhalt als Knoten hinein.
 *
 * Gerüst und Klassen kommen als Prop von `Section`, damit ein zugeklappter Abschnitt nicht anders
 * gebaut ist als ein fester.
 */
export default function SectionDisclosure({
  id,
  className,
  headerCls,
  bodyCls,
  heading,
  action,
  defaultCollapsed,
  children,
}: {
  id?: string;
  className: string;
  headerCls: string;
  bodyCls: string;
  /** Die fertige Rubrik — sie kommt von `Section`, damit Ton und Lautstärke dort entschieden bleiben. */
  heading: ReactNode;
  action?: ReactNode;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [zu, setZu] = useState(!!defaultCollapsed);
  const inhaltId = useId();

  // `useState` ist ein INITIALISIERER — der Wert wird genau einmal gelesen. „Dashboard anpassen"
  // speichert aber mit `router.refresh()`, und dabei bleibt diese Komponente dieselbe Instanz: die
  // frisch gesetzte Vorgabe kam nie an. Der Nutzer stellte „beim Öffnen zugeklappt" ein, drückte
  // Fertig — und nichts geschah, bis er hart neu lud.
  //
  // Nachziehen WÄHREND des Renderns (nicht in einem Effekt): so ist der neue Wert schon im ersten
  // Bild da, statt einen Rahmen lang den alten zu zeigen. Das ist das von React dafür vorgesehene
  // Muster; der Vergleichswert muss mitgeführt werden, sonst überschriebe der Abgleich bei jedem
  // Render das, was der Nutzer gerade selbst angetippt hat.
  const [zuletztVorgegeben, setZuletztVorgegeben] = useState(defaultCollapsed);
  if (zuletztVorgegeben !== defaultCollapsed) {
    setZuletztVorgegeben(defaultCollapsed);
    setZu(!!defaultCollapsed);
  }

  return (
    <section id={id} className={className}>
      <div className={headerCls}>
        {/* Die ganze Rubrik ist die Trefferfläche, nicht nur das Zeichen daneben: ein 11-px-Wort
            mit einem 14-px-Pfeil rechts wäre zweimal zu klein. `flex-1`, damit der Knopf die Zeile
            trägt, wie die Rubrik es ohne ihn täte. */}
        <button
          type="button"
          onClick={() => setZu((v) => !v)}
          aria-expanded={!zu}
          aria-controls={inhaltId}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
        >
          {heading}
          {/* Neutral im geschlossenen Zustand, gedreht im offenen — dieselbe Richtung wie
              `ExpandToggle` und die sechs übrigen Klapp-Zeichen des Baums. Umgekehrt herum drehte
              sich als einziges Zeichen der App das GESCHLOSSENE. */}
          <ChevronRight
            size={14}
            aria-hidden
            className={`shrink-0 text-foreground-faint transition-transform ${zu ? "" : "rotate-90"}`}
          />
        </button>
        {action}
      </div>
      {/* `hidden` statt Ausbau, und zwar aus EINEM Grund: das Aufklappen hat dann nichts
          nachzuladen und verliert keinen Zustand (Seitenzahl einer Liste, offenes Detail).
          NICHT wegen Ankern — die sitzen am `<section>` darüber und bleiben ohnehin — und NICHT
          wegen der Browsersuche: die findet `display:none` nicht, dafür bräuchte es
          `hidden="until-found"` samt `onbeforematch`. Zuklappen spart also Bildschirmfläche, keine
          Arbeit; wer Ladezeit sparen will, blendet den Block aus. */}
      <div id={inhaltId} hidden={zu} className={bodyCls}>
        {children}
      </div>
    </section>
  );
}
