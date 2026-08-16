"use client";

import { Camera, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import Button from "@/app/components/Button";
import Checkbox from "@/app/components/Checkbox";
import DurationInput from "@/app/components/DurationInput";
import Input from "@/app/components/Input";
import RemoveRowButton from "@/app/components/RemoveRowButton";
import ReorderButtons from "@/app/components/ReorderButtons";
import TimePreview from "./TimePreview";
import {
  TASK_PROOF_MAX, TASK_PROOF_DESCRIPTION_MAX_LENGTH,
  clampProofDueOffset, durationToHours, type DurationUnit,
} from "@/lib/constants";
import { swapAt } from "@/lib/utils";
import type { TaskProofInput } from "@/lib/taskService";

/** Der Bedienzustand EINES Frist-Feldes: die rohe Eingabe in der gerade gewählten Einheit. */
type Draft = { value: string; unit: DurationUnit };

/** Leeres Frist-Feld: „keine eigene Frist". Vorgabe-Einheit Stunden — eine Nachweis-Frist ist fast
 *  immer „in vier Stunden", nicht „in 240 Minuten". */
const EMPTY_DRAFT: Draft = { value: "", unit: "h" };

/** Der Tippstand einer Zeile, wie er aus ihrer gespeicherten Frist entsteht. EIN Ort für den Fall
 *  „noch keine Frist" — sonst hätte das Anlegen einer Zeile eine andere Vorgabe-Einheit als das
 *  Übernehmen einer bestehenden, und dasselbe Feld sähe je nach Weg anders aus. */
function toDraft(p: TaskProofInput): Draft {
  return p.dueOffsetMin == null ? EMPTY_DRAFT : { value: String(p.dueOffsetMin), unit: "min" };
}

/**
 * Die geforderten Nachweis-Fotos einer Aufgabe zusammenstellen (Issue #39).
 *
 * Bewusst eine geordnete LISTE mit Hinzufügen/Entfernen — anders als die Bedingungen, die eine
 * feste Antipp-Liste sind. Der Grund ist der Inhalt: Bedingungen kommen aus einer bekannten Menge
 * (die Kategorien des Subs), ein Nachweis ist Freitext. Und die REIHENFOLGE ist hier kein
 * Darstellungsdetail, sondern die eigentliche Forderung — deshalb ist sie sichtbar nummeriert
 * statt bloss implizit durch die Zeilenfolge.
 *
 * Ob sie auch GEFORDERT ist, entscheidet der Schalter darunter — die Nummerierung bleibt in beiden
 * Fällen, sie ist auch die Adresse eines Nachweises („Nachweis 2" in der Sichtung).
 */
export default function TaskProofPicker({
  value,
  onChange,
  orderMatters,
  onOrderMattersChange,
  anchorMs,
  nowMs,
  endAt,
  tz,
}: {
  value: TaskProofInput[];
  onChange: (next: TaskProofInput[]) => void;
  /** Müssen die Aufnahmezeiten der Nummerierung folgen? */
  orderMatters: boolean;
  onOrderMattersChange: (next: boolean) => void;
  /** Der NULLPUNKT der Aufgabe, ab dem jede eigene Frist zählt — bei einer terminierten Aufgabe ihr
   *  Auslöse-Zeitpunkt, sonst „jetzt". Reingereicht statt hier gerechnet: er hängt an der
   *  Terminierung, und die steht im Formular darüber. */
  anchorMs: (nowMs: number) => number;
  /** Die gemeinsame Uhr des Formulars — hier wird keine zweite gelesen und keine zweite getaktet
   *  (siehe {@link TimePreview}). */
  nowMs: number;
  /** Das Ende der Aufgabe — die obere Schranke jeder Nachweis-Frist. */
  endAt: (nowMs: number) => Date;
  /** Zeitzone des Subs: die Frist ist ein absoluter Zeitpunkt, gezeigt wird sie in SEINER Zone. */
  tz: string;
}) {
  const t = useTranslations("tasks");

  /**
   * Der Tippstand der Frist-Felder, roh und je Zeile — Zahl UND Einheit.
   *
   * Neben den Zeilen und nicht in ihnen: `TaskProofInput` ist die Form, die abgeschickt wird, und
   * dort steht die Frist als MINUTEN. Ein halb getipptes „1." oder die gewählte Einheit sind
   * Bedienzustand, kein Teil der Anforderung — in die Nutzlast geschrieben wären sie ein Feld, das
   * der Dienst wegwerfen müsste. Umgekehrt taugt die Minutenzahl nicht als Tippstand: aus „1." würde
   * beim Zurückrechnen sofort „1", und die Nachkommastelle wäre nicht eintippbar (derselbe Grund,
   * aus dem `DurationInput` seinen Wert roh beim Aufrufer lässt).
   *
   * Gesetzt wird er EINMAL aus den Zeilen (heute immer leer, aber ein vorbelegtes Formular bräuchte
   * genau das) und danach parallel zu ihnen gepflegt — Position für Position.
   */
  const [drafts, setDrafts] = useState<Draft[]>(() => value.map(toDraft));

  const update = (i: number, patch: Partial<TaskProofInput>) =>
    onChange(value.map((p, k) => (k === i ? { ...p, ...patch } : p)));

  /** Frist einer Zeile: Tippstand merken, Minuten committen. Ein leeres (oder unlesbares) Feld ist
   *  `null` — „keine eigene Frist", also offen bis zum Ende der Aufgabe. Es darf nicht auf eine
   *  geratene Zahl fallen: eine Frist, die niemand gewählt hat, erzeugt Versäumnisse. */
  function setDue(i: number, raw: string, unit: DurationUnit) {
    setDrafts(drafts.map((d, k) => (k === i ? { value: raw, unit } : d)));
    // Geklemmt wie im Dienst — mit DERSELBEN Funktion, damit das Formular den Wert schickt, den der
    // Server am Ende schreibt. Von Hand gerundet wiche die gespeicherte Frist still von der
    // eingetippten ab, sobald jemand Sekundenbruchteile oder eine unmögliche Zahl eingibt; und eine
    // getippte 0 heisst hier „keine Frist", nicht „eine Minute" (siehe `clampProofDueOffset`).
    update(i, { dueOffsetMin: clampProofDueOffset(durationToHours(parseFloat(raw), unit) * 60) ?? null });
  }

  /** Wann diese Frist abläuft — Nullpunkt der Aufgabe plus Versatz. */
  const dueAt = (nowMs: number, offsetMin: number) => new Date(anchorMs(nowMs) + offsetMin * 60_000);

  /**
   * Eine Zeile verschieben — Nachweis UND Tippstand, wie beim Entfernen.
   *
   * Die Nummer ist hier keine Zierde: sie ist die geforderte Reihenfolge der Aufnahmen, die Adresse
   * eines Nachweises in der Sichtung („Nachweis 2") und der Anker seiner eigenen Frist. Eine
   * Nummerierung, die etwas fordert, aber nur durch Löschen und Neutippen zu ändern ist, verlangt für
   * eine vertauschte Zeile die Neueingabe von Text, Code-Haken und Frist.
   *
   * Die FRIST wandert bewusst MIT der Zeile: sie gehört zu diesem Nachweis, nicht zu diesem Platz.
   * Bliebe sie stehen, tauschte ein Verschieben still zwei Fristen — und genau davon würde niemand
   * etwas merken, bis der Sub die falsche Frist verpasst.
   */
  function move(i: number, dir: -1 | 1) {
    setDrafts(swapAt(drafts, i, i + dir));
    onChange(swapAt(value, i, i + dir));
  }

  // Der Schalter erscheint, sobald es überhaupt einen Nachweis gibt — und NUR dann sagt der Hinweis
  // darunter etwas anderes. Beide hängen an derselben Bedingung: ein Text, der eine Regel verkündet,
  // deren Schalter gerade nicht sichtbar ist, wäre eine Aussage ohne Bedienung.
  const orderConfigurable = value.length > 0;
  const orderOff = orderConfigurable && !orderMatters;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-foreground-faint">{t("proofsLabel")}</span>

      {value.length > 0 && (
        <div className="rounded-xl border border-border divide-y divide-border-subtle overflow-hidden">
          {value.map((p, i) => {
            // Einmal verengt statt zweimal gecastet: die Prüfung unten verliert die Verengung
            // aus `p.dueOffsetMin != null` sonst in den Closures der Vorschau.
            const dueOffsetMin = p.dueOffsetMin ?? null;
            return (
            <div key={i} className="p-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                {/* Die Nummer trägt die Kernforderung: in DIESER Reihenfolge aufnehmen. */}
                <span
                  className="shrink-0 size-6 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: "var(--color-inspect-bg)", color: "var(--color-inspect)" }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Input
                    value={p.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder={t("proofPlaceholder")}
                    maxLength={TASK_PROOF_DESCRIPTION_MAX_LENGTH}
                  />
                </div>
                {/* Erst ab zwei Zeilen: an einer einzelnen gäbe es nichts zu tauschen, und zwei
                    dauerhaft ausgegraute Knöpfe sind zwei Knöpfe zu viel. */}
                {value.length > 1 && (
                  <ReorderButtons
                    index={i}
                    count={value.length}
                    onMove={(dir) => move(i, dir)}
                    upLabel={t("proofMoveUp")}
                    downLabel={t("proofMoveDown")}
                  />
                )}
                <RemoveRowButton
                  onClick={() => {
                    // Beide Listen zusammen: der Tippstand hängt an der POSITION, und stünde er
                    // still, erbte die nachrückende Zeile die Frist der gelöschten.
                    setDrafts(drafts.filter((_, k) => k !== i));
                    onChange(value.filter((_, k) => k !== i));
                  }}
                  ariaLabel={t("proofRemove")}
                />
              </div>
              <div className="pl-8 flex flex-col gap-2">
                <Checkbox
                  label={t("proofRequireCode")}
                  checked={p.requireCode ?? false}
                  onChange={(e) => update(i, { requireCode: e.target.checked })}
                />
                {/* Die EIGENE Frist dieses Nachweises. Leer lassen ist der Normalfall — dann bleibt
                    er bis zum Ende der Aufgabe offen, genau wie bisher. Bewusst dasselbe Bauteil wie
                    im Frist-Block darüber: eine Dauer ist eine Dauer, und ein drittes Zahlenfeld mit
                    eigener Einheiten-Bedienung wäre die dritte Art, dieselbe Frage zu stellen. */}
                {/* `?? EMPTY_DRAFT` ist kein toter Zweig, sondern die Zusicherung, dass diese
                    Zeile rendert: die Tippstände werden EINMAL aus `value` gesetzt und danach
                    parallel gepflegt. Bekäme das Formular seine Zeilen je von aussen (vorbelegt,
                    zurückgesetzt), stünde hier sonst ein `undefined` und die Seite bliebe weiss. */}
                <DurationInput
                  label={t("proofDueLabel")}
                  value={(drafts[i] ?? EMPTY_DRAFT).value}
                  unit={(drafts[i] ?? EMPTY_DRAFT).unit}
                  onChange={(raw, unit) => setDue(i, raw, unit)}
                />
                {/* WANN das konkret ist. Die eingegebene Zahl beantwortet die Frage nicht, die der
                    Keyholder tatsächlich hat („bis wann muss das Foto da sein?"): sie zählt ab dem
                    Nullpunkt der AUFGABE, nicht ab dem Ausfüllen und nicht ab dem Beginn des Subs —
                    bei einer terminierten Aufgabe liegen dazwischen Stunden. Dieselbe Auflösung wie
                    bei den beiden Fristen darüber, mit demselben Bauteil.

                    Die Warnung ist keine Zierde: eine Frist NACH dem Ende der Aufgabe weist der
                    Dienst mit `TASK_PROOF_DUE_AFTER_END` ab. Sie hier zu zeigen, wo beide Zahlen
                    stehen, ist billiger als ein 400er nach dem Absenden. */}
                {dueOffsetMin != null && (
                  <TimePreview
                    at={(at) => dueAt(at, dueOffsetMin)}
                    nowMs={nowMs}
                    tz={tz}
                    line={(formatted, at, due) => {
                      const end = endAt(at).getTime();
                      // Ein unbrauchbares Ende (halb getipptes Feld darüber) widerlegt nichts —
                      // dann steht hier die schlichte Zeile, und den Vorwurf trägt das Feld selbst.
                      // `due` kommt fertig herein, statt hier ein zweites Mal gerechnet zu werden.
                      //
                      // `>=` und nicht `>`: GLEICHSTAND ist der Fall, der hier durchginge und beim
                      // Absenden am 400er endet. Der Dienst misst den Nullpunkt neu (Server-Uhr,
                      // Sekunden später), das absolute Ende schickt das Formular mit — „Frist 2 h"
                      // zu „Endet in 2 h" ist damit auf dem Server immer schon zu spät. Eine
                      // Warnung, die einen Gleichstand zu früh anzeigt, ist der deutlich bessere
                      // Ausgang als eine Aufgabe, die sich nicht abschicken lässt.
                      const afterEnd = !Number.isNaN(end) && due.getTime() >= end;
                      return afterEnd
                        ? { text: t("proofDueAfterEnd", { date: formatted }), warn: true }
                        : { text: t("proofDueAt", { date: formatted }) };
                    }}
                  />
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {value.length < TASK_PROOF_MAX && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => {
            setDrafts([...drafts, EMPTY_DRAFT]);
            onChange([...value, { description: "", requireCode: false }]);
          }}
        >
          {t("proofAdd")}
        </Button>
      )}

      {/* Was ein LEERES Frist-Feld bedeutet, steht nirgends sonst — und es ist die häufigere Wahl.
          Einmal unter der Liste statt je Zeile: dieselbe Aussage n-mal untereinander liest niemand. */}
      {value.length > 0 && <p className="text-xs text-foreground-faint">{t("proofDueHint")}</p>}

      {orderConfigurable && (
        <Checkbox
          label={t("proofOrderLabel")}
          checked={orderMatters}
          onChange={(e) => onOrderMattersChange(e.target.checked)}
        />
      )}

      <p className="text-xs text-foreground-faint flex items-start gap-1.5">
        <Camera size={13} className="shrink-0 mt-0.5" aria-hidden />
        <span>{t(orderOff ? "proofsHintNoOrder" : "proofsHint")}</span>
      </p>
    </div>
  );
}
