"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toDatetimeLocal, fromDatetimeLocal, formatElapsedMs } from "@/lib/utils";
import useTick from "@/app/hooks/useTick";
import DateTimePicker from "@/app/components/DateTimePicker";
import DurationInput from "@/app/components/DurationInput";
import FieldLabel from "@/app/components/FieldLabel";
import FieldTabs from "@/app/components/FieldTabs";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import HoursInput from "@/app/components/HoursInput";
import ScheduleFields, { initialSchedule, scheduleAnchorLive, scheduleAnchorMs, scheduleIsPast, schedulePayload, type ScheduleValue } from "@/app/components/ScheduleFields";
import Textarea from "@/app/components/Textarea";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import TimePreview from "./TimePreview";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useEntrySubmit } from "@/app/hooks/useEntrySubmit";
import { useApiError } from "@/app/hooks/useApiError";
import {
  TASK_TITLE_MAX_LENGTH, TASK_DESCRIPTION_MAX_LENGTH,
  TASK_DEFAULT_START_GRACE_MIN, TASK_START_GRACE_RANGE, clampStartGrace, startGraceFromClock, clampHoldDuration,
  DURATION_UNITS, durationToHours, durationFromHours, type DurationUnit,
} from "@/lib/constants";
import { minHoldMs, startDeadline } from "@/lib/tasks";
import { TASK_FORM_QUERY } from "@/lib/entryFormRoute";
import type { TaskRequirementInput, TaskProofInput } from "@/lib/taskService";
import TaskRequirementPicker, { type PickerCategory } from "./TaskRequirementPicker";
import TaskProofPicker from "./TaskProofPicker";

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
 * Wie der SPÄTESTE BEGINN eingegeben wird — dieselbe Frage in zwei Sprachen.
 *
 * Gespeichert wird in beiden Wegen eine Minutenzahl ab dem Nullpunkt der Aufgabe. „Dauer" ist der
 * bisherige Weg, „Uhrzeit" die Angabe, die die Keyholderin ohnehin im Kopf hat („bis 18:00 liegt
 * alles an") und heute selbst ausrechnen müsste — bei einer terminierten Aufgabe gegen einen
 * Nullpunkt, der noch gar nicht da ist.
 */
type GraceMode = "duration" | "clock";

/**
 * Das Raster des Zahlenfeldes (Minuten) — Schrittweite UND Rundung beim Übertragen aus der Uhrzeit.
 *
 * Beides aus EINER Konstante, weil es dieselbe Zusage ist: ein `<input type="number">` weist jeden
 * Wert ab, der nicht auf seinem `step` liegt. Eine aus „18:07" errechnete 247 stünde damit zwar im
 * Feld, das Formular liesse sich aber nicht mehr absenden — und die Browser-Meldung („die nächsten
 * gültigen Werte sind 245 und 250") erklärt niemandem, woher die Zahl kommt.
 *
 * Genommen wird das Minuten-Raster der Dauer-Eingabe darüber, damit die beiden Zahlenfelder
 * desselben Formulars auf demselben Gitter liegen. Nur `step`, nicht `min`: die Kulanz darf 0 sein
 * („sofort anlegen"), eine Haltedauer nicht.
 */
const GRACE_STEP_MIN = DURATION_UNITS.min.step;

