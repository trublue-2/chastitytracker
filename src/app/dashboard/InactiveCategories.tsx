"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Plus } from "lucide-react";
import Card from "@/app/components/Card";
import { categoryStyle } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";

export interface InactiveCategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface Props {
  /** Categories the user defined that currently have no active wear session. */
  categories: InactiveCategoryRow[];
}

/** Mockup #4: collapsible "Inaktive Kategorien (N) ▾" section below active sessions.
 *  Tap to expand → one row per inactive category with quick-start link. */
export default function InactiveCategories({ categories }: Props) {
  const t = useTranslations("wearForm");
  const [open, setOpen] = useState(false);

  if (categories.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-2">
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
            const style = categoryStyle(c.color);
            const beginHref = `/dashboard/new/wear-begin?category=${c.id}`;
            return (
              <li key={c.id}>
                <Card>
                  <Link
                    href={beginHref}
                    className="flex items-center gap-3 p-3 active:bg-background-subtle transition opacity-80 hover:opacity-100"
                  >
                    <div
                      className="shrink-0 size-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: style.backgroundColor, color: style.color }}
                      aria-hidden
                    >
                      <CategoryIconRender name={c.icon} className="size-4" />
                    </div>
                    <span className="text-sm font-medium text-foreground truncate flex-1">
                      {c.name}
                    </span>
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
    </div>
  );
}
