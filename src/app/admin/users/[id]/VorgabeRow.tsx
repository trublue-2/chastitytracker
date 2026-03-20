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
    <div className={`px-5 py-3 flex items-start justify-between gap-4 ${active ? "bg-indigo-50/40" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {active && <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">{t("vorgabeActive")}</span>}
          <span className="text-sm font-semibold text-gray-700">{dateLabel}</span>
        </div>
        <div className="flex flex-wrap gap-3 mt-1.5">
          {tagH != null && (
            <span className="text-xs text-gray-600">
              {td("day")}: <strong>{formatHoursLocal(tagH, locale)}</strong>
              <span className="text-gray-400"> ({Math.round((tagH / 24) * 100)}%)</span>
            </span>
          )}
          {wocheH != null && (
            <span className="text-xs text-gray-600">
              {td("week")}: <strong>{formatHoursLocal(wocheH, locale)}</strong>
              <span className="text-gray-400"> ({Math.round((wocheH / 168) * 100)}%)</span>
            </span>
          )}
          {monatH != null && (
            <span className="text-xs text-gray-600">
              {td("month")}: <strong>{formatHoursLocal(monatH, locale)}</strong>
              <span className="text-gray-400"> ({Math.round((monatH / 730) * 100)}%)</span>
            </span>
          )}
        </div>
        {notiz && <p className="text-xs text-gray-400 italic mt-0.5">{notiz}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-amber-600 font-medium px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition"
        >
          {t("vorgabeEdit")}
        </button>
        <DeleteVorgabeButton id={vorgabeId} />
      </div>
    </div>
  );
}
