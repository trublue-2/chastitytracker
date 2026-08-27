import { useTranslations } from "next-intl";
import { SkeletonBar } from "@/app/components/Skeleton";
import DashboardBlock from "@/app/components/DashboardBlock";
import Section from "@/app/components/Section";
import { blockStackCls, listRowCls } from "@/app/components/inputStyles";

/**
 * Der Platzhalter der Träger-Übersicht.
 *
 * **Er verspricht bewusst KEINE bestimmte Form mehr.** Er tat es: er begann mit einem zentrierten
 * Helden (leises Wort, grosse Zahl, leise Zeile) und danach mit festen Rubriken. Diese Übersicht ist
 * seit „Dashboard anpassen" aber ein Stapel, dessen Reihenfolge und Bestand JEDER Nutzer selbst
 * bestimmt (`layout`, `SUB_DASHBOARD_BLOCK_TABLE`). Wer den Helden ausblendet oder nach unten
 * schiebt, sah beim Laden trotzdem einen — und beim Austausch sprang der halbe Bildschirm.
 *
 * Nachziehen lässt sich das nicht: `loading.tsx` darf nicht `async` sein (sonst ist der Ladezustand
 * selbst verzögert) und kommt damit nicht an die gespeicherte Konfiguration. Ein festes Skelett kann
 * also prinzipiell nicht zu allen Fassungen passen — und ein Skelett, das etwas anderes verspricht
 * als die Seite, ist keine Vorschau, sondern eine Falschauskunft.
 *
 * Was bleibt, ist die einzige Aussage, die in JEDER Fassung stimmt: „hier kommen gleich so viele
 * Abschnitte, wie diese Fläche kennt".
 */
export default function DashboardLoading() {
  // `useTranslations` statt `getTranslations`: der Hook läuft auch in einer Server-Komponente,
  // solange sie nicht `async` ist — und diese ist es nicht. `getTranslations` erzwänge ein `await`
  // und damit ein `async`-Skelett, also genau die Verzögerung, die ein Ladezustand nicht haben darf.
  const t = useTranslations("common");

  return (
    // Gleiches Gerüst wie die echte Seite (`dashboard/page.tsx`): `py-6` aussen, `blockStackCls`
    // zwischen den Blöcken — sonst springt das Layout im Moment des Austauschs. Genau das ist
    // passiert, als der Blockabstand wuchs und diese Zeile auf `gap-4` stehen blieb: der Kommentar
    // beschrieb die Regel, der Code brach sie. Deshalb jetzt die geteilte Konstante statt einer
    // abgeschriebenen Zahl — eine Zahl, die zweimal stimmen muss, stimmt irgendwann einmal nicht.
    // Der Name der Ladezone stand fest auf Deutsch — der einzige Text, den ein Screenreader hier
    // überhaupt bekommt, weil alle Balken `aria-hidden` sind.
    <div className={`${blockStackCls} py-6`} role="status" aria-label={t("loading")}>
      <DashboardBlock className="flex flex-col gap-4">
        {/* Vier Abschnitte, und die Zahl kommt bewusst NICHT aus der Registry: die Fläche kennt
            fünfzehn Blöcke, ein Nutzer blendet davon eine Handvoll ein. Ein Skelett nach der
            Obergrenze wäre dreimal so hoch wie die Seite, die es ankündigt. Vier füllt den ersten
            Bildschirm — was darunter läge, sieht in einem Ladezustand ohnehin niemand.
            Wechselnde Zeilenzahlen, damit das Feld nicht wie eine Tabelle aussieht. */}
        {[0, 1, 2, 3].map((i) => (
          <Section key={i} title={<SkeletonBar width="88px" height="11px" />}>
            <div className="divide-y divide-border-subtle">
              {Array.from({ length: 2 + (i % 3) }).map((_, j) => (
                <div key={j} className={listRowCls}>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <SkeletonBar width="45%" height="14px" />
                    <SkeletonBar width="60%" height="12px" />
                  </div>
                  <SkeletonBar width="56px" height="12px" />
                </div>
              ))}
            </div>
          </Section>
        ))}
      </DashboardBlock>
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
