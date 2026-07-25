"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import Card from "@/app/components/Card";
import { formatElapsedMs } from "@/lib/utils";
import { categoryStyle, wearActionHref } from "@/lib/categoryConstants";
import CategoryPhotoThumb from "@/app/components/CategoryPhotoThumb";
import DashboardBlock from "@/app/components/DashboardBlock";

export interface ActiveWearSessionRow {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  deviceName: string;
  /** ISO string of session start. */
  since: string;
  /** Foto vom Trage-Beginn; ohne eines bleibt das Kategorie-Icon stehen. Nicht optional — sonst
   *  liesse ein dritter Aufrufer das Feld stillschweigend weg, siehe `ActiveWearSession`. */
  imageUrl: string | null;
}

interface Props {
  sessions: ActiveWearSessionRow[];
  /** Server clock at render — used as the initial tick reference. */
  serverNow: string;
  /** Keyholder-Sicht: die Karte gehört zu DIESEM Sub und muss auf die Admin-Route zeigen.
   *  Ohne das führte sie den Keyholder auf `/dashboard/…`, wo `proxy.ts` ihn nach `/admin`
   *  zurückwirft — die Karte war für ihn schlicht ein toter Link. Gleiche Unterscheidung wie
   *  `adminUserId` in `WearForm`. */
  adminUserId?: string;
}

/** Renders one compact row per active wear-session (Plug, Collar, ...).
 *  Per UX Architect spec: stack of compact cards below the primary KG card.
 *  Hidden when feature flag is off or no sessions are active. */
export default function ActiveWearSessions({ sessions, serverNow, adminUserId }: Props) {
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
    <DashboardBlock>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => {
          const style = categoryStyle(s.categoryColor);
          const elapsedMs = Math.max(0, now - Date.parse(s.since));
          const endHref = wearActionHref({ categoryId: s.categoryId, active: true, adminUserId });
          return (
            <li key={s.categoryId}>
              <Card>
                <Link
                  href={endHref}
                  className="flex items-center gap-3 p-3 active:bg-background-subtle transition border-l-[3px]"
                  style={{ borderLeftColor: style.borderColor }}
                >
                  {/* Das beim Einsetzen aufgenommene Foto steht dort, wo sonst das Kategorie-Symbol
                      sitzt — der Keyholder sieht auf der Übersicht, WAS getragen wird, statt nur
                      dass etwas getragen wird. Ohne `onClick`: die ganze Karte ist ein Link. */}
                  <CategoryPhotoThumb
                    imageUrl={s.imageUrl}
                    categoryColor={s.categoryColor}
                    categoryIcon={s.categoryIcon}
                  />
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
    </DashboardBlock>
  );
}
