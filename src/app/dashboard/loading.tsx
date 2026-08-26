import { useTranslations } from "next-intl";
import { SkeletonBar } from "@/app/components/Skeleton";
import DashboardBlock from "@/app/components/DashboardBlock";
import Section from "@/app/components/Section";
import { blockStackCls, listRowCls } from "@/app/components/inputStyles";

/**
 * Der Platzhalter der Träger-Übersicht.
 *
 * **Er muss dieselbe Form haben wie das, was danach kommt.** Er hatte sie nicht: er baute die alten
 * Karten mit Rahmen von Hand nach, und die `Card`-Änderung des Redesigns erreichte ihn nie. Beim
 * Laden erschien ein Gitter aus Kästen, das im Moment des Austauschs verschwand — ein Sprung, der
 * schlimmer ist als jeder der beiden Zustände für sich. Ein Skelett, das etwas anderes verspricht
 * als die Seite, ist keine Vorschau, sondern eine Falschauskunft.
 *
 * Deshalb nimmt es dieselben Bauteile wie die Seite — `Section` für die Rubriken, `listRowCls` für
 * die Zeilen — statt deren Geometrie abzuschreiben. Was hier von Hand stünde, liefe beim nächsten
 * Eingriff auseinander, und zwar unsichtbar: ein Skelett sieht sich niemand im Review an.
 *
 * Alle Blöcke liegen auf DERSELBEN linken Kante — dem Spalten-Rand von `DashboardBlock`. Der
 * Helden-Block trug bis eben noch das `px-5` seiner alten Karte und damit eine zweite Kante; das
 * ist in der echten Seite gefallen und hier mit.
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
        {/* Der Held: leises Wort, grosse Zahl, leise Zeile — zentriert, ohne Kasten. */}
        <div className="flex flex-col items-center gap-4 pt-8 pb-7">
          <SkeletonBar width="128px" height="14px" />
          <SkeletonBar width="72%" height="52px" />
          <SkeletonBar width="45%" height="12px" />
        </div>

        {/* Ziele: Beschriftung und Werte, darunter der Balken als Grundlinie. */}
        <Section title={<SkeletonBar width="80px" height="11px" />}>
          <div className="flex flex-col gap-3.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-baseline gap-3">
                  <SkeletonBar width="52px" height="14px" />
                  <SkeletonBar width="96px" height="12px" className="ml-auto" />
                  <SkeletonBar width="64px" height="12px" />
                </div>
                <SkeletonBar height="2px" rounded="rounded-full" className="w-full" />
              </div>
            ))}
          </div>
        </Section>

        {/* Die Ereignisse der laufenden Tragezeit. */}
        <Section title={<SkeletonBar width="110px" height="11px" />}>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="py-3 flex items-center gap-3">
                <SkeletonBar width="56px" height="56px" rounded="rounded-xl" className="flex-shrink-0" />
                <div className="flex flex-col gap-2 flex-1">
                  <SkeletonBar width="55%" height="12px" />
                  <SkeletonBar width="35%" height="14px" />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Statistik: drei Zahlen, keine Kacheln. */}
        <Section title={<SkeletonBar width="72px" height="11px" />}>
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <SkeletonBar width="80%" height="22px" />
                <SkeletonBar width="70%" height="12px" />
              </div>
            ))}
          </div>
        </Section>

        {/* Vergangene Tragezeiten. */}
        <Section title={<SkeletonBar width="96px" height="11px" />}>
          <div className="divide-y divide-border-subtle">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={listRowCls}>
                <div className="flex flex-col gap-1.5 flex-1">
                  <SkeletonBar width="40%" height="14px" />
                  <SkeletonBar width="55%" height="12px" />
                </div>
                <SkeletonBar width="64px" height="12px" />
              </div>
            ))}
          </div>
        </Section>
      </DashboardBlock>
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
