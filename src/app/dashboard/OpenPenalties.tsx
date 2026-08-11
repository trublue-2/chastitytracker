import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DashboardBlock from "@/app/components/DashboardBlock";
import OffenseList from "@/app/components/OffenseList";
import { prisma } from "@/lib/prisma";
import { loadSubOffenses, openPenaltiesOf } from "@/lib/subOffenses";

/** Wie viele Strafen im Dashboard ausliegen, bevor auf die Seite verwiesen wird. Kein Aufklapper wie
 *  beim Aufgaben-Stapel: „Alle ansehen" führt hier auf eine Seite, die es ohnehin gibt. */
const DASHBOARD_LIMIT = 3;

/**
 * Der Strafen-Block des Sub-Dashboards — UNTER dem Aufgaben-Block.
 *
 * Zeigt NUR die offenen Strafen, nicht das ganze Strafbuch: die Übersicht beantwortet „was steht
 * an?", nicht „was ist alles vorgefallen?". Erkannte, noch unbeurteilte Vergehen stehen auf der
 * Strafbuch-Seite — als Mängelliste auf dem Dashboard wären sie eine Dauerbeschallung.
 *
 * Begründung der Platzierung: eine Aufgabe mit Frist tickt, eine offene Strafe ist ein Zustand. Sie
 * gehört deshalb weder über die Fristen-Banner noch zwischen sie.
 *
 * Wie `OpenTasks` rendert der Block `null`, wenn nichts offen ist — ein leerer Rahmen „Keine
 * Strafen" wäre eine Zeile, die nie etwas mitteilt.
 */
export default async function OpenPenalties({
  userId,
  tz,
  now,
  dashboardTaskIds,
}: {
  userId: string;
  tz: string;
  /** Die Uhr der Seite — alle Ableitungen des Dashboards teilen sie sich. */
  now: Date;
  /** Die Aufgaben, die auf DIESEM Dashboard gerade stehen. Siehe unten. */
  dashboardTaskIds: Set<string>;
}) {
  // Die Frage „hat dieser Sub überhaupt eine offene Strafe?" beantwortet EINE indizierte Zeile
  // (`StrafeRecord` hat `@@index([userId])`). Erst danach lohnt das Strafbuch, das ~20 Abfragen und
  // eine vollständige Aufgaben-Auswertung kostet. Ohne dieses Tor zahlte jeder Dashboard-Aufruf
  // diesen Preis — auch für die Mehrheit, die nie eine Strafe hat und für die der Block `null` ist.
  // `OR` statt `NOT: { taskId: { in: … } }`: SQL-`NOT IN` liefert für `taskId IS NULL` „unknown"
  // und verlöre damit ausgerechnet die Freitext-Strafen.
  const openCount = await prisma.strafeRecord.count({
    where: {
      userId, status: "PUNISHED", erledigtAt: null,
      OR: [{ taskId: null }, { taskId: { notIn: [...dashboardTaskIds] } }],
    },
  });
  if (openCount === 0) return null;

  const open = openPenaltiesOf(await loadSubOffenses(userId, now));

  // DOPPELUNG MIT DEM AUFGABEN-BLOCK: Ist die Strafe eine AUFGABE, die gerade darüber steht, dann
  // steht dort bereits alles — Titel (= der Straftext, siehe `punishWithTask`), Frist, Bedingungen,
  // Nachweise, dazu das Strafen-Badge der `TaskCard`. Eine Karte hier wäre dieselbe Sache ein paar
  // Pixel tiefer.
  //
  // Die Bedingung ist deshalb die tatsächliche Sichtbarkeit, nicht „ist eine Aufgabe": eine
  // versäumte oder abgebrochene Strafaufgabe verlässt den Aufgaben-Block (`belongsOnDashboard`),
  // während ihre Strafe offen bleibt — genau dann muss sie hier erscheinen, sonst fällt sie stumm
  // aus der Sicht des Trägers.
  const rows = open
    .filter((p) => !(p.taskId && dashboardTaskIds.has(p.taskId)))
    .slice(0, DASHBOARD_LIMIT);
  if (rows.length === 0) return null;

  const t = await getTranslations("penalties");

  return (
    <DashboardBlock>
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Derselbe Titel wie der erste Abschnitt der Strafbuch-Seite — es ist dieselbe Menge, und
            zwei Namen dafür wären zwei Begriffe für eine Sache. */}
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("openTitle")}</p>
        <Link
          href="/dashboard/strafen"
          className="text-xs text-foreground-faint hover:text-foreground-muted transition-colors shrink-0"
        >
          {t("viewAll")} →
        </Link>
      </div>

      <OffenseList offenses={rows} tz={tz} />
    </DashboardBlock>
  );
}
