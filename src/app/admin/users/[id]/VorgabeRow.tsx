"use client";

import { useState } from "react";
import VorgabeForm, { VorgabeInitialValues } from "./VorgabeForm";
import DeleteVorgabeButton from "./DeleteVorgabeButton";
import { useTranslations, useLocale } from "next-intl";


interface Props {
  userId: string;
  vorgabeId: string;
  active: boolean;
  dateLabel: string;
  tagH: number | null;
  wocheH: number | null;
  monatH: number | null;
  notiz: string | null;
  initialValues: VorgabeInitialValues;
}

function formatHoursLocal(h: number, locale: string): string {
  const days = Math.floor(h / 24);
  const hours = Math.round(h % 24);
  const dayUnit = locale === "en" ? "d" : "T";
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}${dayUnit}`);
  if (hours > 0 || parts.length === 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

export default function VorgabeRow({ userId, vorgabeId, active, dateLabel, tagH, wocheH, monatH, notiz, initialValues }: Props) {
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
          <span className="text-sm font-semibold text-foreground-muted">{dateLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-1.5">
          {tagH != null && (
            <span className="text-xs text-foreground-muted">
              {td("day")}: <strong>{formatHoursLocal(tagH, locale)}</strong>
              <span className="text-foreground-faint"> ({Math.round((tagH / 24) * 100)}%)</span>
            </span>
          )}
          {wocheH != null && (
            <span className="text-xs text-foreground-muted">
              {td("week")}: <strong>{formatHoursLocal(wocheH, locale)}</strong>
              <span className="text-foreground-faint"> ({Math.round((wocheH / 168) * 100)}%)</span>
            </span>
          )}
          {monatH != null && (
            <span className="text-xs text-foreground-muted">
              {td("month")}: <strong>{formatHoursLocal(monatH, locale)}</strong>
              <span className="text-foreground-faint"> ({Math.round((monatH / 730) * 100)}%)</span>
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