/**
 * Formular „Aufgabe stellen".
 *
 * Der Aufbau folgt `VerschlussAnforderungFields` (Umschalter, Zeitwahl, Nachricht), auch bei der
 * Zeitwahl: EIN `FieldTabs` über den Wegen, darunter das Feld des gewählten.
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
  // Die Meldung „Zeitpunkt muss in der Zukunft liegen" gehört zur Terminierung und steht deshalb im
  // `admin`-Namensraum, wo sie sich alle Direktiv-Formulare teilen.
  const ta = useTranslations("admin");
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
  // Der späteste Beginn — die Zahl wie bisher, dazu der Eingabeweg und die Uhrzeit-Fassung.
  // „Dauer" ist die Vorgabe: sie ist der Bestandsweg und die einzige der beiden Angaben, die auch
  // ohne Blick auf die Uhr richtig bleibt, wenn das Formular eine Weile offen liegt.
  const [graceMode, setGraceMode] = useState<GraceMode>("duration");
  const [graceMin, setGraceMin] = useState(String(TASK_DEFAULT_START_GRACE_MIN));
  // Leer, nicht vorbelegt: gefüllt wird beim Umschalten aus der Zahl daneben (siehe
  // `switchGraceMode`). Ein beim Seitenaufruf gesetzter Zeitpunkt wäre nach zehn Minuten
  // Formularausfüllen zehn Minuten zu früh.
  const [graceAt, setGraceAt] = useState("");
  const [requirements, setRequirements] = useState<TaskRequirementInput[]>([]);
  const [proofs, setProofs] = useState<TaskProofInput[]>([]);
  // Vorgabe „an", wie bisher: die Reihenfolge war bis dahin immer gefordert, und der strengere Weg
  // ist der, den niemand versehentlich wählt.
  const [proofOrderMatters, setProofOrderMatters] = useState(true);
  // Aus dem Strafbuch heraus ist beides gesetzt und der Haken bleibt sichtbar: der Keyholder soll
  // sehen, dass er gerade eine Strafe stellt — nicht bloss eine Aufgabe, die zufällig so heisst.
  const [isPunishment, setIsPunishment] = useState(!!offenseRef);
  const [penaltyReason, setPenaltyReason] = useState(initialPenaltyReason ?? "");
  // Terminierung — dasselbe Bauteil und dieselben zwei Felder wie an der Verschluss-Anforderung.
  // Die Vorschauen darüber hängen daran: ihr Nullpunkt ist bei einer terminierten Aufgabe der
  // Auslöse-Zeitpunkt, nicht „jetzt" (siehe `anchorMs`). Die eingestellten DAUERN bleiben, was sie
  // sind — mit verschieben sich die genannten Uhrzeiten.
  const [schedule, setSchedule] = useState<ScheduleValue>(() => initialSchedule(minNow, tz));
  // Absende-Mechanik (saving/error/networkError/finally) über den geteilten Hook — sie war in den
  // Anforderungs-Formularen schon zweimal von Hand geschrieben.
  const { saving, error, setError, submit } = useEntrySubmit<Record<string, unknown>>(
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
      ? new Date(anchorMs(nowMs) + durationToHours(parseFloat(hours), holdUnit) * 3600_000)
      : fromDatetimeLocal(holdUntil, tz);
  }

  /**
   * EINE Uhr für alle Vorschauen dieses Formulars.
   *
   * Vorher taktete jede für sich, mit einem Intervall ab ihrem eigenen Einbau. Zwei Zeilen, die
   * denselben Zeitpunkt meinen („Fällig um …" über „Endet um …"), konnten dadurch bis zu eine Minute
   * lang auseinanderliegen — die Vorschau widerlegte sich selbst. Getaktet wird nur, wenn überhaupt
   * etwas an der laufenden Uhr hängt: ein fester Nullpunkt mit festem Ende bewegt sich nicht.
   */
  const anchorLive = scheduleAnchorLive(schedule, tz);
  const previewLive = anchorLive || hasRequirements || effectiveMode !== "datetime";
  useTick(previewLive ? 60_000 : 0);
  const nowMs = Date.now();

  /** Der Nullpunkt der Aufgabe: bei einer terminierten ihr Auslöse-Zeitpunkt, sonst „jetzt". Die
   *  Dauer-Eingaben und beide Vorschauen hängen daran — sonst verspräche das Formular eine Spanne
   *  ab dem Ausfüllen, während der Server sie ab dem Auslösen misst. */
  function anchorMs(nowMs: number): number {
    return scheduleAnchorMs(schedule, tz, nowMs);
  }

  /**
   * Der späteste Beginn als MINUTENZAHL — das gespeicherte Feld, aus welchem Weg auch immer.
   *
   * `null` heisst: die eingegebene Uhrzeit taugt nicht als Frist (leer, halb getippt, vor dem
   * Nullpunkt oder weiter als der erlaubte Bereich danach). Das Feld zeigt dann eine Meldung, die
   * Vorschauen zeigen nichts, und das Absenden bricht ab — geklemmt wird eine Uhrzeit nicht.
   *
   * Nimmt den NULLPUNKT entgegen, nicht „jetzt": derselbe Wert geht danach als `createdAt` in die
   * Vorschau-Rechnung, und aus zwei getrennten Messungen könnten zwei verschiedene Nullpunkte
   * werden — dieselbe Zusage wie das eine `nowMs` beim Absenden. Die Minutenzahl hinter einer festen
   * Uhrzeit schrumpft dabei mit jeder Minute Formularausfüllen, solange die Aufgabe sofort wirkt.
   */
  function graceMinAt(anchor: number): number | null {
    if (graceMode === "duration") return clampStartGrace(parseFloat(graceMin));
    return startGraceFromClock(fromDatetimeLocal(graceAt, tz).getTime(), anchor);
  }

  /**
   * Den Eingabeweg des spätesten Beginns wechseln — und dabei den Wert MITNEHMEN. Zusage und
   * Begründung wie bei {@link switchMode} eine Frage tiefer: umgerechnet, nie umgedeutet.
   *
   * Gelesen wird über `graceMinAt` im NOCH gültigen Modus — dieselbe Ableitung, die auch Vorschau
   * und Absenden benutzen. Aus dem Dauer-Modus kommt sie nie leer zurück (eine leere Eingabe wird
   * zur Vorgabe, also zu dem Wert, den das Absenden ohnehin schicken würde); aus dem Uhrzeit-Modus
   * schon — dann bleibt die getippte Zahl stehen, weil es nichts zu übertragen gibt.
   *
   * Aufs Raster gebracht wird nur in Richtung Zahlenfeld ({@link GRACE_STEP_MIN}), und AUFgerundet
   * aus demselben Grund wie in `startGraceFromClock`: abgerundet würden aus zwei Minuten null —
   * „sofort anlegen" und damit strenger als die gewählte Uhrzeit.
   */
  function switchGraceMode(next: GraceMode) {
    if (next === graceMode) return;
    const anchor = anchorMs(Date.now());
    const minutes = graceMinAt(anchor);
    if (minutes != null) {
      if (next === "clock") setGraceAt(toDatetimeLocal(new Date(anchor + minutes * 60_000), tz));
      else setGraceMin(String(Math.ceil(minutes / GRACE_STEP_MIN) * GRACE_STEP_MIN));
    }
    setGraceMode(next);
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
      // Gegen den NULLPUNKT zurückrechnen, nicht gegen „jetzt" — sonst käme aus einem festen
      // Zeitpunkt bei einer terminierten Aufgabe die Wartezeit oben drauf.
      setHours(String(durationFromHours((end.getTime() - anchorMs(nowMs)) / 3600_000, holdUnit)));
    }
    setMode(next);
  }

  const holdDurationMin = clampHoldDuration(durationToHours(parseFloat(hours), holdUnit) * 60);
  /**
   * Die Beschriftung des Zahlenfeldes — sie benennt, WAS die Zahl ist.
   *
   * Sie nennt dabei den ANKER, den der Reiter darüber nicht nennen kann: „Tragezeit ab dem Anlegen"
   * gegen „Dauer ab jetzt". Genau darin unterscheiden sich die beiden Wege — dieselbe Zahl im selben
   * Feld, nur ab einem anderen Zeitpunkt gerechnet —, und ohne diesen Zusatz liest sich „Endet in
   * 1 h" wie eine Zusage über eine Stunde Tragezeit. Das war der ursprüngliche Vorfall.
   *
   * Eigene Schlüssel und nicht die des Umschalters: der Reiter muss auf 420 px in eine Zeile mit zwei
   * weiteren passen und bleibt deshalb kurz. Die Beschriftung darunter hat den Platz.
   */
  const holdFieldLabel = t(fromStartActive ? "holdFieldFromStart" : "holdFieldDuration");

  /**
   * Die Meldung zu einer unbrauchbaren Uhrzeit — EIN Satz für zwei Anlässe.
   *
   * Er steht am Feld, sobald die Uhrzeit nicht mehr passt, UND in der Fehlerzeile, wenn trotzdem
   * abgeschickt wird. Am Feld allein wäre er zu leise: die Terminierung steht UNTER dem Block, und
   * wer sie nachträglich verschiebt, schöbe damit den Nullpunkt unter einer Uhrzeit weg, die er
   * schon gewählt hat — die Vorschauen verschwänden wortlos.
   */
  const graceClockError = t("graceClockInvalid", { hours: TASK_START_GRACE_RANGE.max / 60 });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleIsPast(schedule, tz)) {
      setError(ta("scheduleFutureRequired"));
      return;
    }
    // EIN „jetzt" für alles, was diese Absendung ausrechnet: Frist-Ende und Kulanz hängen beide am
    // Nullpunkt, und zwei Messungen könnten über eine Minutengrenze fallen.
    const nowMs = Date.now();
    const until = endAt(nowMs);
    // Ohne Bedingungen gibt es nichts anzulegen — dann wird auch keine Kulanz geschickt und keine
    // geprüft. `null` heisst dagegen: es gibt eine, aber die eingegebene Uhrzeit taugt nicht.
    const grace = hasRequirements ? graceMinAt(anchorMs(nowMs)) : undefined;
    if (grace === null) {
      setError(graceClockError);
      return;
    }
    // Leere Zeilen fallen weg: eine angelegte, aber nie ausgefüllte Nachweis-Zeile ist ein Versehen,
    // keine Forderung — der Service wiese sie sonst mit einem Fehler ab.
    const proofRows = proofs.filter((p) => p.description.trim());
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
      startGraceMin: grace,
      requirements,
      proofs: proofRows,
      // Ohne Nachweise gibt es keine Reihenfolge — dann auch keine Aussage darüber. Sonst stünde an
      // einer Aufgabe ganz ohne Fotos ein „Reihenfolge egal", das niemand mehr sehen oder umstellen
      // kann: der Schalter ist in diesem Zustand nicht einmal sichtbar.
      proofOrderMatters: proofRows.length > 0 ? proofOrderMatters : undefined,
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
      ...schedulePayload(schedule, tz),
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
          <DurationInput
            label={holdFieldLabel}
            ariaLabel={holdFieldLabel}
            value={hours}
            unit={holdUnit}
            onChange={(value, unit) => {
              setHours(value);
              setHoldUnit(unit);
              // Wer unter dem AUSWEICH-Weg tippt (oder eine Schnellwahl drückt), hat ihn damit
              // gewählt.
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
        ) : (
          <>
            {/* Bewusst `FieldLabel` und nicht das `label`-Prop des Wählers: dessen Beschriftung ist
                versal und fett (eine FELD-Beschriftung), hier soll dieselbe leise Gruppen-Beschriftung
                stehen wie im anderen Zweig — sonst springt der Block beim Umschalten optisch. */}
            <FieldLabel htmlFor={holdUntilId} required>{tc("pointInTime")}</FieldLabel>
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
          <>
            {/* Derselbe Umschalter wie über der Frist, eine Frage tiefer: die Beschriftung („Spätester
                Beginn") sagt WAS gemeint ist, die Reiter nur, in welcher Sprache es eingegeben wird.
                Deshalb trägt das Feld darunter keine zweite sichtbare Beschriftung — sie stünde in
                beiden Wegen wörtlich noch einmal da. */}
            <FieldTabs
              label={t("graceLabel")}
              value={graceMode}
              // Die zwei Wege stehen hier ausgeschrieben statt in einer Tabelle wie {@link HOLD_MODES}:
              // die Liste wird nicht gefiltert, und „Dauer" ist ein Allerweltswort, das der
              // gemeinsame Namensraum schon führt.
              options={[
                { value: "duration", label: tc("duration") },
                { value: "clock", label: t("graceModeClock") },
              ]}
              onChange={switchGraceMode}
            />
            {graceMode === "duration" ? (
              <HoursInput
                ariaLabel={t("graceLabel")}
                value={graceMin}
                onChange={setGraceMin}
                min={TASK_START_GRACE_RANGE.min}
                step={GRACE_STEP_MIN}
                unit={tc("minutesUnit")}
              />
            ) : (
              <DateTimePicker
                aria-label={t("graceLabel")}
                value={graceAt}
                onChange={(e) => setGraceAt(e.target.value)}
                // Die untere Schranke des Wählers ist „jetzt", nicht der Nullpunkt: bei einer
                // terminierten Aufgabe liegt der in der Zukunft und wandert mit der Terminierung
                // darunter. Die genaue Grenze zieht deshalb `startGraceFromClock` — sein Urteil
                // steht als Fehler am Feld, statt die Vorschauen nur verschwinden zu lassen.
                min={minNow}
                error={graceAt !== "" && graceMinAt(anchorMs(Date.now())) === null ? graceClockError : null}
                hint={t("holdUntilTzHint", { tz })}
                required
              />
            )}
          </>
        )}

        {/* DER ZUSAMMENFASSENDE SATZ — die Sache in ihrer zeitlichen Ordnung, in EINER Zeile.
            Dieselbe Rechnung wie auf der Karte des Subs (`startDeadline`), damit die Vorschau nicht
            das eine verspricht und die Karte danach das andere anzeigt. Immer live: die Kulanz läuft
            ab dem Stellen, ihr Ende wandert also mit jeder Minute Formularausfüllen mit. */}
        {hasRequirements && (
          <TimePreview
            at={(nowMs) => {
              const anchor = anchorMs(nowMs);
              const grace = graceMinAt(anchor);
              // Eine unbrauchbare Uhrzeit ergibt bewusst ein UNGÜLTIGES Datum — dieselbe Zusage wie
              // beim halb getippten Frist-Feld darüber: die Zeile zeigt dann nichts, statt einen
              // Beginn zu nennen, den so niemand gewählt hat. Den Vorwurf trägt das Feld selbst.
              return grace === null
                ? new Date(NaN)
                : startDeadline({ createdAt: new Date(anchor), startGraceMin: grace });
            }}
            nowMs={nowMs}
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
          nowMs={nowMs}
          tz={tz}
          line={(date, nowMs) => {
            // Ohne Bedingungen gibt es keine Haltezeit zu nennen — und mit einer unbrauchbaren
            // Uhrzeit keine, die stimmte. Das Ende steht in beiden Fällen fest und wird gezeigt.
            const anchor = anchorMs(nowMs);
            const grace = hasRequirements ? graceMinAt(anchor) : null;
            if (grace === null) return { text: t("previewEnd", { date }) };
            // Über `minHoldMs` und nicht per eigener Rechnung: die Vorschau zeigt damit dieselbe
            // Grösse, gegen die der Server prüft (`TASK_HOLD_UNTIL_TOO_SOON`) und die der Sub auf
            // seiner Karte liest.
            const holdMs = minHoldMs({
              createdAt: new Date(anchor),
              startGraceMin: grace,
              holdUntil: endAt(nowMs),
            });
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
            // Eigener Schlüssel und nicht der der Karte: dort steht der Anlass als ZEILE („Anlass:
            // zu spät"), hier ist es die Frage an ein leeres Feld. „Wofür" ist die Frage, „Anlass"
            // die Überschrift — dasselbe Wort für beides macht eines von beiden schlechter.
            label={t("penaltyReasonFieldLabel")}
            value={penaltyReason}
            onChange={(e) => setPenaltyReason(e.target.value)}
            placeholder={t("penaltyReasonPlaceholder")}
            maxLength={TASK_TITLE_MAX_LENGTH}
          />
        )}
      </div>

      <ScheduleFields
        value={schedule}
        onChange={setSchedule}
        minNow={minNow}
        delayHint={t("scheduleDelayHint")}
        atHint={t("scheduleAtHint")}
      />

      {/* NACH dem Frist-Block, nicht davor: eine Nachweis-Frist wird gegen das Ende der Aufgabe
          gemessen und an ihm gewarnt. Stand sie darüber, gab man sie ein, bevor es das Ende gab —
          die Vorschau konnte dann nichts nennen und die Warnung nicht greifen, und der fehlende
          Bezug musste als Fliesstext behauptet werden. Dieselben Funktionen wie die Vorschauen
          darüber, damit beide Zeilen dieselbe Uhrzeit nennen. */}
      <TaskProofPicker
        value={proofs}
        onChange={setProofs}
        orderMatters={proofOrderMatters}
        onOrderMattersChange={setProofOrderMatters}
        anchorMs={anchorMs}
        nowMs={nowMs}
        endAt={endAt}
        tz={tz}
      />

      <FormError message={error} variant="compact" />

      <Button type="submit" variant="primary" fullWidth loading={saving} icon={<ClipboardList size={16} />}>
        {saving ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
