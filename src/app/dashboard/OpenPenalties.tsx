import Link from "next/link";
import { Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import DashboardBlock from "@/app/components/DashboardBlock";
import PenaltyCard, { OffenseName } from "@/app/components/PenaltyCard";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import { toDateLocale } from "@/lib/utils";
import { loadSubPenalties, type SubPenalty } from "@/lib/openPenalties";

/** Wie viele Strafen je Darstellung ausliegen, bevor auf die Seite verwiesen wird — der Deckel gilt
 *  für BEIDE Listen, sonst wäre die eine gedeckelt und die andere wüchse monoton. Kein Aufklapper
 *  wie beim Aufgaben-Stapel: „Alle ansehen" führt hier auf eine Seite, die es ohnehin gibt. */
const DASHBOARD_LIMIT = 3;

/**
 * Der Strafen-Block des Sub-Dashboards — UNTER dem Aufgaben-Block.
 *
 * Begründung der Platzierung: eine Aufgabe mit Frist tickt, eine offene Strafe ist ein Zustand. Sie
 * gehört deshalb weder über die Fristen-Banner noch zwischen sie.
 *
 * Wie `OpenTasks` rendert der Block `null`, wenn nichts offen ist — ein leerer Rahmen „Keine
 * Strafen" wäre eine Zeile, die nie etwas mitteilt.
 */
export default async function OpenPenalties({ userId, tz }: { userId: string; tz: string }) {
  const { open } = await loadSubPenalties(userId);
  if (open.length === 0) return null;

  const [t, dl] = [await getTranslations("penalties"), toDateLocale(await getLocale())];

  // DOPPELUNG MIT DEM AUFGABEN-BLOCK: eine Strafe mit `taskId` steht dort bereits in voller Länge
  // (Titel, Frist, Bedingungen, Nachweise), und ihr Straftext IST dieser Titel (`punishWithTask`) —
  // eine zweite volle Karte wäre wortwörtlich dieselbe Zeile ein paar Pixel tiefer. Sie bekommt hier
  // deshalb nur eine Verweis-Zeile: sie belegt, dass die Strafe offen ist, und sagt, wo sie steht.
  // Bewusst nicht ganz weggelassen — eine versäumte oder abgebrochene Strafaufgabe verlässt den
  // Aufgaben-Block (`belongsOnDashboard`), während ihre Strafe offen bleibt; ohne diese Zeile fiele
  // sie stumm aus der Sicht des Trägers.
  const cards = open.filter((p) => p.taskId === null).slice(0, DASHBOARD_LIMIT);
  const taskPenalties = open.filter((p) => p.taskId !== null).slice(0, DASHBOARD_LIMIT);

  return (
    <DashboardBlock>
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Eigener Titel statt des „Offen" der Seite: dort steht er unter der Überschrift
            „Strafen", hier steht er für sich zwischen fremden Blöcken. */}
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("dashboardTitle")}</p>
        <Link
          href="/dashboard/strafen"
          className="text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors shrink-0"
        >
          {t("viewAll")}
        </Link>
      </div>

      <ul className="flex flex-col gap-2">
        {cards.map((p) => (
          <li key={p.refId}>
            <PenaltyCard penalty={p} dl={dl} tz={tz} />
          </li>
        ))}
        {taskPenalties.map((p) => (
          <li key={p.refId}>
            <TaskPenaltyRow penalty={p} />
          </li>
        ))}
      </ul>
    </DashboardBlock>
  );
}

/** Die Verweis-Zeile einer Strafe, die als Aufgabe gestellt wurde. Trägt Art und Hinweis, sonst
 *  nichts — alles Weitere steht an der Aufgabe. */
async function TaskPenaltyRow({ penalty }: { penalty: SubPenalty }) {
  const t = await getTranslations("penalties");

  return (
    <Card padding="none">
      <div className="flex items-center gap-3 p-3">
        <span className="shrink-0 size-8 rounded-lg flex items-center justify-center bg-surface-raised text-foreground-muted" aria-hidden>
          <Gavel className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm text-foreground truncate">
          <OffenseName type={penalty.offenseType} />
        </span>
        <Badge variant="neutral" size="sm" label={t("badgeTask")} className="shrink-0" />
      </div>
    </Card>
  );
}
