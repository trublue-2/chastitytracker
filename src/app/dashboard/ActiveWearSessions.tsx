"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import Card from "@/app/components/Card";
import { formatElapsedMs } from "@/lib/utils";
import { CATEGORY_COLOR_HEX, type CategoryColor } from "@/lib/categoryConstants";
import CategoryIconRender from "@/app/components/CategoryIcon";

export interface ActiveWearSessionRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  deviceName: string;
  /** ISO string of session start. */
  since: string;
}

interface Props {
  sessions: ActiveWearSessionRow[];
  /** Server clock at render — used as the initial tick reference. */
  serverNow: string;
}

/** Renders one compact row per active wear-session (Plug, Collar, ...).
 *  Per UX Architect spec: stack of compact cards below the primary KG card.
 *  Hidden when feature flag is off or no sessions are active. */
export default function ActiveWearSessions({ sessions, serverNow }: Props) {
  const t = useTranslations("wearForm");
  const locale = useLocale();
  const [now, setNow] = useState<number>(() => Date.parse(serverNow));

  useEffect(() => {
    if (sessions.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessions.length]);

  if (sessions.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-2 pb-2">
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => {
          const hex = CATEGORY_COLOR_HEX[s.categoryColor as CategoryColor] ?? "#64748b";
          const elapsedMs = Math.max(0, now - Date.parse(s.since));
          const endHref = `/dashboard/new/wear-end?category=${s.categoryId}`;
          return (
            <li key={s.categoryId}>
              <Card>
                <Link
                  href={endHref}
                  className="flex items-center gap-3 p-3 active:bg-background-subtle transition"
                  style={{ borderLeft: `3px solid ${hex}` }}
                >
                  <div
                    className="shrink-0 size-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: hex + "22", color: hex }}
                    aria-hidden
                  >
                    <CategoryIconRender name={s.categoryIcon} className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.categoryName}
                    </p>
                    <p className="text-xs text-foreground-muted truncate">{s.deviceName}</p>
                  </div>
                  <span className="font-mono text-base font-semibold tabular-nums text-foreground shrink-0">
                    {formatElapsedMs(elapsedMs, locale, false)}
                  </span>
                  <span className="text-xs text-foreground-faint shrink-0 ml-1">
                    {t("endShort")}
                  </span>
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
