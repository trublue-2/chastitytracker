import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import DashboardBlock from "@/app/components/DashboardBlock";
import OffenseList from "@/app/components/OffenseList";
import EmptyState from "@/app/components/EmptyState";
import { APP_TZ } from "@/lib/utils";
import { HISTORY_LIMIT } from "@/lib/taskIntervals";
import { loadSubOffenses, type SubOffense, type SubOffenseState } from "@/lib/subOffenses";

/**
 * Die Abschnitte der Seite, in dieser Reihenfolge — was ihn FORDERT zuerst.
 *
 * `open` (erkannt, noch nicht beurteilt) steht bewusst NICHT zuoberst: eine offene Strafe ist eine
 * Tatsache, ein unbeurteiltes Vergehen erst eine Feststellung.
 *
 * ERLEDIGTE Strafen fehlen hier absichtlich: eine abgeschlossene Strafe fordert nichts mehr und
 * gehört nicht in eine Liste, die sagt, woran man ist. Sie sind damit für den Träger weg — die
 * Keyholderin sieht sie weiterhin im Admin-Strafbuch.
 *
 * FALLENGELASSENE bleiben dagegen stehen, und das ist kein Widerspruch: Sie sind die einzige
 * Auflösung, die er sonst nirgends sieht. Verschwände die Zeile, könnte er „sie hat es
 * fallengelassen" nicht von „die Ableitung hat sich geändert" unterscheiden — genau der Grund,
 * warum diese Seite überhaupt vollständig ist.
 */
const SECTIONS: { state: SubOffenseState; titleKey: string; limit?: number }[] = [
  { state: "punished", titleKey: "openTitle" },
  { state: "open", titleKey: "detectedTitle" },
  { state: "dismissed", titleKey: "dismissedTitle", limit: HISTORY_LIMIT },
];

/**
 * Das Strafbuch des KG-Trägers (Issue #36).
 *
 * VOLLSTÄNDIG und ohne Zutun der Keyholderin: erkannte Vergehen erscheinen hier, sobald das System
 * sie ableitet. Deshalb heisst die Seite auch „Strafbuch" und nicht mehr „Strafen" — sie zeigt
 * dasselbe wie die Keyholder-Sicht, nur ohne Knöpfe. Warum das die Zusage „sie kann still abwinken"
 * aufgibt und warum das ganz oder gar nicht geht, steht im Kopf von `subOffenses.ts`.
 *
 * SICHERHEIT: die Daten kommen ausschliesslich aus der SESSION, nie aus einem Pfad- oder
 * Query-Parameter — dieselbe Regel wie auf `/dashboard/messages` und dem Dashboard selbst. Eine
 * fremde Sicht gibt es unter `/admin/users/[id]/strafbuch`, hinter `assertKeyholderOrAdmin`.
 */
export default async function StrafbuchPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  // Kein Zähl-Tor mehr davor wie bei der reinen Strafen-Sicht: unbeurteilte Vergehen stehen in
  // keiner Tabelle, die sich billig zählen liesse — sie ENTSTEHEN erst beim Ableiten.
  const [offenses, t] = await Promise.all([loadSubOffenses(userId), getTranslations("penalties")]);
  // Die Zeitzone des Trägers — es ist sein Buch, und diese Seite ist seine.
  const tz = session.user.timezone ?? APP_TZ;

  const byState = (state: SubOffenseState) => offenses.filter((o) => o.state === state);
  // „Nichts im Strafbuch" muss sich auf das beziehen, was die Seite ZEIGT — sonst stünde bei einem
  // Träger mit ausschliesslich erledigten Strafen ein Leer-Zustand über einer Seite, die tatsächlich
  // etwas kennt, es nur nicht zeigt.
  const visible = SECTIONS.flatMap(({ state }) => byState(state));

  return (
    <DashboardBlock>
      <h1 className="text-lg font-semibold text-foreground mb-1">{t("title")}</h1>
      {/* Zwei Sätze, die zusammen die Seite erklären: was sie zeigt, und dass sie sich ändern kann,
          ohne dass jemand etwas getan hat. Ohne den zweiten liest sich eine neu erschienene Zeile
          als Willkür der Keyholderin — tatsächlich leitet die App sie aus den Einträgen ab. */}
      <p className="text-xs text-foreground-faint">{t("intro")}</p>
      <p className="text-xs text-foreground-faint mt-1">{t("derivedNote")}</p>

      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Gavel size={40} strokeWidth={1.5} />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        SECTIONS.map(({ state, titleKey, limit }) => {
          const rows: SubOffense[] = byState(state);
          if (rows.length === 0) return null;
          return (
            <section key={state} className="mt-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-2">
                {t(titleKey)}
              </h2>
              <OffenseList offenses={limit ? rows.slice(0, limit) : rows} tz={tz} />
            </section>
          );
        })
      )}
    </DashboardBlock>
  );
}
