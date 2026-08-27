import Link from "next/link";

import type { ReactNode } from "react";
import { DEFAULT_WORLD } from "@/lib/theme";
import { LockClosedIcon } from "@/app/components/lockIcons";
import { quietLinkCls } from "@/app/components/inputStyles";

interface Props {
  /** Benennt den Bildschirm. Auf der Anmeldeseite ist das die Wortmarke selbst — dort gibt es
   *  keinen zweiten Titel, den sie überschreiben würde. */
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Der Weg weg von hier (vergessenes Passwort, zurück zur Anmeldung). Steht abgesetzt unter dem
   *  Inhalt, weil er keine Handlung dieses Formulars ist. */
  footer?: ReactNode;
}

/**
 * Die gemeinsame Hülle der drei Bildschirme vor der Anmeldung.
 *
 * Warum überhaupt eine Hülle: Anmelden, Passwort-vergessen und Passwort-neu-setzen bauten denselben
 * Aufbau dreimal nach und liefen dabei auseinander — drei Kartenradien, drei Kopf-Fassungen, drei
 * Rückwege in drei Grössen. Diese Seiten sind der erste Bildschirm nach einem Update; ein Bruch mit
 * dem Rest der App lässt sich hier nicht überblättern. Vorbild ist `AdminActionFormShell`: Zeichen
 * und Titel in der Serif, darunter der Inhalt. Nur zentriert statt linksbündig, weil auf leerem
 * Grund keine Kante existiert, an der sich etwas ausrichten könnte, und weil eine zentrierte
 * Anordnung Handy und Desktop ohne zwei Fassungen trägt.
 *
 * Und bewusst OHNE `Card`. Eine Karte gehört dorthin, wo eine Fläche eine Aussage macht — sie hebt
 * einen Abschnitt aus seiner Umgebung. Hier umschliesst sie ALLES, was auf dem Bildschirm steht,
 * trennt also nichts von nichts und sagt entsprechend nichts. Den Halt, den man ihr zuschrieb, geben
 * die Eingabefelder selbst: sie tragen ihre eigene Fläche. Damit fallen zugleich die drei
 * verschiedenen Radien und drei Schatten weg, die der Entwurf je Bildschirm auf eine einzige Stelle
 * begrenzt.
 */
export default function AuthScreen({ title, subtitle, children, footer }: Props) {
  return (
    /* `main`, weil das Wurzel-Layout keine Landmarke setzt — diese Seiten stehen ausserhalb des
       Dashboard-Layouts und hatten deshalb bisher gar keine. */
    <main
      data-theme={DEFAULT_WORLD}
      className="world-glow min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center gap-2.5 text-foreground">
            <LockClosedIcon size={22} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
            <h1 className="font-serif text-titel text-balance">{title}</h1>
          </div>
          {subtitle && <p className="text-fliess text-foreground-muted">{subtitle}</p>}
        </div>

        {children}

        {footer && <div className="flex justify-center">{footer}</div>}
      </div>
    </main>
  );
}

/** Der leise Weg von einem Anmelde-Bildschirm zum nächsten. Gleiche Stufe und gleiche Farbe wie der
 *  Zurück-Pfeil in `AdminActionFormShell`: ein Verweis ist kein Signal und trägt deshalb keine
 *  Bedeutungsfarbe. */
export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={quietLinkCls}>
      {children}
    </Link>
  );
}
