"use client";

import { useTranslations } from "next-intl";
import FormFieldLabel from "@/app/components/FormFieldLabel";

interface Props {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
}

/**
 * Beschriftung plus Feld — die Hülle um ein Formular-Feld, das diese Komponente NICHT selbst rendert.
 *
 * Genau daraus folgt der Umgang mit `required`: {@link Input} darf den Stern allein malen, weil es
 * dasselbe `required` im selben Aufruf an sein `<input>` hängt — dort ist die Pflicht also auch für
 * Assistenztechnik da. Hier kommt das Feld als `children` herein, und ob es `required` trägt, weiss
 * diese Hülle nicht. Ein blosser Stern wäre dann eine Behauptung fürs Auge: Screenreader lesen ihn
 * je nach Einstellung als „Stern" oder gar nicht vor, und die drei heutigen Aufrufer hängen ihn an
 * Foto-Felder, die überhaupt kein `required` kennen. Deshalb trägt die Beschriftung die Pflicht
 * zusätzlich als Text — sichtbar bleibt allein der Stern.
 *
 * `"use client"`, weil die Textquelle ein Hook ist; die Datei wird auch aus einer Server-Seite
 * heraus benutzt (`admin/dev/components`), die sonst einen Hook im Server-Baum aufriefe.
 */
export default function FormField({ label, htmlFor, required, children }: Props) {
  const tc = useTranslations("common");
  return (
    <div>
      <FormFieldLabel htmlFor={htmlFor} className="mb-2">
        {label}
        {required && (
          <>
            <span className="text-warn ml-0.5" aria-hidden="true">*</span>
            <span className="sr-only">{tc("requiredField")}</span>
          </>
        )}
      </FormFieldLabel>
      {children}
    </div>
  );
}
