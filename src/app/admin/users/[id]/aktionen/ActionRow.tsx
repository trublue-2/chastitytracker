import Link from "next/link";
import { ChevronRight } from "lucide-react";
import Badge from "@/app/components/Badge";
import { listRowCls } from "@/app/components/inputStyles";

/**
 * Eine Zeile der Aktions-Liste: Zeichen, Titel, was die Zeile erfasst — und, falls die Aktion
 * gerade nicht geht, der Grund als leise Marke am Zeilenende.
 *
 * Extrahiert, weil derselbe Block in `aktionen/page.tsx` elfmal stand — je Aktion einmal aktiv und
 * einmal deaktiviert. Jede neue Aktion hätte zwei weitere Kopien bedeutet, und ein Stil-Fix hätte
 * alle Kopien einzeln treffen müssen.
 *
 * ## Warum `description` und `lockedReason` zwei Props sind
 *
 * Vorher trug EIN `hint` beides: unter „Sperrzeit setzen" stand die Beschreibung „Sperrzeit
 * festlegen", unter „Verschluss anfordern" der Sperrgrund „Bereits verschlossen". Das sind Aussagen
 * über verschiedene Dinge — was die Zeile TUT gegen warum sie gerade nicht geht —, und sie standen
 * am selben Platz, in derselben Schrift. Wer den Schirm überfliegt, kann sie nicht auseinander
 * halten; und weil der Prop nur EINEN Text nahm, musste jeder Aufrufer die Fallunterscheidung
 * selbst hineinrechnen (`isLocked ? t("alreadyLocked") : t("entryVerschlussDesc")`) — die
 * Beschreibung verschwand also genau dann, wenn sie am meisten hilft. Jetzt sagt der Prop-Name,
 * was gemeint ist, die Beschreibung bleibt in beiden Zuständen stehen, und der Grund sitzt als
 * Marke rechts, wo er als Zustand und nicht als Erklärung gelesen wird.
 *
 * ## Warum die Beschreibung UMBRICHT statt abzuschneiden
 *
 * Bei 390 px endete sie vorher mitten im Wort („Ein Vergehen von Hand ins Strafbuch ei…"), und ein
 * Erklärsatz, den man nie zu Ende lesen kann, ist schlechter als gar keiner. Der zweite Weg wäre,
 * jeden Text auf vier bis fünf Wörter zu binden — die Texte sind jetzt zwar auch kürzer, aber als
 * GARANTIE taugt das nicht: über die Länge entscheidet die Übersetzung, nicht das Layout
 * („Add an e-mail address" gegen „E-Mail hinterlegen"), und die nächste Sprache kennt die Regel
 * wieder nicht. Ein Umbruch hält jede Länge aus; eine Wortzahl-Regel hält bis zum ersten Text, der
 * sie nicht kennt. Die Kürzung ist Politur, der Umbruch ist die Zusage.
 *
 * ## Warum weder Kachel noch Kasten
 *
 * Die Zeilen trugen getönte Icon-Kacheln und sassen in einem gerahmten Block. Elf Farbflächen
 * untereinander sind elf Signale für eine Liste, in der nichts dringend ist — Farbe heisst in
 * diesem System „das will jetzt etwas von dir" (Herleitung in `EntryRow`). Übrig bleibt das Zeichen
 * in Grau. Die einzige Farbe, die bleibt, ist die der Kategorie: sie sagt WELCHE, nicht ob — sie
 * kommt deshalb fertig eingefärbt als `icon` herein und nicht mehr über einen `iconStyle`-Prop.
 * Den Rahmen ersetzt `Section` in der Seite: eine leise Rubrik plus Abstand, kein Kasten.
 */
export default function ActionRow({
  href,
  icon,
  title,
  description,
  lockedReason,
}: {
  /** Fehlt der Link, ist die Zeile deaktiviert — `lockedReason` sagt dann, warum. */
  href?: string;
  icon: React.ReactNode;
  title: string;
  /** Was die Zeile tut, als Handlung formuliert. Steht in BEIDEN Zuständen. */
  description: string;
  /** Nur für deaktivierte Zeilen: der Zustand, der die Aktion blockiert. Kurz halten — die Marke
   *  bricht nicht um und nimmt der Beschreibung sonst die Breite weg. */
  lockedReason?: string;
}) {
  const glyph = <span className="shrink-0 text-foreground-faint">{icon}</span>;

  if (!href) {
    return (
      // Gedämpft UND ohne Zeiger: die gesperrte Zeile unterschied sich von einer lebenden nur durch
      // eine etwas hellere Überschrift und das fehlende Chevron. Sie sah antippbar aus und tat dann
      // nichts — die Marke rechts erklärt es zwar, aber erst, nachdem man schon getippt hat.
      <div className={`${listRowCls} opacity-60 cursor-not-allowed`} aria-disabled="true">
        {glyph}
        <div className="flex-1 min-w-0">
          <p className="text-fliess font-semibold text-foreground-muted">{title}</p>
          <p className="text-neben text-foreground-faint">{description}</p>
        </div>
        {lockedReason && <Badge size="sm" label={lockedReason} className="shrink-0" />}
      </div>
    );
  }

  return (
    <Link
      href={href}
      // Bewusst NICHT `listRowButtonCls`: das trägt eigene Innenabstände (`-mx-2 px-2 -my-1 py-1`)
      // und stünde damit auf anderer Geometrie als die gesperrte Zeile darüber, die `listRowCls`
      // nimmt. Zwei Zeilen derselben Liste, verschieden hoch und verschieden eingerückt, je nachdem
      // ob sie klickbar sind — genau die Sorte Unruhe, die diese Liste gerade losgeworden ist.
      className={`${listRowCls} rounded-lg transition hover:bg-surface-raised/60 active:scale-[0.99]`}
    >
      {glyph}
      <div className="flex-1 min-w-0">
        <p className="text-fliess font-semibold text-foreground">{title}</p>
        <p className="text-neben text-foreground-faint">{description}</p>
      </div>
      <ChevronRight size={16} className="text-foreground-faint shrink-0" />
    </Link>
  );
}
