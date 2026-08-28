"use client";

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import Section from "@/app/components/Section";
import GoalProgressRows from "@/app/components/GoalProgressRows";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";
import DashboardBlock from "@/app/components/DashboardBlock";
import { useLiveHours } from "@/app/hooks/useLiveHours";
import type { CategoryWearGoal } from "@/lib/categoryGoals";
import type { ByPeriod, VorgabeTargets } from "@/lib/goalFulfillment";
import { LockClosedIcon } from "@/app/components/lockIcons";

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
export default function CategoryGoalsLive({ rows, kgGoal = null, kgName, serverNow, periodEndMs, defaultCollapsed }: { rows: CategoryGoalRow[]; kgGoal?: KgGoalRow | null; kgName: string; serverNow: string; periodEndMs: ByPeriod<number>; defaultCollapsed?: boolean }) {
  const t = useTranslations("dashboard");
  return (
    <DashboardBlock>
      <Section title={t("categoryGoals")} defaultCollapsed={defaultCollapsed}>
        <ul className="flex flex-col gap-4">
          {kgGoal && <KgRow goal={kgGoal} kgName={kgName} serverNow={serverNow} periodEndMs={periodEndMs} />}
          {rows.map((r) => (
            <CategoryRow key={r.categoryId} row={r} serverNow={serverNow} periodEndMs={periodEndMs} />
          ))}
        </ul>
      </Section>
    </DashboardBlock>
  );
}

/**
 * Eine Ziel-Gruppe: Zeichen und Name, darunter die Zielzeilen.
 *
 * Herausgezogen, weil KG-Zeile und Kategorie-Zeile nach dem Wegfall der getönten Kachel bis auf
 * Zeichen, Name und Ist-Werte identisch waren. Was sie NICHT teilen können, ist das Beschaffen der
 * Werte: `useLiveHours` ist ein Hook und darf nicht bedingt laufen — deshalb bleibt `CategoryRow`
 * als dünner Aufrufer stehen und diese Zeile ist rein darstellend.
 *
 * Der Einzug der Zielzeilen kommt aus DEMSELBEN Raster wie der Kopf, statt als nachgerechnetes
 * `pl-6` (Zeichenbreite plus Abstand). Ein Literal, das eine Ableitung ist, rutscht lautlos
 * daneben, sobald jemand die Zeichengrösse anfasst.
 */
function GoalRow({ icon, name, actual, targetH, serverNow, periodEndMs }: {
  icon: ReactNode;
  name: string;
  actual: ByPeriod<number>;
  targetH: KgGoalRow["goal"]["targetH"];
  serverNow: string;
  periodEndMs: ByPeriod<number>;
}) {
  return (
    <li className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2">
      {icon}
      <p className="text-fliess font-medium text-foreground truncate">{name}</p>
      <div className="col-start-2">
        <GoalProgressRows periodEndMs={periodEndMs} serverNow={serverNow} actual={actual} targetH={targetH} />
      </div>
    </li>
  );
}

/** Die KG-Zeile — dieselbe Gruppe wie eine Kategorie, aber mit Schloss-Zeichen (KG ist keine der
 *  Wear-Kategorien) und ohne Live-Tick (nur im offenen Zustand gezeigt).
 *
 *  Der NAME kommt als Prop vom Server. Vorher stand hier `t("kgGoalLabel")` — eine hart
 *  hinterlegte Beschriftung, unmittelbar neben Kategorien, die ihren Namen aus der Datenbank
 *  holen. Die beiden Kopien in de/en waren schon einmal auseinandergelaufen (EN sagte „CB",
 *  während die DB-Zeile „KG" hiess). Die Konstante direkt zu importieren geht nicht: dieses
 *  Modul ist `"use client"`, und `deviceCategories.ts` bringt Prisma mit. */
function KgRow({ goal, kgName, serverNow, periodEndMs }: { goal: KgGoalRow; kgName: string; serverNow: string; periodEndMs: ByPeriod<number> }) {
  return (
    <GoalRow
      icon={<LockClosedIcon className="size-4 shrink-0 text-lock" aria-hidden />}
      name={kgName}
      actual={{ day: goal.tagH, week: goal.wocheH, month: goal.monatH, year: goal.jahrH }}
      targetH={goal.goal.targetH}
      serverNow={serverNow}
      periodEndMs={periodEndMs}
    />
  );
}

function CategoryRow({ row, serverNow, periodEndMs }: { row: CategoryGoalRow; serverNow: string; periodEndMs: ByPeriod<number> }) {
  const tagH = useLiveHours(row.tagH, serverNow, row.active);
  const wocheH = useLiveHours(row.wocheH, serverNow, row.active);
  const monatH = useLiveHours(row.monatH, serverNow, row.active);
  const jahrH = useLiveHours(row.jahrH, serverNow, row.active);
  const style = categoryStyle(row.color);

  return (
    <GoalRow
      icon={<CategoryIconRender name={row.icon} className="size-4 shrink-0" style={{ color: style.color }} />}
      name={row.name}
      actual={{ day: tagH, week: wocheH, month: monatH, year: jahrH }}
      targetH={row.goal.targetH}
      serverNow={serverNow}
      periodEndMs={periodEndMs}
    />
  );
}

