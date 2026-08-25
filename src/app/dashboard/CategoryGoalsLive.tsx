"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import Card from "@/app/components/Card";
import GoalProgressRows from "@/app/components/GoalProgressRows";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import DashboardBlock from "@/app/components/DashboardBlock";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { CategoryWearGoal } from "@/lib/categoryGoals";
import type { ByPeriod, VorgabeTargets } from "@/lib/goalFulfillment";

export interface CategoryGoalRow extends CategoryWearGoal {
  /** True while a wear session for this category is running — its hours tick live. */
  active: boolean;
}

/** Das KG-Ziel als führende Zeile derselben „Trainingsvorgaben"-Karte. Bewusst OHNE Live-Tick und
 *  ohne Kategorie-Icon: es wird nur gezeigt, wenn KEINE Sperre läuft (dann steht es in der grünen
 *  Session-Karte, siehe LaufendeSessionCard) — offen wird gerade nicht getragen, die Stunden stehen.
 *  So sieht der Sub sein KG-Ziel auch im offenen Zustand statt nur während einer Sperre. */
export interface KgGoalRow {
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  goal: VorgabeTargets;
}

/** Client renderer for the per-category training goals. Mirrors the KG goal (LiveTrainingGoals):
 *  when a category has a running session, its today/week/month hours tick up live so the bar
 *  matches a fresh server/MCP computation instead of freezing at page-render time. */
export default function CategoryGoalsLive({ rows, kgGoal = null, serverNow, periodEndMs }: { rows: CategoryGoalRow[]; kgGoal?: KgGoalRow | null; serverNow: string; periodEndMs: ByPeriod<number> }) {
  const t = useTranslations("dashboard");
  return (
    <DashboardBlock>
      <Card>
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground-muted mb-3">
            {t("categoryGoals")}
          </h3>
          <ul className="flex flex-col gap-4">
            {kgGoal && <KgRow goal={kgGoal} serverNow={serverNow} periodEndMs={periodEndMs} />}
            {rows.map((r) => (
              <CategoryRow key={r.categoryId} row={r} serverNow={serverNow} periodEndMs={periodEndMs} />
            ))}
          </ul>
        </div>
      </Card>
    </DashboardBlock>
  );
}

/** Die KG-Zeile — gleiche Zeilen-/Balken-Optik wie eine Kategorie, aber mit Schloss-Icon (KG ist
 *  keine der Wear-Kategorien) und ohne Live-Tick (nur im offenen Zustand gezeigt). */
function KgRow({ goal, serverNow, periodEndMs }: { goal: KgGoalRow; serverNow: string; periodEndMs: ByPeriod<number> }) {
  const t = useTranslations("dashboard");
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="size-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--color-lock-bg)", color: "var(--color-lock)" }}
          aria-hidden
        >
          <Lock className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground truncate">{t("kgGoalLabel")}</p>
      </div>
      <div className="pl-9 flex flex-col gap-1">
        <GoalProgressRows
          periodEndMs={periodEndMs}
          serverNow={serverNow}
          actual={{ day: goal.tagH, week: goal.wocheH, month: goal.monatH, year: goal.jahrH }}
          targetH={goal.goal.targetH}
        />
      </div>
    </li>
  );
}

function CategoryRow({ row, serverNow, periodEndMs }: { row: CategoryGoalRow; serverNow: string; periodEndMs: ByPeriod<number> }) {
  const tagH = useLiveHours(row.tagH, serverNow, row.active);
  const wocheH = useLiveHours(row.wocheH, serverNow, row.active);
  const monatH = useLiveHours(row.monatH, serverNow, row.active);
  const jahrH = useLiveHours(row.jahrH, serverNow, row.active);
  const style = categoryStyle(row.color);

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div
          className="size-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: style.backgroundColor, color: style.color }}
          aria-hidden
        >
          <CategoryIconRender name={row.icon} className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground truncate">{row.name}</p>
      </div>
      <div className="pl-9 flex flex-col gap-1">
        <GoalProgressRows
          periodEndMs={periodEndMs}
          serverNow={serverNow}
          actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
          targetH={row.goal.targetH}
        />
      </div>
    </li>
  );
}

