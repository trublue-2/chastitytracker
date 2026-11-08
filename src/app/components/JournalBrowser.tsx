import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight, CalendarDays, List, NotebookPen } from "lucide-react";
import Button from "./Button";
import DayGroups from "./DayGroups";
import EmptyState from "./EmptyState";
import Input from "./Input";
import JournalEntryCard from "./JournalEntryCard";
import Select from "./Select";
import { iconActionCls, quietLinkCls } from "./inputStyles";
import { monthParam, toCardEntry, type JournalMonth } from "@/lib/journal/journal";
import type { JournalView } from "@/lib/journal/journalService";
import { buildWeekdayLabels } from "@/lib/stats/statsBuilders";
import { formatMonthYear, mondayIndexOfLocalDate, toDateLocale } from "@/lib/shared/utils";

/**
 * Lesen und Wiederfinden im Tagebuch — für den Sub (`own`) und für die Keyholderin (`keyholder`)
 * dieselbe Bedienung: Monat wählen, Kalender, Liste nach Tagen, „Ältere laden". Was die Keyholderin
 * NICHT bekommt, ist die Suche: Treffer, die sie nicht sieht, liessen sich über leere Antworten erraten.
 *
 * Alles hängt an der ADRESSE (`month`, `day`, `view`, `cursor`, `q`), nichts an Client-Zustand: der
 * Zurück-Knopf führt dorthin zurück, wo man war, und ein Monat lässt sich verlinken. Deshalb ist die
 * Monatswahl ein GET-Formular mit „Anzeigen" — eine Auswahl, die beim Ändern sofort navigiert, nähme
 * Tastatur-Nutzern den Fokus mitten im Blättern weg.
 */
export default async function JournalBrowser({ mode, basePath, tz, view }: {
  mode: "own" | "keyholder";
  basePath: string;
  tz: string;
  view: JournalView;
}) {
  const [t, tc, locale] = await Promise.all([getTranslations("journal"), getTranslations("common"), getLocale()]);
  const dl = toDateLocale(locale);
  const { state, page, calendarDays, firstYear } = view;
  const { shown, today } = state;

  const href = (p: Record<string, string | number | null | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const calendarParam = state.calendar ? "calendar" : null;
  const step = (delta: number): JournalMonth => {
    const d = new Date(Date.UTC(shown.year, shown.month0 + delta, 1));
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
  };
  const monthName = formatMonthYear(new Date(Date.UTC(shown.year, shown.month0, 1)), dl, "UTC");
  const monthFmt = new Intl.DateTimeFormat(dl, { month: "long", timeZone: "UTC" });
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: monthFmt.format(new Date(Date.UTC(2000, i, 1))),
  }));
  const yearOptions: { value: string; label: string }[] = [];
  // Vom gezeigten oder heutigen Jahr (je nachdem, was später liegt — „Nächster Monat" führt über den
  // Jahreswechsel) bis zum ältesten Eintrag: das gezeigte Jahr steht so immer in der Auswahl.
  for (let y = Math.max(today.year, shown.year); y >= Math.min(firstYear ?? today.year, shown.year); y--) {
    yearOptions.push({ value: String(y), label: String(y) });
  }

  const last = page.entries.at(-1);
  const moreHref = page.hasMore && last && !state.query
    ? href({ month: state.month && monthParam(state.month), day: state.day, view: calendarParam, cursor: last.id })
    : null;
  const stepCls = `${iconActionCls("neutral")} m-0`;

  return (
    <div className="flex flex-col gap-4">
      {/* Monatswahl */}
      <div className="flex flex-wrap items-center gap-2">
        {state.month && (
          <Link href={href({ month: monthParam(step(-1)), view: calendarParam })} aria-label={t("prevMonth")} className={stepCls}>
            <ChevronLeft size={18} />
          </Link>
        )}
        <form method="get" action={basePath} className="flex items-center gap-2">
          <Select name="m" aria-label={t("monthLabel")} defaultValue={String(shown.month0 + 1).padStart(2, "0")} options={monthOptions} />
          <Select name="y" aria-label={t("yearLabel")} defaultValue={String(shown.year)} options={yearOptions} />
          {calendarParam && <input type="hidden" name="view" value={calendarParam} />}
          <Button type="submit" variant="secondary" size="sm">{t("show")}</Button>
        </form>
        {state.month && (
          <Link href={href({ month: monthParam(step(1)), view: calendarParam })} aria-label={t("nextMonth")} className={stepCls}>
            <ChevronRight size={18} />
          </Link>
        )}
        <span className="flex-1" />
        <Link
          href={state.calendar ? href({ month: state.month && monthParam(state.month) }) : href({ month: monthParam(shown), view: "calendar" })}
          className={`${quietLinkCls} inline-flex items-center gap-1`}
        >
          {state.calendar ? <List size={15} /> : <CalendarDays size={15} />}
          {state.calendar ? t("viewList") : t("viewCalendar")}
        </Link>
      </div>

      {(state.month || state.query) && (
        <p className="text-neben text-foreground-muted">
          {state.query ? t("searchResults", { query: state.query }) : monthName}{" "}
          <Link href={basePath} className={quietLinkCls}>{t("backToToday")}</Link>
        </p>
      )}

      {mode === "own" && (
        <form method="get" action={basePath} role="search" className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Input name="q" type="search" aria-label={t("searchLabel")} placeholder={t("searchLabel")} defaultValue={state.query} />
          </div>
          <Button type="submit" variant="secondary" size="sm">{t("search")}</Button>
        </form>
      )}

      {state.calendar && (
        <JournalCalendar
          month={shown}
          days={calendarDays}
          selected={state.day}
          label={t("calendarLabel", { month: monthName })}
          dl={dl}
          dayHref={(day) => href({ month: monthParam(shown), view: "calendar", day })}
          dayLabel={(date) => t("calendarDayWithEntries", { date })}
        />
      )}

      {page.entries.length === 0 ? (
        state.query ? (
          <p className="text-fliess text-foreground-muted">{t("searchNone")}</p>
        ) : state.month ? (
          <p className="text-fliess text-foreground-muted">{t("emptyMonth")}</p>
        ) : mode === "own" ? (
          <EmptyState icon={<NotebookPen size={36} />} title={t("emptyTitle")} description={t("emptyText")} />
        ) : (
          <p className="text-fliess text-foreground-muted">{t("sharedEmpty")}</p>
        )
      ) : (
        <DayGroups
          locale={dl}
          tz={tz}
          today={tc("today")}
          yesterday={tc("yesterday")}
          rows={page.entries.map((e) => ({
            at: e.entryAt,
            node: <JournalEntryCard key={e.id} entry={toCardEntry(e)} tz={tz} mode={mode} />,
          }))}
        />
      )}

      {state.query && page.hasMore && <p className="text-neben text-foreground-muted">{t("searchMore")}</p>}
      {moreHref && <Link href={moreHref} className={`${quietLinkCls} self-center py-2`}>{t("olderEntries")}</Link>}
    </div>
  );
}

