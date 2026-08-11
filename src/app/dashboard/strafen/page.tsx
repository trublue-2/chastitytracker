import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import DashboardBlock from "@/app/components/DashboardBlock";
import PenaltyCard from "@/app/components/PenaltyCard";
import EmptyState from "@/app/components/EmptyState";
import { APP_TZ } from "@/lib/utils";
import { loadSubPenalties, type SubPenalty } from "@/lib/openPenalties";


/** Wie viele erledigte Strafen der Verlauf zeigt — derselbe Deckel wie bei der Aufgaben-Historie. */
const DONE_LIMIT = 25;

/**
 * Die Strafen des KG-Trägers (Issue #36) — bisher erfuhr er ihren Stand nur über die Keyholderin.
 *
 * Heisst für ihn „Strafen" und nicht „Strafbuch": er sieht die gefällten Urteile, nicht das Buch, in
 * dem über Vergehen entschieden wird. Der Keyholder-Bereich behält „Strafbuch".
 *
 * SICHERHEIT: die Strafen kommen ausschliesslich aus der SESSION, nie aus einem Pfad- oder
 * Query-Parameter — dieselbe Regel wie auf `/dashboard/messages` und dem Dashboard selbst. Eine
 * fremde Sicht gibt es unter `/admin/users/[id]/strafbuch`, hinter `assertKeyholderOrAdmin`.
 */
export default async function PenaltiesPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const [{ open, done }, t] = await Promise.all([
    loadSubPenalties(userId),
    getTranslations("penalties"),
  ]);
  // Die Zeitzone des Trägers — es sind seine Strafen, und diese Seite ist seine.
  const tz = session.user.timezone ?? APP_TZ;

  const section = (titleKey: string, penalties: SubPenalty[]) =>
    penalties.length > 0 && (
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-2">{t(titleKey)}</h2>
        <ul className="flex flex-col gap-2">
          {penalties.map((p) => (
            <li key={p.refId}>
              <PenaltyCard penalty={p} tz={tz} />
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <DashboardBlock>
      <h1 className="text-lg font-semibold text-foreground mb-1">{t("title")}</h1>
      {/* Warum hier kein Knopf steht: die Strafe schliesst die Keyholderin ab, nicht der Träger. Ohne
          diesen Satz läse sich die Seite als Liste, an der etwas fehlt. */}
      <p className="text-xs text-foreground-faint">{t("intro")}</p>

      {open.length === 0 && done.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Gavel size={40} strokeWidth={1.5} />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <>
          {section("openTitle", open)}
          {/* Der Verlauf wächst monoton — gedeckelt wie die Aufgaben-Historie (`TaskList`), sonst
              rendert die Seite irgendwann jede je erledigte Strafe. */}
          {section("doneTitle", done.slice(0, DONE_LIMIT))}
        </>
      )}
    </DashboardBlock>
  );
}
