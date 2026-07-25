"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import Card from "@/app/components/Card";
import { wearActionHref } from "@/lib/categoryConstants";
import { CategoryIconTile } from "@/app/components/CategoryPhotoThumb";
import DashboardBlock from "@/app/components/DashboardBlock";
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm text-foreground-muted hover:text-foreground transition px-1 py-1"
        aria-expanded={open}
      >
        <span>{t("inactiveCategories", { count: categories.length })}</span>
        <ChevronDown
          size={16}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {categories.map((c) => {
            const beginHref = wearActionHref({ categoryId: c.id, active: false });
            return (
              <li key={c.id}>
                <Card>
                  <Link
                    href={beginHref}
                    className="flex items-center gap-3 p-3 active:bg-background-subtle transition opacity-80 hover:opacity-100"
                  >
                    <CategoryIconTile color={c.color} icon={c.icon} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      {c.todayHours > 0 && (
                        <p className="text-xs text-foreground-faint">
                          {tStats("day")} {formatHours(c.todayHours, dl)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-foreground-faint shrink-0 flex items-center gap-1">
                      <Plus size={12} />
                      {t("titleBegin")}
                    </span>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardBlock>
  );
}
