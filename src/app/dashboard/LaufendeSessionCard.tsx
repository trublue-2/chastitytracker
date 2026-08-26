import { KeyRound } from "lucide-react";
import { formatDateTime, formatDate, formatTime, hasExifMismatch, toDateLocale, isTimeCorrected, APP_TZ } from "@/lib/utils";
export type { SessionEvent } from "@/lib/sessionHelpers";
import { getTranslations, getLocale } from "next-intl/server";
import { getKombinierterPill } from "@/lib/kontrollePills";
import SessionDurationBadge from "./SessionDurationBadge";
import type { SessionEventData } from "./SessionEventRow";
import SessionTimeline from "./SessionTimeline";
import Section from "@/app/components/Section";
import StateHero from "@/app/components/StateHero";
import LiveTrainingGoals from "./LiveTrainingGoals";
import SperrzeitRemaining from "@/app/components/SperrzeitRemaining";

import type { SessionEvent } from "@/lib/sessionHelpers";
import { inspectionHref } from "@/lib/entryFormRoute";
import { hasVisibleGoalRow, periodEndsMs, type VorgabeTargets } from "@/lib/goalFulfillment";
import { LockClosedIcon } from "@/app/components/lockIcons";

interface Props {
  sessionStart: Date;
  interruptionPausedMs?: number;
  now: Date;
  events: SessionEvent[];
  sperrzeitEndetAt: Date | null;
  sperrzeitUnbefristet?: boolean;
  sperrzeitNachricht?: string | null;
  /** Nur Keyholder-Sicht: geplante (noch nicht ausgelöste) Sperrzeit → Footer zeigt "geplant für"
   *  statt "gesperrt bis". Sub-Sichten setzen dies NIE (geplante bleiben für den Sub unsichtbar). */
  sperrzeitScheduledFor?: Date | null;
  /** Nur Keyholder-Sicht: eine terminierte Sperre, die inzwischen LÄUFT. Gebraucht, weil eine
   *  unbefristete Sperre sonst gar keinen Zeitpunkt nennt — sie hat den Beginn selbst gesetzt und
   *  soll sehen, dass er erreicht ist. Bei befristeten Sperren steht die Frist ohnehin da. */
  sperrzeitRunningSince?: Date | null;
  /** Erlaubt diese Sperre Reinigungsöffnungen? Fertig übersetzt (i18n bleibt beim Aufrufer).
   *  Weglassen = nicht anzeigen — ein Sub, der grundsätzlich nicht reinigen darf, soll keine Zeile
   *  über etwas lesen, das seine Einstellung ohnehin verbietet. */
  cleaningNote?: string | null;
  /** Schlüssel-Deklaration des laufenden Verschlusses: liegt er in der Box? `null`/undefined =
   *  keine Box oder Alt-Eintrag → keine Zeile (statt einer Behauptung ins Blaue). */
  keyInBox?: boolean | null;
  activeVorgabe: VorgabeTargets | null;
  tagH: number;
  wocheH: number;
  monatH: number;
  jahrH: number;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  /** Blendet die „Gerät"-Zeile im Kontroll-Detail ein (true, wenn der Nutzer Geräte hat). */
  userHasDevices?: boolean;
}