/**
 * Ein Monatskalender: Tage mit Einträgen sind Links mit vollem Datum als Namen, alle anderen Tage
 * bloss Text — nicht fokussierbar, weil es dort nichts zu tun gibt. Der Punkt unter der Zahl steht
 * zusätzlich zur Unterstreichung, damit der Unterschied nicht allein an der Farbe hängt.
 */
function JournalCalendar({ month, days, selected, label, dl, dayHref, dayLabel }: {
  month: JournalMonth;
  days: number[];
  selected: number | null;
  label: string;
  dl: string;
  dayHref: (day: number) => string;
  dayLabel: (date: string) => string;
}) {
  const daysInMonth = new Date(Date.UTC(month.year, month.month0 + 1, 0)).getUTCDate();
  const lead = mondayIndexOfLocalDate(month.year, month.month0, 1);
  const fullDate = new Intl.DateTimeFormat(dl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const has = new Set(days);

  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <table className="w-full table-fixed text-center" aria-label={label}>
      <thead>
        <tr>
          {buildWeekdayLabels(dl).map((wd) => (
            <th key={wd} scope="col" className="text-neben font-normal text-foreground-faint pb-1">{wd}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, w) => (
          <tr key={w}>
            {week.map((d, i) => (
              <td key={i} className="py-0.5">
                {d === null ? null : has.has(d) ? (
                  <Link
                    href={dayHref(d)}
                    aria-label={dayLabel(fullDate.format(new Date(Date.UTC(month.year, month.month0, d))))}
                    aria-current={selected === d ? "date" : undefined}
                    className={`inline-flex flex-col items-center justify-center min-w-10 min-h-10 rounded-lg text-fliess font-medium text-foreground underline underline-offset-4 hover:bg-surface-raised ${
                      selected === d ? "bg-surface-raised ring-1 ring-foreground" : ""
                    }`}
                  >
                    {d}
                    <span aria-hidden="true" className="w-1 h-1 rounded-full bg-foreground mt-0.5" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center justify-center min-w-10 min-h-10 text-fliess text-foreground-faint">{d}</span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
