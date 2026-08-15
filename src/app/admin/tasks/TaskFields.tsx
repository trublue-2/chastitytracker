"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal, formatDateTime, formatElapsedMs, toDateLocale } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";
import DateTimePicker from "@/app/components/DateTimePicker";
import DurationInput from "@/app/components/DurationInput";
import FieldLabel from "@/app/components/FieldLabel";
import FieldTabs from "@/app/components/FieldTabs";
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
  TASK_DEFAULT_START_GRACE_MIN, TASK_START_GRACE_RANGE, clampStartGrace, clampHoldDuration,
  durationToHours, durationFromHours, type DurationUnit,
} from "@/lib/constants";
import { minHoldMs, startDeadline } from "@/lib/tasks";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import type { TaskRequirementInput, TaskProofInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import TaskProofPicker from "./TaskProofPicker";

/** Schnellwahl für die Endzeit, in Stunden. Das Modell kennt nur den absoluten Zeitpunkt (EINE
 *  Wahrheit); die Knöpfe rechnen ihn nur bequem aus — „trage den Knebel eine Viertelstunde" ist damit
 *  zwei Taps. Die kurzen Stufen stehen vorne, weil die langen ohnehin die getippten sind. */
const QUICK_HOURS = [0.25, 0.5, 1, 2, 4] as const;

/**
 * Woran die Frist hängt — die EINE Entscheidung des Frist-Blocks.
 *
 * `fromStart` und `duration` tragen dieselbe Zahl im selben Feld und unterscheiden sich nur im
 * Anker: ab dem ANLEGEN bzw. ab dem STELLEN. `datetime` ist der feste Termin.
 *
 * Vorher waren das zwei getrennte Bedienelemente — ein Ghost-Button für Dauer/Zeitpunkt und ein
 * Haken für den Anker, der UNTER dem Feld sass, das er umdeutete. Wer die Vorschau las, hatte die
 * Zahl schon falsch verstanden. Als ein Umschalter ist die Frage einmal gestellt und einmal
 * beantwortet.
 */
type HoldMode = "fromStart" | "duration" | "datetime";

/** Die Wege im Umschalter: Reihenfolge (vom häufigsten zum seltensten) und Beschriftung in EINER
 *  Liste. Getrennt geführt müssten sie synchron bleiben, ohne dass ein Auseinanderlaufen auffiele —
 *  ein fehlender Eintrag wäre ein Reiter ohne Namen, kein Fehler. */
const HOLD_MODES = [
  { value: "fromStart", labelKey: "holdModeFromStart" },
  { value: "duration", labelKey: "holdModeDuration" },
  { value: "datetime", labelKey: "holdModeDatetime" },
] as const satisfies readonly { value: HoldMode; labelKey: string }[];

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
  offenseType,
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
  /** Welche ART an dieser ref beurteilt wird — der Abschnitt, in dem geklickt wurde. Zwei Arten
   *  können sich eine ref teilen; ohne die Angabe stünde am Urteil die zuerst erkannte. */
  offenseType?: string;
  /** Vorbelegter Anlass — die Zeile des Vergehens, damit sie niemand abtippt. */
  initialPenaltyReason?: string;
}) {
  const t = useTranslations("tasks");
  // Die Einheiten stehen im gemeinsamen Namensraum, seit `DurationInput` sie braucht — die
  // Kulanzfrist hier holt sie von dort, sonst stünde in EINEM Formular zweimal dieselbe Einheit in
  // zwei Schreibweisen.
  const tc = useTranslations("common");
  const locale = useLocale();
  const apiError = useApiError();
  const router = useRouter();
  const holdUntilId = useId();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // „Tragezeit" ist die Vorgabe — bei einer Aufgabe mit Geräten ist eine TRAGEZEIT fast immer
  // gemeint, und nur dieser Weg hält die eingestellte Zahl auch ein. Ohne Bedingungen weicht die
  // Anzeige von selbst auf „Endet in" aus (siehe `effectiveMode`).
  const [mode, setMode] = useState<HoldMode>("fromStart");
  // Beide Zeit-Eingaben starten LEER — kein vorbelegter Wert.
  //
  // Vorbelegt waren hier zwei Stunden, und genau das war der Fehler: wer die Frist übersah, stellte
  // sie trotzdem, ohne sie je gewählt zu haben (Rückmeldung 06.08.2026 — „ich schaffe keine 2 Stunden
  // Knebel"). Ein Vorschlagswert ist harmlos, wo er nur bequem ist; hier ist er die Aussage, wie lange
  // ein anderer Mensch etwas auszuhalten hat. Die soll bewusst getroffen werden, nicht durchgewinkt.
  // Durchgesetzt wird das über `required` an beiden Feldern, nicht durch eine Prüfung beim Absenden.
  const [hours, setHours] = useState("");
  const [holdUnit, setHoldUnit] = useState<DurationUnit>("h");
  const [holdUntil, setHoldUntil] = useState("");
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

  // Die eine Frage, an der in diesem Formular vier Dinge hängen: Beschriftung, Hinweis, Kulanz-Block
  // und das abgeschickte Feld. Ausgeschrieben stünde sie viermal da und müsste viermal zusammen
  // geändert werden. Es ist dieselbe Unterscheidung, die `taskDeadlineLine` auf der Anzeige-Seite und
  // `checkTask` auf der Server-Seite treffen: gibt es überhaupt etwas anzulegen?
  const hasRequirements = requirements.length > 0;

  /**
   * Der WIRKSAME Weg — `mode` ist die Wahl der Keyholderin, dies ihre Anwendung.
   *
   * „Tragezeit" braucht mindestens eine Bedingung: ohne sie gibt es kein Anlegen, an dem die Uhr
   * starten könnte, und der Server weist das mit `TASK_HOLD_DURATION_WITHOUT_REQUIREMENTS` ab. Leert
   * jemand die Bedingungen wieder, fällt die ANZEIGE auf „Endet in" zurück — die Wahl selbst bleibt
   * aber stehen und kommt zurück, sobald wieder eine Bedingung da ist. Sie stillschweigend zu
   * verwerfen hiesse, eine Entscheidung zu kassieren, die niemand zurückgenommen hat.
   */
  const effectiveMode = mode === "fromStart" && !hasRequirements ? "duration" : mode;
  const fromStartActive = effectiveMode === "fromStart";

  // Die Endzeit aus dem gerade gewählten Reiter — EINE Rechnung für Vorschau und Absenden. Zwei
  // getrennte Fassungen wären genau die Sorte Abweichung, die die Vorschau widerlegen soll: sie
  // verspräche eine Zeit, die das Formular dann anders abschickt.
  //
  // Ein leeres Feld ergibt bewusst ein UNGÜLTIGES Datum und keinen Ersatzwert: die Vorschau zeigt
  // dann nichts, statt eine Zeit zu nennen, die niemand gewählt hat.
  //
  // „Tragezeit" rechnet wie „Endet in": beide tragen eine DAUER im selben Feld. Der Unterschied ist
  // nicht die Rechnung, sondern woran sie hängt — und das entscheidet erst das Abschicken.
  function endAt(nowMs: number): Date {
    return effectiveMode !== "datetime"
      ? new Date(nowMs + durationToHours(parseFloat(hours), holdUnit) * 3600_000)
      : fromDatetimeLocal(holdUntil, tz);
  }

  /**
   * Den Weg wechseln — und dabei den Wert MITNEHMEN.
   *
   * Wer „endet in 2 h" eingestellt hat und den Zeitpunkt öffnet, will ihn dort feinjustieren, nicht
   * neu suchen: der Wähler startet deshalb auf dem gerade angezeigten Ende. Ohne das stünde dort der
   * beim Seitenaufruf vorbelegte Wert — nach zehn Minuten Formularausfüllen zehn Minuten zu früh.
   *
   * Zwischen „Tragezeit" und „Endet in" ist gar nichts umzurechnen: beide halten dieselbe Zahl im
   * selben Feld, nur der Anker ist ein anderer. Übertragen wird deshalb nur beim Wechsel VON oder ZU
   * einem festen Zeitpunkt.
   */
  function switchMode(next: HoldMode) {
    // Schlichte Funktion statt setState-Updater (Vorbild: `switchUnit` in `DurationInput`):
    // `mode` steht im Closure, und ein Updater muss REIN sein — unter StrictMode liefe er im Dev
    // zweimal und setzte die Endzeit zweimal mit unterschiedlichem `Date.now()`.
    if (next === effectiveMode) return;
    const nowMs = Date.now();
    const end = endAt(nowMs);
    // Noch nichts eingegeben (oder ein halb getipptes Datum): dann gibt es keine Zeit mitzunehmen —
    // umgeschaltet wird trotzdem. Früher brach der Wechsel hier ganz ab, was mit dem leeren Startwert
    // hiesse: der Weg zum festen Zeitpunkt wäre nur über eine erst eingetippte Dauer erreichbar.
    const known = !Number.isNaN(end.getTime());
    if (known && next === "datetime") setHoldUntil(toDatetimeLocal(end, tz));
    // Auf das Raster der Einheit gebracht, damit im Feld nicht „2.3833" landet.
    if (known && effectiveMode === "datetime") {
      setHours(String(durationFromHours((end.getTime() - nowMs) / 3600_000, holdUnit)));
    }
    setMode(next);
  }

  // Geklemmt wie im Service — mit derselben Funktion, damit die Vorschau denselben Wert zeigt, den
  // der Server am Ende schreibt.
  const graceEffective = clampStartGrace(parseFloat(graceMin));
  const holdDurationMin = clampHoldDuration(durationToHours(parseFloat(hours), holdUnit) * 60);
  /**
   * Die Beschriftung des Zahlenfeldes — sie benennt, WAS die Zahl ist.
   *
   * Im Weg „Tragezeit" ist das die Aussage, auf die es ankommt, und sie steht deshalb noch einmal
   * hier: die Zahl IST die Tragezeit. In den beiden anderen Wegen ist sie schlicht eine Dauer bzw.
   * ein Zeitpunkt — den WEG nennt der Umschalter darüber, und ihn hier zu wiederholen ergäbe zwei
   * Beschriftungen für dieselbe Sache („Frist · Endet in · Endet in").
   */
  const holdFieldLabel = t(fromStartActive ? "holdModeFromStart" : "holdFieldDuration");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const until = endAt(Date.now());
    // Über die Oberfläche unerreichbar (beide Eingabewege sind `required`), aber `toISOString()`
    // wirft auf einem ungültigen Datum — und das wäre statt einer Fehlermeldung ein Absturz.
    if (Number.isNaN(until.getTime())) return;

    // Keine eigene Frist-Prüfung hier: der Service verlangt mehr als „in der Zukunft" — die Endzeit
    // muss hinter der Kulanzfrist liegen, sonst wäre die Aufgabe gar nicht erst zu beginnen. Eine
    // zweite, schwächere Schranke im Formular liesse genau die Eingaben durch, die der Server danach
    // mit einer anderen Begründung abweist. `TASK_HOLD_UNTIL_TOO_SOON` kommt über
    // `parseApiErrorCode` übersetzt zurück und landet in derselben Fehlerzeile.
    void submit({
      userId,
      title: title.trim(),
      description: description.trim() || undefined,
      // Im Dauer-Modus schickt das Formular KEINEN Endzeitpunkt: er ist dort abgeleitet, und ein
      // mitgeschickter würde entweder ignoriert (dann steht er sinnlos in der Anfrage) oder
      // widerspräche der Dauer. Der Server rechnet ihn aus Kulanz + Dauer.
      holdUntil: fromStartActive ? undefined : until.toISOString(),
      holdDurationMin: fromStartActive ? holdDurationMin : undefined,
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
      // die Query — umbenannt fiele die Aufgabe sonst still auf „gewöhnlich" zurück. Die ART reist
      // mit, weil sich zwei Vergehen eine ref teilen können und sonst die zuerst erkannte am Urteil
      // stünde statt der geklickten.
      [TASK_FORM_QUERY.offenseRef]: offenseRef,
      [TASK_FORM_QUERY.offenseType]: offenseType,
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

      {/* DER FRIST-BLOCK — eine Entscheidung, dann ihr Feld, dann die beiden Zahlen als Paar.
          Die Reihenfolge ist die Korrektur des alten Aufbaus: der Anker („ab dem Stellen" oder „ab
          dem Anlegen") hing an einem Haken UNTER dem Zahlenfeld und unter der Vorschau, die er
          umdeutete — wer die Vorschau las, hatte die Zahl schon falsch verstanden.
          Die Wahl steht deshalb ganz oben, und die Feld-Beschriftung darunter nennt sie noch einmal
          beim Namen („Tragezeit" gegen „Endet in").
          Die Rückmeldung vom 03.08.2026 („zuerst der Beginn, dann das Ende") trägt jetzt der
          zusammenfassende Satz am Fuss des Blocks: er erzählt die Sache in ihrer zeitlichen Ordnung,
          während die Eingaben in der Ordnung stehen, in der man sie trifft. */}
      <div className="flex flex-col gap-3">
        <FieldTabs
          label={t("holdModeLabel")}
          value={effectiveMode}
          options={HOLD_MODES.filter((m) => m.value !== "fromStart" || hasRequirements)
            .map((m) => ({ value: m.value, label: t(m.labelKey) }))}
          onChange={switchMode}
        />

        {effectiveMode !== "datetime" ? (
          <>
            <DurationInput
              label={holdFieldLabel}
              ariaLabel={holdFieldLabel}
              value={hours}
              unit={holdUnit}
              onChange={(value, unit) => {
                setHours(value);
                setHoldUnit(unit);
                // Wer unter dem AUSWEICH-Weg tippt, hat ihn damit gewählt.
                //
                // Ohne diese Zeile deutet das Formular seine eigene Zahl um: „Tragezeit" ist die
                // Vorgabe, mangels Bedingungen zeigt der Umschalter aber „Endet in". Wird danach
                // eine Bedingung ergänzt, schnappt die Anzeige auf „Tragezeit" zurück — und aus
                // „2 Stunden bis Schluss" wären unbemerkt „2 Stunden Tragezeit" geworden. Das ist
                // dieselbe stille Umdeutung, gegen die dieser ganze Block gebaut ist.
                if (mode === "fromStart" && !hasRequirements) setMode("duration");
              }}
              required
            />
            {/* Die Knöpfe setzen die Dauer in der GERADE gewählten Einheit — auf „Minuten" gestellt
                trägt „1 h" also 60 ein, nicht 1. Sonst hiesse derselbe Knopf je nach Umschalter etwas
                anderes. */}
            <div className="flex flex-wrap gap-2">
              {QUICK_HOURS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setHours(String(durationFromHours(h, holdUnit)))}
                >
                  {h < 1 ? t("quickMinutes", { minutes: durationFromHours(h, "min") }) : t("quickHours", { hours: h })}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Bewusst `FieldLabel` und nicht das `label`-Prop des Wählers: dessen Beschriftung ist
                versal und fett (eine FELD-Beschriftung), hier soll dieselbe leise Gruppen-Beschriftung
                stehen wie im anderen Zweig — sonst springt der Block beim Umschalten optisch. */}
            <FieldLabel htmlFor={holdUntilId} required>{t("holdFieldDatetime")}</FieldLabel>
            <DateTimePicker
              id={holdUntilId}
              value={holdUntil}
              onChange={(e) => setHoldUntil(e.target.value)}
              min={minNow}
              hint={t("holdUntilTzHint", { tz })}
              required
            />
          </>
        )}

        {/* Die zweite Zahl, direkt unter der ersten: „wie lange" und „bis wann anlegen" gehören
            zusammen und standen bisher in getrennten Blöcken mit verschiedenen Bauteilen. Nur mit
            Bedingungen — ohne sie gibt es nichts anzulegen, und die Kulanzfrist ist ohne Bedeutung. */}
        {hasRequirements && (
          <HoursInput
            label={t("graceLabel")}
            value={graceMin}
            onChange={setGraceMin}
            min={TASK_START_GRACE_RANGE.min}
            step={5}
            unit={tc("minutesUnit")}
          />
        )}

        {/* DER ZUSAMMENFASSENDE SATZ — die Sache in ihrer zeitlichen Ordnung, in EINER Zeile.
            Dieselbe Rechnung wie auf der Karte des Subs (`startDeadline`), damit die Vorschau nicht
            das eine verspricht und die Karte danach das andere anzeigt. Immer live: die Kulanz läuft
            ab dem Stellen, ihr Ende wandert also mit jeder Minute Formularausfüllen mit. */}
        {hasRequirements && (
          <TimePreview
            at={(nowMs) => startDeadline({ createdAt: new Date(nowMs), startGraceMin: graceEffective })}
            live
            tz={tz}
            line={(date) => ({
              text: fromStartActive && holdDurationMin != null
                ? t("previewFromStart", { date, duration: formatElapsedMs(holdDurationMin * 60_000, locale) })
                : t("previewStart", { date }),
            })}
          />
        )}

        {/* Die MINDEST-Haltezeit steht dabei, weil die Stundenzahl gerade NICHT die Haltezeit ist: die
            Kulanz geht davon ab. Ohne sie liest sich beides wie zwei aufeinanderfolgende Spannen
            („30 Min. + 2 h"), und das wäre eine halbe Stunde zu viel.

            Der Takt hängt an BEIDEM: bei einer Dauer wandert schon das Datum mit der Uhr, bei einem
            festen Zeitpunkt steht es zwar still — die Mindest-Haltezeit darunter schrumpft aber
            trotzdem, weil die Kulanzfrist ab jetzt läuft. Nur auf den Modus zu schauen liesse genau
            diese Zahl stehen, bis das Formular aus einem anderen Grund neu rendert.

            Im Weg „Tragezeit" entfällt sie ganz: dort IST die eingestellte Zahl die Haltezeit, und
            eine zweite Zeile, die sie noch einmal ausrechnet, hätte nichts zu berichtigen. */}
        {!fromStartActive && (
        <TimePreview
          at={endAt}
          live={effectiveMode !== "datetime" || hasRequirements}
          tz={tz}
          line={(date, nowMs) => {
            // Über `minHoldMs` und nicht per eigener Rechnung: die Vorschau zeigt damit dieselbe
            // Grösse, gegen die der Server prüft (`TASK_HOLD_UNTIL_TOO_SOON`) und die der Sub auf
            // seiner Karte liest.
            const holdMs = minHoldMs({
              createdAt: new Date(nowMs),
              startGraceMin: graceEffective,
              holdUntil: endAt(nowMs),
            });
            if (!hasRequirements) return { text: t("previewEnd", { date }) };
            // Ein Wert ≤ 0 ist der widersprüchliche Fall: die Aufgabe wäre im Moment des Stellens
            // schon vorbei, bevor überhaupt begonnen sein muss — der Server weist sie mit
            // `TASK_HOLD_UNTIL_TOO_SOON` ab. Seit die Frist Viertelstunden erlaubt, ist das keine
            // Ausnahme mehr, sondern zwei Taps entfernt („15 min" gegen die 30 Minuten Kulanz).
            // Deshalb steht der Widerspruch HIER, wo beide Zahlen sichtbar sind, statt als 400er nach
            // dem Absenden — die Vorschau hat ihn ohnehin schon gerechnet.
            return holdMs > 0
              ? { text: t("previewEndHold", { date, duration: formatElapsedMs(holdMs, locale) }) }
              : { text: t("previewEndTooSoon", { date }), warn: true };
          }}
        />
        )}

        {/* Der Satz trägt das, was sonst nirgends steht: woran die Uhr hängt und was passiert, wenn
            zu spät angelegt wird. Für die reine Textaufgabe stand hier „Bis dahin zu erledigen." —
            dieselbe Aussage wie die Beschriftung und die Vorschau darüber, also dreimal dasselbe. */}
        {hasRequirements && (
          <p className="text-xs text-foreground-faint">
            {t(fromStartActive ? "holdFromStartHint" : "holdUntilHintRequirements")}
          </p>
        )}
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
 * berechnet. Dasselbe gilt für die noch leere Eingabe: dann gibt es keinen Zeitpunkt, die Zeile
 * zeigt nichts, und ein Takt hätte nichts zu aktualisieren — deshalb hängt er auch an der GÜLTIGKEIT
 * und nicht nur am Modus. `suppressHydrationWarning` wie bei jedem anderen Uhr-Anzeiger der App
 * (siehe `HoldRemaining`) — der Server kennt die Uhr des Betrachters nicht.
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
   * Der fertige Satz, dazu ob er ein WIDERSPRUCH ist. Bewusst beim Aufrufer: die Endzeile nennt
   * zusätzlich die Mindest-Haltezeit und kann in sich unmöglich werden, die Beginn-Zeile nicht — ein
   * zweiter Schlüssel plus optionale Parameter hätte die Fallunterscheidung bloss in dieses Bauteil
   * verschoben, das von Haltezeiten nichts wissen muss.
   */
  line: (formatted: string, nowMs: number) => { text: string; warn?: boolean };
}) {
  const locale = useLocale();

  const nowMs = Date.now();
  const date = at(nowMs);
  // Ein halb getipptes oder noch leeres Feld ist kein Fehler, sondern ein Zwischenstand — dann steht
  // hier nichts, statt „Ende: Invalid Date".
  const valid = !Number.isNaN(date.getTime());
  useTick(live && valid ? 60_000 : 0);
  if (!valid) return null;

  const { text, warn } = line(formatDateTime(date, toDateLocale(locale), tz), nowMs);
  return (
    <p
      className={`text-xs font-medium tabular-nums ${warn ? "text-warn-text" : "text-foreground-muted"}`}
      suppressHydrationWarning
    >
      {text}
    </p>
  );
}
