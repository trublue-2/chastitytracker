"use client";

import { useTranslations } from "next-intl";
import CategorySwitcherCard, { type CategoryVariant } from "./CategorySwitcherCard";

/** Eine fertig formatierte Geräte-Zeile — Dauern und Preise sind serverseitig lokalisiert,
 *  der Client setzt nur noch die Labels dazu. */
export type DeviceUsageRowView = {
  id: string | null;
  name: string;
  count: number;
  totalStr: string;
  avgStr: string;
  /** Bereits mit Währung formatiert; null = kein Kaufpreis hinterlegt. */
  costStr: string | null;
  /** Anteil an der Tragezeit dieser Kategorie, 0–100. */
  sharePct: number;
};

/** KG oder eine Geräte-Kategorie, mit ihren Geräte-Zeilen. */
export type DeviceUsageVariant = CategoryVariant & { rows: DeviceUsageRowView[] };

/** Device-Nutzung, umschaltbar zwischen KG und den Geräte-Kategorien — dieselbe Umschaltung wie
 *  im Tragekalender. */
export default function DeviceUsageSwitcher({ variants }: { variants: DeviceUsageVariant[] }) {
  const t = useTranslations("stats");

  return (
    <CategorySwitcherCard title={t("deviceUsage")} variants={variants}>
      {(active) => (
        <div className="divide-y divide-border-subtle">
          {active.rows.map((row) => (
            <div key={row.id ?? "_none"} className="px-6 py-4 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className={`text-sm font-semibold ${row.id ? "text-foreground" : "text-foreground-faint"}`}>
                  {row.name}
                </span>
                <span className="text-xs text-foreground-faint">
                  {t("deviceSessions", { count: row.count })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground-muted">
                <span>{t("deviceTotalDuration")}: <strong className="text-foreground">{row.totalStr}</strong></span>
                <span>{t("deviceAvgDuration")}: <strong className="text-foreground">{row.avgStr}</strong></span>
                {row.costStr && (
                  <span>{t("deviceCostPerHour")}: <strong className="text-foreground">{row.costStr}</strong></span>
                )}
              </div>
              <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden mt-0.5">
                <div className="h-full rounded-full bg-lock" style={{ width: `${row.sharePct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </CategorySwitcherCard>
  );
}
