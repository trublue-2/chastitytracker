import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DashboardBlock from "@/app/components/DashboardBlock";
import PenaltyList from "@/app/components/PenaltyList";
import EmptyState from "@/app/components/EmptyState";
import { APP_TZ } from "@/lib/utils";
import { HISTORY_LIMIT } from "@/lib/taskIntervals";
import { loadSubPenalties, type SubPenalty } from "@/lib/openPenalties";


/** Wie viele erledigte Strafen der Verlauf zeigt. IMPORTIERT statt wiederholt: der Kommentar sagte
 *  „derselbe Deckel wie bei der Aufgaben-Historie", aber nichts erzwang das — die eine Zahl konnte
 *  wandern und die andere stehenbleiben. */
const DONE_LIMIT = HISTORY_LIMIT;

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

  // Dasselbe Tor wie im Dashboard-Block: gibt es kein einziges Urteil, braucht die Leer-Ansicht
  // kein Strafbuch (~20 Abfragen). Eine indizierte Zählzeile beantwortet das.
  const [judged, t] = await Promise.all([
    prisma.strafeRecord.count({ where: { userId, status: "PUNISHED" } }),
    getTranslations("penalties"),
  ]);
  const { open, done } = judged > 0 ? await loadSubPenalties(userId) : { open: [], done: [] };
  // Die Zeitzone des Trägers — es sind seine Strafen, und diese Seite ist seine.
  const tz = session.user.timezone ?? APP_TZ;

  const section = (titleKey: string, penalties: SubPenalty[]) =>
    penalties.length > 0 && (
      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground-faint mb-2">{t(titleKey)}</h2>
        <PenaltyList penalties={penalties} tz={tz} />
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