export default async function LaufendeSessionCard({
  sessionStart,
  interruptionPausedMs = 0,
  now,
  events,
  sperrzeitEndetAt,
  sperrzeitUnbefristet = false,
  sperrzeitNachricht,
  sperrzeitScheduledFor = null,
  sperrzeitRunningSince = null,
  cleaningNote,
  keyInBox = null,
  activeVorgabe,
  tagH,
  wocheH,
  monatH,
  jahrH,
  tz = APP_TZ,
  userHasDevices = false,
}: Props) {
  const t = await getTranslations("dashboard");
  const tCommon = await getTranslations("common");
  const ta = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());

  const sessionStartStr = formatDateTime(sessionStart, dl, tz);
  const sperrzeitStr = sperrzeitEndetAt ? formatDateTime(sperrzeitEndetAt, dl, tz) : null;
  const scheduledForStr = sperrzeitScheduledFor ? formatDateTime(sperrzeitScheduledFor, dl, tz) : null;
  const runningSinceStr = sperrzeitRunningSince ? formatDateTime(sperrzeitRunningSince, dl, tz) : null;
  /** Die Nebenangaben der Sperr-Zeile — Restzeit und erreichter Beginn stehen gleichrangig. */
  const showSperrzeit = sperrzeitStr !== null || sperrzeitUnbefristet || scheduledForStr !== null || runningSinceStr !== null;

  // Nicht „hat die Vorgabe Ziele?", sondern „bleibt eine bewertbare Zeile übrig?" — sonst stünde
  // die Überschrift „KG-Ziele" am Starttag einer Vorgabe über einer leeren Liste.
  const hasVorgabe = activeVorgabe != null && hasVisibleGoalRow(activeVorgabe.targetH);

  return (
    // `gap-4` — DERSELBE Abstand, der zwischen den Blöcken der Seite steht.
    //
    // Der Block hatte keinen. Jeder Abschnitt darin trug stattdessen sein eigenes `pt-` von Hand:
    // die Ziele 20 px, die Tragezeit 24 px, alles Weitere nichts. Drei Masse in dem einen Block,
    // den der Träger zuerst sieht, während die achtzehn Abschnitte darunter auf 16 px liegen — das
    // ist der Grund, warum die Seite auf dem Schreibtisch „zerfliesst": nicht zu wenig Abstand,
    // sondern kein durchgehender. Ein Rhythmus, der einmal aussetzt, ist keiner mehr.
    //
    // Der Held behält sein grosszügigeres `pb-7` — das ist Luft INNERHALB des Helden, um die Zahl
    // herum, und nicht der Abstand zum nächsten Abschnitt.
    <section className="flex flex-col gap-4">
      {/* Der Held: EIN Wort, eine grosse Zahl, eine leise Zeile. Über `StateHero`, weil dieselbe
          Figur auch den offenen Zustand und die Keyholder-Sicht trägt — sie stand kurzzeitig
          viermal zeichengleich im Baum und lief schon in den Innenabständen auseinander.

          Vorher stand hier dreimal dasselbe: „Laufende Tragezeit", „Verschlossen" und „Dauer:"
          beantworten alle die Frage, die die Zahl darunter längst beantwortet. */}
      <StateHero
        tone="lock"
        word={t("locked")}
        icon={<LockClosedIcon size={15} strokeWidth={2.2} className="shrink-0" />}
        value={<SessionDurationBadge since={sessionStart.toISOString()} pausedMs={interruptionPausedMs} />}
        footnote={`${t("sessionSince")} ${sessionStartStr}`}
      >
        {keyInBox != null && (
          keyInBox ? (
            <p className="relative mt-1.5 inline-flex items-center gap-1.5 text-neben text-foreground-faint">
              <KeyRound size={12} className="shrink-0" />{t("keyInBoxYes")}
            </p>
          ) : (
            // „Nicht in der Box" ist die Ausnahme und heisst: dieser Verschluss ist gerade NICHT
            // hardware-gesichert. Das ist keine Fussnote — es bekommt die Aufmerksamkeitsfarbe.
            <p className="relative mt-1.5 inline-flex items-center gap-1.5 text-neben font-semibold text-warn">
              <KeyRound size={12} className="shrink-0" />{t("keyInBoxNo")}
            </p>
          )
        )}

        {/* Die Sperrzeit gehört zum Zustand, nicht in einen Fuss am anderen Ende der Karte: sie
            sagt, wie lange dieser Zustand noch gilt. */}
        {showSperrzeit && (
          <p className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-neben text-foreground-muted">
            <LockClosedIcon size={12} className="shrink-0 text-lock" />
            <span className="font-semibold text-foreground">
              {scheduledForStr
                ? <>{ta("scheduledForLabel")}: {scheduledForStr}</>
                : sperrzeitStr ? <>{t("sessionLockedUntil")} {sperrzeitStr}</> : t("sessionLockedIndefinite")}
            </span>
            {!scheduledForStr && !sperrzeitStr && runningSinceStr && (
              <span>{ta("lockRunningSince", { time: runningSinceStr })}</span>
            )}
            {!scheduledForStr && sperrzeitEndetAt && (
              <SperrzeitRemaining endetAt={sperrzeitEndetAt.toISOString()} />
            )}
            {sperrzeitNachricht && <span className="truncate">· {sperrzeitNachricht}</span>}
            {cleaningNote && <span className="shrink-0">· {cleaningNote}</span>}
          </p>
        )}
      </StateHero>

      {/* Trainingsvorgaben als eigener, benannter Abschnitt — vorher hingen sie namenlos unter
          dem Kartenkopf und sahen aus wie ein Teil des Zustands. Sie sind aber die Antwort auf
          eine andere Frage: nicht „wie ist es gerade", sondern „wie stehe ich zu dem, was
          verlangt ist". */}
      {hasVorgabe && (
        <LiveTrainingGoals
          serverNow={now.toISOString()}
          periodEndMs={periodEndsMs(now, tz ?? APP_TZ)}
          tagH={tagH}
          wocheH={wocheH}
          monatH={monatH}
          jahrH={jahrH}
          activeVorgabe={activeVorgabe}
        />
      )}

      {/* ── Was in DIESER Tragezeit passiert ist ──
          Die Liste stand vorher ohne jede Beschriftung da: nach den Zielen begannen einfach
          Zeilen. Wer sie zum ersten Mal sieht, kann nicht wissen, ob das alle Einträge sind oder
          nur die dieser Session — und die Antwort ändert alles. Die Rubrik ist der Unterschied
          zwischen einer Liste und einer Auskunft. */}
      <Section title={t("currentWearTime")}>
      <SessionTimeline
        tz={tz}
        events={events.map<SessionEventData>((ev) => {
          const dateStr = formatDate(ev.time, dl, tz);
          const timeStr = formatTime(ev.time, dl, tz);
          const exifStr = ev.imageExifTime && hasExifMismatch(ev.imageExifTime, ev.time)
            ? formatDateTime(ev.imageExifTime, dl, tz)
            : null;
          // Nur die Kontroll-Zeile liest diese Pille (`SessionEventRow`). Für Verschluss,
          // Orgasmus und Reinigung sind beide Status null, und `getKombinierterPill` schlug
          // trotzdem einen Text nach und legte ein Ergebnis an, das niemand las.
          const timeCorrected = isTimeCorrected(ev.time, ev.submittedAt);
          const kombiniertePill = ev.type === "kontrolle"
            ? getKombinierterPill(
                ev.kontrolleAnforderungStatus ?? null,
                ev.kontrolleVerifikationStatus ?? null,
                ta,
              )
            : null;
          return {
            type: ev.type,
            timeIso: ev.time.toISOString(),
            dateStr,
            timeStr,
            imageUrl: ev.imageUrl,
            codeImageUrl: ev.codeImageUrl ?? null,
            // Bewusst `undefined`: die laufende Karte kennt das Urteil des Gates nicht, also fragt
            // die Zeile selbst nach (siehe `SessionEventData.codeRevealed`). Seit die Felder
            // pflichtig sind, muss dieses „weiss ich nicht" ausgeschrieben werden.
            codeRevealed: undefined,
            // Die laufende Karte ist die Sicht des TRÄGERS — Erfassen ist hier immer erlaubt.
            captureDisabled: false,
            exifStr,
            note: ev.note,
            entryId: ev.entryId,
            // Unerreichbar: `buildSessionEvents` nimmt nur BEANTWORTETE Kontrollen auf
            // (`k.entryId !== null`), `!ev.entryId` ist hier also immer falsch. Bewusst stehen
            // gelassen statt still entfernt — fällt der Filter dort je weg, muss diese Zeile wie in
            // `SessionList` einen Keyholder-Riegel bekommen, sonst erfasst der Keyholder die
            // Kontrolle seines Subs auf dem eigenen Konto.
            // Die frühere Zusatzbedingung `&& ev.kontrolleCode` ist entfallen: sie stammte aus der
            // Zeit des handgebauten `?code=${…}`, das ohne Code wörtlich `?code=null` ergeben hätte.
            // `inspectionHref` lässt einen fehlenden Code weg — und eine Kontrolle ohne Code (Gerät mit
            // `requireInspectionCode: false`) muss ihren Knopf behalten, genau wie in `SessionList`.
            captureHref: !ev.entryId && ev.type === "kontrolle"
              ? inspectionHref(ev.kontrolleCode)
              : null,
            deadlineStr: ev.deadline ? formatDateTime(ev.deadline, dl, tz) : null,
            isOverdue: ev.kontrolleAnforderungStatus === "overdue",
            kontrolleCode: ev.kontrolleCode ?? null,
            kontrolleKommentar: ev.kontrolleKommentar ?? null,
            kombiniertePillLabel: kombiniertePill?.label ?? null,
            kombiniertePillCls: kombiniertePill?.cls ?? null,
            verifyFailure: ev.kontrolleVerifikationFailure ?? null,
            orgasmusArt: ev.orgasmusArt ?? null,
            pauseDurationStr: ev.pauseDurationStr ?? null,
            timeCorrected,
            timeCorrectedSystemStr: timeCorrected ? formatDateTime(ev.submittedAt!, dl, tz) : null,
            deviceName: ev.deviceName ?? null,
            showDevice: userHasDevices,
            keyDetected: ev.keyDetected ?? null,
            keyProofSource: ev.keyProofSource ?? null,
            boxImageUrl: ev.boxImageUrl ?? null,
          };
        })}
        sessionStart={sessionStart.toISOString()}
        nowIso={now.toISOString()}
        locale={dl}
        mode="active"
        storageScope="active"
      />
      </Section>

    </section>
  );
}
