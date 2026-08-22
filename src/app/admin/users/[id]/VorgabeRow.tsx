"use client";

import { useState } from "react";
import VorgabeForm, { type VorgabeInitialValues, type CategoryOption } from "./VorgabeForm";
import DeleteVorgabeButton from "./DeleteVorgabeButton";
import { useTranslations, useLocale } from "next-intl";
import { coveragePct } from "@/lib/percent";
import { HOURS_PER_DAY, HOURS_PER_WEEK, HOURS_PER_MONTH, HOURS_PER_YEAR } from "@/lib/constants";
import { formatDurationHours } from "@/lib/utils";


interface Props {
  userId: string;
  vorgabeId: string;
  active: boolean;
  dateLabel: string;
  tagH: number | null;
  wocheH: number | null;
  monatH: number | null;
  jahrH: number | null;
  notiz: string | null;
  initialValues: VorgabeInitialValues;
  categories?: CategoryOption[];
  categoryName?: string | null;
}

export default function VorgabeRow({ userId, vorgabeId, active, dateLabel, tagH, wocheH, monatH, jahrH, notiz, initialValues, categories, categoryName }: Props) {
  const t = useTranslations("admin");
  const td = useTranslations("dashboard");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="px-5 py-3">
        <VorgabeForm
          userId={userId}
          vorgabeId={vorgabeId}
          initialValues={initialValues}
          categories={categories}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className={`px-5 py-3 flex items-start justify-between gap-4 ${active ? "bg-[var(--color-request-bg)]/40" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {active && <span className="text-xs font-bold text-[var(--color-request-text)] bg-[var(--color-request-bg)] border border-[var(--color-request-border)] px-2 py-0.5 rounded-full">{t("vorgabeActive")}</span>}
          {categoryName && <span className="text-xs font-medium text-foreground-faint">[{categoryName}]</span>}
          <span className="text-sm font-semibold text-foreground-muted">{dateLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-1.5">
          {tagH != null && (
            <span className="text-xs text-foreground-muted">
              {td("day")}: <strong>{formatDurationHours(tagH, locale)}</strong>
              <span className="text-foreground-faint"> ({coveragePct(tagH, HOURS_PER_DAY)}%)</span>
            </span>
          )}
          {wocheH != null && (
            <span className="text-xs text-foreground-muted">
              {td("week")}: <strong>{formatDurationHours(wocheH, locale)}</strong>
              <span className="text-foreground-faint"> ({coveragePct(wocheH, HOURS_PER_WEEK)}%)</span>
            </span>
          )}
          {monatH != null && (
            <span className="text-xs text-foreground-muted">
              {td("month")}: <strong>{formatDurationHours(monatH, locale)}</strong>
              <span className="text-foreground-faint"> ({coveragePct(monatH, HOURS_PER_MONTH)}%)</span>
            </span>
          )}
          {jahrH != null && (
            <span className="text-xs text-foreground-muted">
              {td("year")}: <strong>{formatDurationHours(jahrH, locale)}</strong>
              <span className="text-foreground-faint"> ({coveragePct(jahrH, HOURS_PER_YEAR)}%)</span>
            </span>
          )}
        </div>
        {notiz && <p className="text-xs text-foreground-faint italic mt-0.5">{notiz}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--color-warn-text)] font-medium px-2.5 py-1 rounded-lg border border-[var(--color-warn-border)] bg-warn-bg hover:opacity-90 transition"
        >
          {t("vorgabeEdit")}
        </button>
        <DeleteVorgabeButton id={vorgabeId} />
      </div>
    </div>
  );
}
