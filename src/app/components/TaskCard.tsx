"use client";

import Link from "next/link";
import { ListChecks, Check, ChevronRight, Circle, Camera, ArrowRight, Hourglass } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Card, { CARD_BODY_STRIPED } from "@/app/components/Card";
import IconTile from "@/app/components/IconTile";
import RowAction from "@/app/components/RowAction";
import ImageViewer from "@/app/components/ImageViewer";
import Badge from "@/app/components/Badge";
import useRemainingMs from "@/app/hooks/useRemainingMs";
import { formatDateTimeDual, formatElapsedMs, formatTime, toDateLocale } from "@/lib/utils";
import { nextTaskStep, taskDeadlineLine, taskFailureLabelKey, visibleStartDeadline, type TaskCardData } from "@/lib/taskView";
import { isTaskOffense } from "@/lib/tasks";
import { TASK_STATE_COLOR } from "@/lib/constants";

/**
 * Eine Aufgabe als Karte — geteilt von der Keyholder-Historie und dem Sub-Dashboard.
 *
 * Farbschema bewusst NEUTRAL (`surface-raised` / `border`), nicht das Indigo der
 * Einschliess-Anforderungen: `LockRequestBanner` koppelt dort Icon an Farbschema, „Wohnung
 * staubsaugen" sähe in Indigo mit Schloss-Icon aus wie eine KG-Direktive. Semantikfarbe trägt hier
 * nur der ZUSTAND.
 */

/** Die Liste, in der Bedingungen und Nachweise stehen — dieselbe Umrandung, dieselben Trenner.
 *  Zwei Listen mit identischem Rahmen direkt untereinander sähen sonst zufällig gleich aus statt
 *  absichtlich. */
function ChecklistBox({ children }: { children: React.ReactNode }) {
  return (
    /* Ohne Rahmen und Radius: die Karte hat schon einen, und ein Ring darin ist Kasten im Kasten —
       das war der Grossteil dessen, was als „Aufgaben haben einen Rand" auffiel. Die Zeilentrenner
       bleiben, sie sind die richtige Linie für „innerhalb". */
    <ul className="flex flex-col divide-y divide-border-subtle">
      {children}
    </ul>
  );
}

/** Eine Zeile darin, wahlweise als Link. `align` unterscheidet die einzeiligen Bedingungen von den
 *  mehrzeiligen Nachweisen (Beschreibung + Code + Anmerkung). */
