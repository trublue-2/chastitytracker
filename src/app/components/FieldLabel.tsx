"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import InfoDot from "./InfoDot";

/**
 * Die kleine Beschriftung über einem Formular-Abschnitt — „Frist", „Zeit zum Anlegen", „Anzeige".
 *
 * Bewusst NICHT die Beschriftung von {@link Input}/{@link DateTimePicker}: die ist versal, fett und
 * gehört zu EINEM Feld. Diese hier benennt eine Gruppe (ein Umschalter, ein Feld samt Einheit, zwei
 * Alternativen) und ist deshalb leiser.
 *
 * Extrahiert, weil dasselbe `<span className="text-xs text-foreground-faint">` in `FieldTabs` und
 * `HoursInput` stand und der Frist-Block der Aufgaben-Form die dritte Kopie gewesen wäre.
 *
 * `htmlFor` macht daraus ein echtes `<label>` — dort, wo die Gruppe genau ein Eingabefeld enthält.
 * Ohne bleibt es ein `<span>` mit `id`, den der Aufrufer per `aria-labelledby` an die Gruppe hängt:
 * ein `<label>` ohne Ziel ist für Assistenztechnik wertlos.
 */
export default function FieldLabel({
  id,
  htmlFor,
  required,
  info,
  infoLabel,
  children,
}: {
  id?: string;
  htmlFor?: string;
  /** Pflichtfeld-Stern wie bei {@link Input}/{@link DateTimePicker} — dieselbe Auszeichnung, damit
   *  eine Gruppe nicht optional AUSSIEHT, bloss weil ihr Feld seine Beschriftung von aussen bekommt.
   *  Der Stern ist die Ankündigung; durchgesetzt wird die Pflicht am Feld selbst.
   *
   *  Und genau deshalb steht neben dem Stern ein unsichtbarer Text: `Input` hängt sein `required`
   *  im selben Aufruf ans `<input>`, diese Beschriftung kennt ihr Feld aber nicht einmal — bei
   *  `FieldTabs` beschriftet sie sogar eine Gruppe, deren Pflicht am Feld DARUNTER hängt. Bliebe es
   *  beim Stern, stünde die Pflicht nur im Bild und nirgends im Vorlesetext. */
  required?: boolean;
  /** Eine seltene Erklärung zur Gruppe — hinter ein ⓘ NEBEN die Beschriftung statt in eine graue
   *  Dauerzeile darunter (siehe {@link InfoDot}). Das ⓘ ist ein Geschwister der beschrifteten
   *  Element-`id`, nicht darin — der zugängliche Name der Gruppe bleibt der reine Text. */
  info?: ReactNode;
  /** Zugänglicher Name des ⓘ, wo `children` kein einfacher Text ist. Sonst dient der Text selbst. */
  infoLabel?: string;
  children: React.ReactNode;
}) {
  const tc = useTranslations("common");
  const className = "text-xs text-foreground-faint";
  // `aria-hidden` am Stern, damit die Pflicht nicht doppelt ankommt („Stern Pflichtfeld") — er ist
  // ab jetzt reine Tinte, die Aussage steckt im Text daneben.
  const content = (
    <>
      {children}
      {required && (
        <>
          <span className="text-warn ml-0.5" aria-hidden="true">*</span>
          <span className="sr-only">{tc("requiredField")}</span>
        </>
      )}
    </>
  );
  const labelEl = htmlFor
    ? <label id={id} htmlFor={htmlFor} className={className}>{content}</label>
    : <span id={id} className={className}>{content}</span>;
  if (info == null) return labelEl;
  // Das ⓘ als GESCHWISTER der id-tragenden Beschriftung, nicht darin: ein `aria-labelledby` auf die
  // `id` nennt so weiterhin nur den Text, nicht „… Schaltfläche".
  return (
    <span className="flex items-center gap-1">
      {labelEl}
      <InfoDot label={infoLabel ?? (typeof children === "string" ? children : "")}>{info}</InfoDot>
    </span>
  );
}
