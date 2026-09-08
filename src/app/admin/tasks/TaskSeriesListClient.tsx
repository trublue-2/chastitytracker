"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Repeat } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDateLocale } from "@/lib/utils";
import { buildWeekdayLabels } from "@/lib/statsBuilders";
import { isoDaysOfMask } from "@/lib/weekdays";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import Button from "@/app/components/Button";
import Card from "@/app/components/Card";
import FormError from "@/app/components/FormError";
import { FREQ_LABEL_KEY, FREQ_UNIT_KEY, occurrenceFormatter } from "@/lib/recurrenceForm";

export interface TaskSeriesUi {
  id: string;
  title: string;
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdayMask: number | null;
  ordinal: number | null;
  timeOfDay: string;
  requirementCount: number;
  upcoming: string[];
}

export default function TaskSeriesListClient({ userId, series, tz }: {
  userId: string;
  series: TaskSeriesUi[];
  tz: string;
}) {
  const t = useTranslations("taskSeries");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekdayLabels = useMemo(() => buildWeekdayLabels(toDateLocale(locale)), [locale]);
  const fmt = useMemo(() => occurrenceFormatter(locale, tz), [locale, tz]);

  function cadence(s: TaskSeriesUi): string {
    const every = s.interval > 1 ? t("cadenceEvery", { n: s.interval, unit: t(FREQ_UNIT_KEY[s.freq], { n: s.interval }) }) : t(FREQ_LABEL_KEY[s.freq]);
    const days = s.freq !== "DAILY" && s.weekdayMask ? " · " + isoDaysOfMask(s.weekdayMask).map((d) => weekdayLabels[d - 1]).join(", ") : "";
    return `${every}${days} · ${s.timeOfDay}`;
  }

  async function withdraw(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/task-series/${id}?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else setError(apiError(await parseApiErrorCode(res)));
    } catch {
      setError(apiError(undefined));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {series.map((s) => (
        <Card key={s.id} variant="semantic" className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Repeat size={16} className="text-foreground-muted shrink-0" />
              <span className="font-semibold truncate">{s.title}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/admin/users/${userId}/aktionen/aufgabe?editSeries=${s.id}`}>
                <Button variant="ghost">{t("edit")}</Button>
              </Link>
              <Button variant="ghost" onClick={() => withdraw(s.id)} loading={busyId === s.id}>
                {t("withdraw")}
              </Button>
            </div>
          </div>
          <p className="text-sm text-foreground-muted">{cadence(s)}</p>
          {s.upcoming.length > 0 && (
            <p className="text-xs text-foreground-faint">
              {t("nextLabel")}: {s.upcoming.slice(0, 3).map((iso) => fmt.format(new Date(iso))).join(" · ")}
            </p>
          )}
        </Card>
      ))}
      <FormError message={error} variant="compact" />
    </div>
  );
}