function ChecklistRow({
  href,
  align = "center",
  children,
}: {
  href?: string | null;
  align?: "center" | "start";
  children: React.ReactNode;
}) {
  const cls = `flex ${align === "start" ? "items-start" : "items-center"} gap-3 px-3 py-2.5 min-h-12`;
  return (
    <li>
      {href ? (
        <Link href={href} className={`${cls} hover:bg-surface-raised transition active:scale-[0.98]`}>
          {children}
        </Link>
      ) : (
        <div className={cls}>{children}</div>
      )}
    </li>
  );
}

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
  const startBy = visibleStartDeadline(task);
  const deadline = taskDeadlineLine(task, { date: dual, duration: (ms) => formatElapsedMs(ms, locale) });

  return (
    <Card padding="none">
      <div className={CARD_BODY_STRIPED}>
        <div className="flex items-start gap-3">
          <IconTile icon={<ListChecks className="size-4" />} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground break-words">{task.title}</p>
            <p className="text-xs text-foreground-muted">{t(deadline.key, { value: deadline.value })}</p>
            {/* Nur in der Keyholder-Sicht gefüllt: der Träger bekommt eine noch nicht ausgelöste
                Aufgabe gar nicht geladen. Ohne diese Zeile stünde bei ihr eine Aufgabe mit einer
                Frist weit voraus und kein Hinweis, dass davon noch niemand weiss. */}
            {task.scheduledFor && (
              <p className="text-xs text-foreground-faint">{t("effectiveFromLabel", { value: dual(task.scheduledFor) })}</p>
            )}
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
          <ChecklistBox>
            {task.requirements.map((r) => (
              <ChecklistRow key={r.id} href={r.href && !r.satisfied ? r.href : null}>
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
                {r.href && !r.satisfied && <RowAction label={t("requirementAction")} />}
              </ChecklistRow>
            ))}
          </ChecklistBox>
        )}

        {/* Nachweise als eigene Liste unter den Bedingungen: sie sind eine ZWEITE Achse, keine
            weiteren Bedingungen. Bewusst nicht in dieselbe Liste gemischt — die Bedingungen sind
            Zustände („trägst du das gerade?"), ein Nachweis ist eine Handlung mit Zeitpunkt. */}
        {task.proofs.length > 0 && (
          <ChecklistBox>
            {task.proofs.map((p, i) => (
              <ChecklistRow key={p.id} href={p.href} align="start">
                {/* Die Nummer, nicht ein Häkchen: sie ist die Adresse eines Nachweises („Nachweis 2"
                    in Sichtung und MCP). OB die Reihenfolge auch gefordert ist, entscheidet
                    `Task.proofOrderMatters` — abgeschaltet bleibt der Zustand `outOfOrder` von selbst
                    aus (`firstOutOfOrderProof`), die Nummer ist dann reine Zählung. */}
                <span
                  className={`size-5 rounded-md flex items-center justify-center shrink-0 text-[11px] font-semibold tabular-nums ${
                    p.state === "rejected" || p.state === "outOfOrder" || p.state === "overdue" ? "bg-warn text-background"
                      : p.state === "confirmed" ? "bg-ok text-background"
                      : "text-foreground-faint"
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 flex flex-col">
                  <span className="text-sm text-foreground break-words">{p.description}</span>
                  {/* Die EIGENE Fälligkeit dieses Nachweises — nur wo es sie gibt. Sonst gilt die
                      Frist im Kartenkopf, und dieselbe Uhrzeit ein zweites Mal je Zeile wäre Lärm.
                      Warnfarbe erst, wenn sie verstrichen ist: dann ist sie kein Hinweis mehr,
                      sondern der Beleg für das Urteil der Aufgabe. */}
                  {p.dueAt && (
                    <span className={`text-xs tabular-nums ${p.state === "overdue" ? "text-warn-text" : "text-foreground-muted"}`}>
                      {t("proofDueLine", { value: dual(p.dueAt) })}
                    </span>
                  )}
                  {/* Der Code MUSS sichtbar sein — ohne ihn kann der Nachweis nicht erbracht
                      werden. Monospace und gesperrt, damit er von Hand abschreibbar ist. */}
                  {p.code && p.state === "open" && (
                    <span className="text-xs text-[var(--color-inspect)] font-mono tracking-widest">
                      {t("proofCodeLabel")}: {p.code}
                    </span>
                  )}
                  {/* VERSPÄTET — und was das bedeutet. Der Träger darf nachreichen, solange die
                      Aufgabe läuft, aber ob es dann noch zählt, entscheidet allein die
                      Keyholderin (`proofCounted`). Das muss er lesen, BEVOR er fotografiert: sonst
                      nimmt er den Knopf für „geht schon noch" und hält sein Versäumnis für geheilt.
                      Ist die Aufgabe vorbei, steht hier der GRUND, warum es keinen Knopf mehr gibt —
                      ein stumm fehlender Link liesse ihn suchen. Welcher Satz, entscheidet
                      `proofLateNote` neben dem Link, nicht diese Komponente. */}
                  {p.lateNote && (
                    <span className="text-xs font-medium text-warn-text">{t(p.lateNote)}</span>
                  )}
                  {p.reviewNote && (
                    <span className="text-xs text-foreground-faint italic break-words">{p.reviewNote}</span>
                  )}
                  {/* Das eingereichte Foto: für die Keyholderin die Grundlage ihres Urteils, für den
                      Sub der Beleg, was er abgegeben hat. Klein und antippbar — `ImageViewer` bringt
                      die Vollbild-Ansicht mit. */}
                  {p.imageUrl && (
                    <span className="mt-1.5 block">
                      <ImageViewer src={p.imageUrl} alt={p.description} width={72} height={72} className="rounded-lg" />
                    </span>
                  )}
                </span>
                <span className="sr-only">{t(`proofState_${p.state}`)}</span>
                {/* Das Handlungswort sagt, WORAUF man sich einlässt: „Foto aufnehmen" wäre für eine
                    überfällige Zeile dieselbe Einladung wie für eine fristgerechte, obwohl sie
                    zwei verschiedene Dinge bedeuten. */}
                {p.href && (
                  <RowAction
                    icon={<Camera size={14} />}
                    label={t(p.state === "overdue" ? "proofCaptureLate" : "proofCapture")}
                  />
                )}
              </ChecklistRow>
            ))}
          </ChecklistBox>
        )}

        <StateLine task={task} dual={dual} timeOnly={(iso) => formatTime(iso, dl, viewerTz ?? subTz)} />

        {/* Die Startfrist — die einzige Frist der Aufgabe, die bisher nirgends stand, obwohl ihr
            Verstreichen ein Vergehen erzeugt. Unter der Zustandszeile, weil sie deren Aussage
            ergänzt („noch nicht begonnen" → „und zwar bis wann"). */}
        {startBy && (
          <>
            <p className="text-xs text-foreground-faint">{t("startDeadlineHint", { date: dual(startBy) })}</p>
            {/* Wie lange es am Ende wirklich zu halten ist — dieselbe Zahl, die die Keyholderin beim
                Stellen als Zusage sieht (`minHoldMs`). Ohne sie stünden hier zwei Zeitpunkte, und der
                Sub müsste die Differenz im Kopf bilden: genau die Rechnung, die der anderen Seite
                abgenommen wird. Nur solange nie begonnen wurde — danach zählt die Restzeit, die der
                Countdown im nächsten Schritt nennt, nicht mehr das Minimum.

                NICHT im Dauer-Modus: dort steht die Zahl schon in der Frist-Zeile am Kartenkopf
                („Ohne Unterbrechung 30min ab dem Anlegen"), und zweimal dieselbe Angabe liest sich
                wie zwei verschiedene Forderungen. Rechnerisch käme hier dasselbe heraus — die
                Differenz zwischen spätestmöglichem Ende und Startfrist IST die Dauer. */}
            {!task.holdDurationMin && (
              <p className="text-xs text-foreground-faint">
                {t("holdMinHint", { duration: formatElapsedMs(new Date(task.holdUntil).getTime() - new Date(startBy).getTime(), locale) })}
              </p>
            )}
          </>
        )}

        {task.completionNote && (
          <p className="text-xs text-foreground-faint break-words">{task.completionNote}</p>
        )}

        <NextStep task={task} />

        {children}
      </div>
    </Card>
  );
}

/**
 * Was der Sub JETZT tun muss — genau EIN Schritt, mit dem Weg dorthin.
 *
 * Die Karte zeigt Bedingungen, Nachweise und Zustand nebeneinander; sie sagt damit vollständig, WIE
 * es steht, aber nicht, WO man anfängt (Rückmeldung 02.08.2026). Diese Zeile beantwortet das und
 * nichts sonst.
 *
 * Die Rangfolge ist die der Auswertung: erst müssen die Bedingungen gelten (ohne sie läuft die Zeit
 * gar nicht), dann kommen die Nachweise in ihrer geforderten Reihenfolge, und zuletzt bleibt die
 * Selbstmeldung für den Textteil, den keine Maschine prüfen kann.
 *
 * Nicht jeder Schritt ist eine Handlung: läuft die Haltefrist noch, steht hier ein ZUSTAND mit
 * Countdown. Genau dort stand vorher „Alles erfüllt — melde die Aufgabe unten als erledigt", während
 * die Zeile darüber „Läuft seit 17:37" meldete — zwei Aussagen über denselben Moment, von denen die
 * auffälligere (grüner Knopf) die falsche war.
 */
function NextStep({ task }: { task: TaskCardData }) {
  const t = useTranslations("tasks");
  const step = nextTaskStep(task);
  if (!step) return null;

  // Flache Kette, kein Ternär-Turm: dieselbe Bauform wie `StateLine` darunter, die dieselbe Aufgabe
  // hat (ein Wert aus mehreren Fällen).
  let text: React.ReactNode;
  let href: string | null = null;
  let icon: React.ReactNode;
  if (step.kind === "requirement") {
    text = t("nextStepRequirement", { label: step.label });
    href = step.href;
    icon = <ArrowRight size={16} />;
  } else if (step.kind === "proof") {
    text = t("nextStepProof", { description: step.label });
    href = step.href;
    icon = <Camera size={16} />;
  } else if (step.kind === "hold") {
    // Kein Link und kein Knopf: hier ist nichts zu TUN ausser zu halten.
    text = <HoldRemaining until={step.until} />;
    icon = <Hourglass size={16} />;
  } else {
    // Kein Link: die Meldung ist ein Knopf, den der Aufrufer als `children` unter diese Zeile
    // stellt. Sie erklärt ihn — „wofür ist der Knopf?" war die Frage, nicht „wo ist er?".
    text = t("nextStepConfirm");
    icon = <Check size={16} />;
  }

  const inner = (
    <>
      <span className="shrink-0 text-foreground-muted" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-foreground-faint">
          {/* „Nächster Schritt: Die Bedingungen gelten durchgehend" wäre ein Widerspruch in sich —
              beim Halten ist gerade NICHTS zu tun. Die Überschrift benennt darum den Zustand. */}
          {t(step.kind === "hold" ? "nextStepLabelHold" : "nextStepLabel")}
        </span>
        <span className="block text-sm text-foreground break-words">{text}</span>
      </span>
      {href && <ChevronRight size={16} className="shrink-0 text-foreground-faint" />}
    </>
  );

  const cls = "flex items-center gap-3 rounded-xl bg-surface-raised px-3 py-2.5";
  return href
    ? <Link href={href} className={`${cls} hover:bg-surface transition active:scale-[0.98]`}>{inner}</Link>
    : <div className={cls}>{inner}</div>;
}

/** Wie lange noch gehalten werden muss, live. Die Frist steht zwar schon im Kopf der Karte, aber als
 *  Datum — „18:36" beantwortet nicht, wie lange das noch ist, und genau das ist hier die Frage. */
function HoldRemaining({ until }: { until: string }) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const remainingMs = useRemainingMs(until);

  // Abgelaufen, und die Karte steht trotzdem noch: der Server hat den Zustandswechsel noch nicht
  // geliefert (Uhren-Drift zwischen Handy und Server, oder offline). „noch 0min" wäre dann eine
  // Aufforderung zu warten, die nie endet — der schlichte Satz stimmt in beiden Fällen.
  return (
    <span suppressHydrationWarning className="tabular-nums">
      {remainingMs === 0
        ? t("nextStepHoldOver")
        : t("nextStepHold", { remaining: formatElapsedMs(remainingMs, locale) })}
    </span>
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
  const color = TASK_STATE_COLOR[task.state];

  let text: string;
  if (isTaskOffense(task.state)) {
    // WELCHER Vorwurf, entscheidet `taskFailureKind` über `taskFailureLabelKey` — nicht die Karte:
    // `missed` steht für drei verschiedene, und die Unterscheidung von Hand lag bei jeder Aufgabe
    // ohne Bedingungen falsch.
    text = t(taskFailureLabelKey({ startedAt: task.startedAt, requirements: task.requirements, state: task.state }));
    // Der BELEG zum Abbruch, wo er vorliegt: „vorzeitig abgelegt" ohne ihn wäre nicht von
    // „zurückgezogen" zu unterscheiden und ein Vorwurf ohne Nachweis.
    if (task.state === "aborted" && task.failedRequirement && task.failedAt) {
      text += ` — ${t("abortedDetail", { requirement: task.failedRequirement, at: dual(task.failedAt) })}`;
    }
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
