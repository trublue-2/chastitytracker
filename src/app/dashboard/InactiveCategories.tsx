"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Plus } from "lucide-react";
import { wearActionHref } from "@/lib/categoryConstants";
import CategoryLinkRow from "@/app/components/CategoryLinkRow";
import DashboardBlock from "@/app/components/DashboardBlock";
import ExpandToggle from "@/app/components/ExpandToggle";
import { formatHours, toDateLocale } from "@/lib/utils";

export interface InactiveCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** Hours worn today in this category (already 0 if no sessions). */
  todayHours: number;
}

interface Props {
  /** Categories the user defined that currently have no active wear session. */
  categories: InactiveCategoryRow[];
}

/** Mockup #4: collapsible "Inaktive Kategorien (N) ▾" section below active sessions.
 *  Tap to expand → one row per inactive category with quick-start link. */
export default function InactiveCategories({ categories }: Props) {
  const t = useTranslations("wearForm");
  const tStats = useTranslations("stats");
  const dl = toDateLocale(useLocale());
  const [open, setOpen] = useState(false);

  if (categories.length === 0) return null;

  return (
    <DashboardBlock>
      <ExpandToggle
        label={t("inactiveCategories", { count: categories.length })}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {categories.map((c) => {
            const beginHref = wearActionHref({ categoryId: c.id, active: false });
            return (
              <li key={c.id}>
                <CategoryLinkRow
                  href={beginHref}
                  color={c.color}
                  icon={c.icon}
                  name={c.name}
                  subtitle={c.todayHours > 0 ? `${tStats("day")} ${formatHours(c.todayHours, dl)}` : undefined}
                  actionIcon={<Plus size={12} />}
                  actionLabel={t("titleBegin")}
                />
              </li>
            );
          })}
        </ul>
      )}
    </DashboardBlock>
  );
}
