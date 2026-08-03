"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal, formatDateTime, formatElapsedMs, toDateLocale } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";
import DateTimePicker from "@/app/components/DateTimePicker";
import FieldLabel from "@/app/components/FieldLabel";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import HoursInput from "@/app/components/HoursInput";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { useApiError } from "@/app/hooks/useApiError";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH,
  TASK_DEFAULT_START_GRACE_MIN, TASK_START_GRACE_RANGE, clampStartGrace,
} from "@/lib/constants";
import { minHoldMs, startDeadline } from "@/lib/tasks";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import type { TaskRequirementInput, TaskProofInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import TaskProofPicker from "./TaskProofPicker";

/** Schnellwahl für die Endzeit. Das Modell kennt nur den absoluten Zeitpunkt (EINE Wahrheit); die
 *  Stunden-Knöpfe rechnen ihn nur bequem aus — „trage den Knebel 2 Stunden" ist damit zwei Taps. */
const QUICK_HOURS = [1, 2, 4, 8] as const;

/**
 * Formular „Aufgabe stellen".
 *
 * Der Aufbau folgte ursprünglich `VerschlussAnforderungFields` (Umschalter, Zeitwahl, Nachricht).
 * Bei der Zeitwahl weicht er inzwischen ab: dort steht weiter ein `FieldTabs`-Umschalter, hier ist
 * der zweite Weg ein Aufklapper. Grund ist die Vorschau darunter — sie nennt den errechneten
 * Endzeitpunkt, und daneben las sich ein Reiter „Endet um" wie eine zweite Anzeige desselben Werts
 * (Rückmeldung 03.08.2026). Ob das auch für die Anforderungs-Formulare der bessere Weg ist, ist eine
 * eigene Frage — bis sie beantwortet ist, steht die Abweichung hier bewusst und nicht versehentlich.
 */
export default function TaskFields({
  userId,
  categories,
  tz,
  minNow,
  redirectTo,
  offenseRef,
  initialPenaltyReason,
}: {
  userId: string;
  categories: PickerCategory[];
  /** Zeitzone des Subs — Fristen sind absolute Zeitpunkte, eingegeben wird in SEINER Zone. */
  tz: string;
  /** Server-gerechnetes „jetzt" in der Sub-Zone (hydrations-sicher). */
  minNow: string;
  /** Wohin nach dem Speichern. */
  redirectTo: string;
  /** Kommt das Formular aus dem Strafbuch, ist die Aufgabe die STRAFE für dieses Vergehen: die Route
   *  legt dann Aufgabe und Urteil zusammen an. Ohne die ref ist es eine gewöhnliche Aufgabe. */
  offenseRef?: string;
  /** Vorbelegter Anlass — die Zeile des Vergehens, damit sie niemand abtippt. */
  initialPenaltyReason?: string;
}) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();
  const holdLabelId = useId();

  const nowBaseMs = fromDatetimeLocal(minNow, tz).getTime();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"duration" | "datetime">("duration");
  const [hours, setHours] = useState("2");
  const [holdUntil, setHoldUntil] = useState(() => toDatetimeLocal(new Date(nowBaseMs + 2 * 3600_000), tz));
  const [graceMin, setGraceMin] = useState(String(TASK_DEFAULT_START_GRACE_MIN));
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>([]);
  const [proofs, setProofs] = useState<TaskProofInput[]>([]);
  // Aus dem Strafbuch heraus ist beides gesetzt und der Haken bleibt sichtbar: der Keyholder soll
  // sehen, dass er gerade eine Strafe stellt — nicht bloss eine Aufgabe, die zufällig so heisst.
  const [isPunishment, setIsPunishment] = useState(!!offenseRef);
  const [penaltyReason, setPenaltyReason] = useState(initialPenaltyReason ?? "");
  // Absende-Mechanik (saving/error/networkError/finally) über den geteilten Hook — sie war in den
  // Anforderungs-Formularen schon zweimal von Hand geschrieben.
  const { saving, error, submit } = useEntrySubmit<Record<string, unknown>>(
    async (payload) => {
      const res = await fetch("/api/admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok ? { ok: true } : { ok: false, error: apiError(await parseApiErrorCode(res)) };
    },
    () => router.push(redirectTo),
  );

  // Die Endzeit aus dem gerade gewählten Reiter — EINE Rechnung für Vorschau und Absenden. Zwei
  // getrennte Fassungen wären genau die Sorte Abweichung, die die Vorschau widerlegen soll: sie
  // verspräche eine Zeit, die das Formular dann anders abschickt.
  function endAt(nowMs: number): Date {
    return mode === "duration"
      ? new Date(nowMs + (parseFloat(hours) || 2) * 3600_000)
      : fromDatetimeLocal(holdUntil, tz);
  }

  /**
   * Zwischen Dauer und festem Zeitpunkt wechseln — und dabei den Wert MITNEHMEN.
   *
   * Wer „endet in 2 h" eingestellt hat und den Zeitpunkt öffnet, will ihn dort feinjustieren, nicht
   * neu suchen: der Wähler startet deshalb auf dem gerade angezeigten Ende. Ohne das stünde dort der
   * beim Seitenaufruf vorbelegte Wert — nach zehn Minuten Formularausfüllen zehn Minuten zu früh.
   */
  function toggleMode() {
    // Schlichte Funktion statt setState-Updater (Vorbild: `switchFristUnit` in `KontrolleFields`):
    // `mode` steht im Closure, und ein Updater muss REIN sein — unter StrictMode liefe er im Dev
    // zweimal und setzte die Endzeit zweimal mit unterschiedlichem `Date.now()`.
    //
    // SYMMETRISCH: `endAt` liest den gerade eingestellten Endzeitpunkt modus-unabhängig, und der
    // jeweils andere Modus wird darauf gesetzt. Nur eine Richtung zu bedienen hiesse, dass der
    // Rückweg auf einem alten Stand landet — also auf einer anderen Endzeit als der eben gezeigten.
    const nowMs = Date.now();
    const end = endAt(nowMs);
    if (Number.isNaN(end.getTime())) return; // halb getipptes Datum: nichts umzurechnen
    if (mode === "duration") {
      setHoldUntil(toDatetimeLocal(end, tz));
      setMode("datetime");
    } else {
      // Auf die Viertelstunde gerundet, damit im Stundenfeld nicht „2.3833" landet.
      const hoursFromNow = Math.max(1, Math.round(((end.getTime() - nowMs) / 3600_000) * 4) / 4);
      setHours(String(hoursFromNow));
      setMode("duration");
    }
  }

  // Die eine Frage, an der in diesem Formular vier Dinge hängen: Beschriftung, Hinweis, Kulanz-Block
  // und das abgeschickte Feld. Ausgeschrieben stünde sie viermal da und müsste viermal zusammen
  // geändert werden. Es ist dieselbe Unterscheidung, die `taskDeadlineKey` auf der Anzeige-Seite und
  // `checkTask` auf der Server-Seite treffen: gibt es überhaupt etwas anzulegen?
  const hasRequirements = requirements.length > 0;
  // Geklemmt wie im Service — mit derselben Funktion, damit die Vorschau denselben Wert zeigt, den
  // der Server am Ende schreibt.
  const graceEffective = clampStartGrace(parseFloat(graceMin));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const until = endAt(Date.now());

    // Keine eigene Frist-Prüfung hier: der Service verlangt mehr als „in der Zukunft" — die Endzeit
    // muss hinter der Kulanzfrist liegen, sonst wäre die Aufgabe gar nicht erst zu beginnen. Eine
    // zweite, schwächere Schranke im Formular liesse genau die Eingaben durch, die der Server danach
    // mit einer anderen Begründung abweist. `TASK_HOLD_UNTIL_TOO_SOON` kommt über
    // `parseApiErrorCode` übersetzt zurück und landet in derselben Fehlerzeile.
    void submit({
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      holdUntil: until.toISOString(),
      startGraceMin: hasRequirements ? graceEffective : undefined,
      requirements,
      // Leere Zeilen fallen weg: eine angelegte, aber nie ausgefüllte Nachweis-Zeile ist ein
      // Versehen, keine Forderung — der Service wiese sie sonst mit einem Fehler ab.
      proofs: proofs.filter((p) => p.description.trim()),
      isPunishment,
      penaltyReason: isPunishment ? penaltyReason.trim() || undefined : undefined,
      // Trägt die Aufgabe eine Vergehens-ref, schreibt die Route sie samt Urteil — das Vergehen gilt
      // damit als bestraft. Der Haken darf das nicht abschalten: die ref ist der Grund, aus dem
      // dieses Formular überhaupt geöffnet wurde. Der Schlüssel kommt aus derselben Konstante wie
      // die Query — umbenannt fiele die Aufgabe sonst still auf „gewöhnlich" zurück.
      [TASK_FORM_QUERY.offenseRef]: offenseRef,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label={t("titleLabel")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("titlePlaceholder")}
        maxLength={TASK_TITLE_MAX_LENGTH}
        required
      />

      <Textarea
        label={t("descriptionLabel")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("descriptionPlaceholder")}
        maxLength={TASK_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />

      <TaskRequirementPicker
        label={t("requirementsLabel")}
        hint={t("requirementsHint")}
        kgLabel={t("requirementKgLocked")}
        anyDeviceLabel={t("anyDevice")}
        deviceLabel={t("deviceLabel")}
        categories={categories}
        value={requirements}
        onChange={setRequirements}
      />

      <TaskProofPicker value={proofs} onChange={setProofs} />

      {/* ZUERST der Beginn, dann das Ende — das Formular liest sich in der Reihenfolge, in der die
          Sache abläuft (Rückmeldung 03.08.2026). Nur mit Bedingungen: ohne sie gibt es nichts
          anzulegen, und die Kulanzfrist ist ohne Bedeutung. */}
      {hasRequirements && (
        <div className="flex flex-col gap-2">
          <HoursInput
            label={t("graceLabel")}
            value={graceMin}
            onChange={setGraceMin}
            min={TASK_START_GRACE_RANGE.min}
            step={5}
            unit={t("minutesUnit")}
          />
          {/* Dieselbe Rechnung wie auf der Karte des Subs (`startDeadline`), damit die Vorschau nicht
              das eine verspricht und die Karte danach das andere anzeigt. Immer live: die Kulanz läuft
              ab dem Stellen, ihr Ende wandert also mit jeder Minute Formularausfüllen mit. */}
          <TimePreview
            at={(nowMs) => startDeadline({ createdAt: new Date(nowMs), startGraceMin: graceEffective })}
            live
            tz={tz}
            line={(date) => t("previewStart", { date })}
          />
          <p className="text-xs text-foreground-faint">{t("graceHint")}</p>
        </div>
      )}

      {/* Die Frist. Die Beschriftung nennt die FRAGE, nicht bloss „Frist": mit Bedingungen ist es eine
          Haltefrist, ohne Bedingungen ein Termin.
          Der Umschalter „Endet in / Endet um" ist zum Aufklapper geworden: seit die Zeile darunter den
          errechneten Endzeitpunkt nennt, LAS sich der zweite Reiter wie eine zweite Anzeige desselben
          Werts (Rückmeldung 03.08.2026). Er ist trotzdem ein eigener EINGABEweg — „bis morgen früh
          07:00" wäre sonst wieder Kopfrechnen. Also: sichtbar ist der häufige Fall, der seltene ist
          einen Tap entfernt. */}
      <div className="flex flex-col gap-2" role="group" aria-labelledby={holdLabelId}>
        <FieldLabel id={holdLabelId}>{t(hasRequirements ? "holdUntilLabel" : "holdUntilLabelPlain")}</FieldLabel>

        {mode === "duration" ? (
          <>
            <HoursInput
              ariaLabel={t("holdHoursLabel")}
              value={hours}
              onChange={setHours}
              min={1}
              step={0.5}
              unit={t("hoursUnit")}
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_HOURS.map((h) => (
                <Button key={h} type="button" variant="secondary" size="sm" onClick={() => setHours(String(h))}>
                  {t("quickHours", { hours: h })}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <DateTimePicker
            aria-label={t("holdUntilAtLabel")}
            value={holdUntil}
            onChange={(e) => setHoldUntil(e.target.value)}
            min={minNow}
            hint={t("holdUntilTzHint", { tz })}
          />
        )}

        {/* Die MINDEST-Haltezeit steht dabei, weil die Stundenzahl gerade NICHT die Haltezeit ist: die
            Kulanz geht davon ab. Seit der Beginn über der Frist steht, liest sich beides sonst wie
            zwei aufeinanderfolgende Spannen („30 Min. + 2 h"), und das wäre eine halbe Stunde zu viel.

            Der Takt hängt an BEIDEM: bei einer Dauer wandert schon das Datum mit der Uhr, bei einem
            festen Zeitpunkt steht es zwar still — die Mindest-Haltezeit darunter schrumpft aber
            trotzdem, weil die Kulanzfrist ab jetzt läuft. Nur auf den Modus zu schauen liesse genau
            diese Zahl stehen, bis das Formular aus einem anderen Grund neu rendert. */}
        <TimePreview
          at={endAt}
          live={mode === "duration" || hasRequirements}
          tz={tz}
          line={(date, nowMs) => {
            // Über `minHoldMs` und nicht per eigener Rechnung: die Vorschau zeigt damit dieselbe
            // Grösse, gegen die der Server prüft (`TASK_HOLD_UNTIL_TOO_SOON`) und die der Sub auf
            // seiner Karte liest. Ein Wert ≤ 0 ist der widersprüchliche Fall — dann steht hier nur
            // das Ende, und die Ablehnung des Servers erklärt den Rest.
            const holdMs = minHoldMs({
              createdAt: new Date(nowMs),
              startGraceMin: graceEffective,
              holdUntil: endAt(nowMs),
            });
            return hasRequirements && holdMs > 0
              ? t("previewEndHold", { date, duration: formatElapsedMs(holdMs, locale) })
              : t("previewEnd", { date });
          }}
        />

        {/* Der Satz trägt das, was sonst nirgends steht: dass die Bedingungen ab dem STELLEN gelten
            müssen. Für die reine Textaufgabe stand hier „Bis dahin zu erledigen." — dieselbe Aussage
            wie die Beschriftung und die Vorschau darüber, also dreimal dasselbe. */}
        {hasRequirements && (
          <p className="text-xs text-foreground-faint">{t("holdUntilHintRequirements")}</p>
        )}

        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={toggleMode}>
          {t(mode === "duration" ? "modeSwitchToDatetime" : "modeSwitchToDuration")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Checkbox
          label={t("isPunishmentLabel")}
          checked={isPunishment}
          onChange={(e) => setIsPunishment(e.target.checked)}
          // Aus dem Strafbuch heraus ist das keine Wahl: der Server legt die Aufgabe ohnehin als
          // Strafe an. Abwählbar meldete der Haken einen Zustand, den der Server überschreibt — und
          // verwürfe dabei still den vorbelegten Anlass.
          disabled={!!offenseRef}
        />
        {isPunishment && (
          <Input
            label={t("penaltyReasonLabel")}
            value={penaltyReason}
            onChange={(e) => setPenaltyReason(e.target.value)}
            placeholder={t("penaltyReasonPlaceholder")}
            maxLength={TASK_TITLE_MAX_LENGTH}
          />
        )}
      </div>

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<ClipboardList size={16} />}>
        {saving ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

/**
 * Ein aus der Eingabe abgeleiteter Zeitpunkt im Klartext — die Zeile, die eine relative Angabe auf
 * eine Uhrzeit auflöst.
 *
 * Das Formular stellt zwei solche Fragen, die dieselbe Antwortform haben: wann ist Schluss (beide
 * Reiter, „Endet in 2 h" und „Endet um 18:36" sind dasselbe und sehen nicht so aus), und bis wann
 * muss alles anliegen. Bei einer Haltefrist ist die Stundenzahl gerade NICHT die Haltedauer — wer
 * erst nach 25 Minuten anlegt, hält entsprechend kürzer; die aufgelöste Uhrzeit ist die einzige
 * Angabe, die in beiden Reitern dasselbe bedeutet.
 *
 * `live` schaltet den Takt: er lohnt nur, wo der Wert von „jetzt" abhängt (Dauer-Eingaben). Über
 * einem fest eingetippten Zeitpunkt liefe sonst ein Intervall, das jede Minute denselben String neu
 * berechnet. `suppressHydrationWarning` wie bei jedem anderen Uhr-Anzeiger der App (siehe
 * `HoldRemaining`) — der Server kennt die Uhr des Betrachters nicht.
 *
 * Bewusst lokal und nicht in `src/app/components/`: es ist bisher EIN Formular. Kommt die zweite
 * Frist-Vorschau (Kontrolle, Verschluss-Anforderung), gehört sie dorthin.
 */
function TimePreview({ at, live, tz, line }: {
  /** Der anzuzeigende Zeitpunkt, gerechnet aus „jetzt" — als Funktion, damit der Takt hier bleibt
   *  und nicht das ganze Formular neu rendert. */
  at: (nowMs: number) => Date;
  /** Hängt der Wert an der laufenden Uhr? Ohne das tickt die Zeile nicht. */
  live: boolean;
  tz: string;
  /**
   * Der fertige Satz. Bewusst beim Aufrufer: die Endzeile nennt zusätzlich die Mindest-Haltezeit,
   * die Beginn-Zeile nicht — ein zweiter Schlüssel plus optionale Parameter hätte die Fallunterscheidung
   * bloss in dieses Bauteil verschoben, das von Haltezeiten nichts wissen muss.
   */
  line: (formatted: string, nowMs: number) => string;
}) {
  const locale = useLocale();
  useTick(live ? 60_000 : 0);

  const nowMs = Date.now();
  const date = at(nowMs);
  // Ein halb getipptes Datum ist kein Fehler, sondern ein Zwischenstand — dann steht hier nichts,
  // statt „Ende: Invalid Date".
  if (Number.isNaN(date.getTime())) return null;

  return (
    <p className="text-xs font-medium text-foreground-muted tabular-nums" suppressHydrationWarning>
      {line(formatDateTime(date, toDateLocale(locale), tz), nowMs)}
    </p>
  );
}
