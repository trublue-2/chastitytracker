"use client";

import Link from "next/link";
import { ListChecks, Check, ChevronRight, Circle } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import { formatDateTimeDual, formatTime, toDateLocale } from "@/lib/utils";
import type { TaskCardData } from "@/lib/taskView";
import type { TaskState } from "@/lib/tasks";

/**
 * Eine Aufgabe als Karte — geteilt von der Keyholder-Historie und dem Sub-Dashboard.
 *
 * Farbschema bewusst NEUTRAL (`surface-raised` / `border`), nicht das Indigo der
 * Einschliess-Anforderungen: `LockRequestBanner` koppelt dort Icon an Farbschema, „Wohnung
 * staubsaugen" sähe in Indigo mit Schloss-Icon aus wie eine KG-Direktive. Semantikfarbe trägt hier
 * nur der ZUSTAND.
 */

/** Zustands-Ton der Statuszeile. `warn` bleibt den echten Fehlschlägen vorbehalten — eine noch offene
 *  Bedingung ist kein Alarm.
 *
 *  Direkt die Klasse statt eines Zwischen-Tokens: der einzige Leser übersetzte ihn eine Zeile später
 *  ohnehin in genau diese drei Werte. Ein neuer Zustand wäre sonst zwei Stellen. */
const STATE_COLOR: Record<TaskState, string> = {
  pending: "text-foreground-muted",
  partial: "text-foreground-muted",
  running: "text-foreground-muted",
  done: "text-ok-text",
  missed: "text-warn-text",
  aborted: "text-warn-text",
  withdrawn: "text-foreground-muted",
  // Neutral, nicht warnend: der Sub hat getan, was er konnte — es fehlt ein Urteil, kein Verhalten.
  awaitingReview: "text-foreground-muted",
};

export default function TaskCard({
  task,
  viewerTz,
  subTz,
  subLabel,
  children,
}: {
  task: TaskCardData;
  /** Zeitzone des Betrachters; beim Keyholder ggf. eine andere als die des Subs. */
  viewerTz?: string;
  subTz: string;
  /** Übersetztes Präfix für die Sub-Lokalzeit, z.B. „Sub:". */
  subLabel: string;
  /** Aktionen (Erledigt melden, Zurückziehen) — die Karte kennt sie nicht, sie zeigt sie nur. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const dl = toDateLocale(locale);
  const dual = (iso: string) => formatDateTimeDual(iso, dl, viewerTz, subTz, subLabel);

  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 p-4 border-l-[3px] border-l-border-strong">
        <div className="flex items-start gap-3">
          <div className="shrink-0 size-9 rounded-lg flex items-center justify-center bg-surface-raised text-foreground-muted" aria-hidden>
            <ListChecks className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground break-words">{task.title}</p>
            <p className="text-xs text-foreground-muted">{t("holdUntilShort", { date: dual(task.holdUntil) })}</p>
          </div>
          {task.isPunishment && <Badge variant="warn" size="sm" label={t("punishmentBadge")} className="shrink-0" />}
        </div>

        {task.description && (
          <p className="text-sm text-foreground-muted whitespace-pre-wrap break-words">{task.description}</p>
        )}

        {task.penaltyReason && (
          <p className="text-xs text-foreground-faint break-words">
            {t("penaltyReasonLabel")}: {task.penaltyReason}
          </p>
        )}

        {/* Bedingungen als Zeilen, nie als Badge-Reihe: `Badge` ist `whitespace-nowrap`, und
            Gerätenamen vergibt der Nutzer frei — auf 375 px liefe die Zeile sonst über. */}
        {task.requirements.length > 0 && (
          <ul className="flex flex-col rounded-xl border border-border-subtle divide-y divide-border-subtle overflow-hidden">
            {task.requirements.map((r) => {
              const inner = (
                <>
                  <span
                    className={`size-5 rounded-md flex items-center justify-center shrink-0 ${
                      r.satisfied ? "bg-ok text-background" : "text-foreground-faint"
                    }`}
                    aria-hidden
                  >
                    {r.satisfied ? <Check size={14} strokeWidth={3} /> : <Circle size={12} />}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-foreground truncate">{r.label}</span>
                  {/* Der Zustand steht in Farbe UND Text — ein Häkchen allein liest ein Screenreader
                      als „check mark", nicht als „erfüllt". */}
                  <span className="sr-only">{r.satisfied ? t("requirementSatisfied") : t("requirementOpen")}</span>
                  {r.href && !r.satisfied && <ChevronRight size={16} className="text-foreground-faint shrink-0" />}
                </>
              );
              const cls = "flex items-center gap-3 px-3 py-2.5 min-h-12";
              return (
                <li key={r.id}>
                  {r.href && !r.satisfied ? (
                    <Link href={r.href} className={`${cls} hover:bg-surface-raised transition active:scale-[0.98]`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <StateLine task={task} dual={dual} timeOnly={(iso) => formatTime(iso, dl, viewerTz ?? subTz)} />

        {task.completionNote && (
          <p className="text-xs text-foreground-faint break-words">{task.completionNote}</p>
        )}

        {children}
      </div>
    </Card>
  );
}

/** Klartext statt nacktem Zustandswort — „abgebrochen" allein wäre nicht unterscheidbar von
 *  „zurückgezogen", und ein Vorwurf ohne Beleg. */
function StateLine({
  task,
  dual,
  timeOnly,
}: {
  task: TaskCardData;
  dual: (iso: string) => string;
  timeOnly: (iso: string) => string;
}) {
  const t = useTranslations("tasks");
  const color = STATE_COLOR[task.state];

  let text: string;
  if (task.state === "aborted") {
    text = task.failedRequirement && task.failedAt
      ? `${t("stateAborted")} — ${t("abortedDetail", { requirement: task.failedRequirement, at: dual(task.failedAt) })}`
      : t("stateAborted");
  } else if (task.state === "missed") {
    text = t("stateMissed");
  } else if (task.state === "withdrawn") {
    text = t("stateWithdrawn");
  } else if (task.state === "done") {
    text = t("stateDone");
  } else if (task.state === "awaitingReview") {
    text = t("stateAwaitingReview");
  } else if (task.awaitingConfirmation) {
    text = t("stateAwaitingConfirmation");
  } else if (task.state === "running" && task.startedAt) {
    text = t("stateRunning", { since: timeOnly(task.startedAt) });
  } else if (task.state === "partial") {
    text = `${t("stateMissingPrefix")} ${task.missing.join(", ")}`;
  } else {
    text = t("stateNotStarted");
  }

  return <p className={`text-xs font-medium ${color}`}>{text}</p>;
}
