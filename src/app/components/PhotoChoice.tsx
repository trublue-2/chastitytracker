"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import PhotoThumb from "@/app/components/PhotoThumb";
import DetailField from "@/app/components/DetailField";

export type PhotoChoiceKey = "main" | "box";

export interface PhotoChoiceState {
  choice: PhotoChoiceKey;
  setChoice: (c: PhotoChoiceKey) => void;
  mainUrl: string | null;
  boxUrl: string | null | undefined;
  /** Was das Vollbild gerade zeigen soll. */
  src: string;
}

/**
 * Ein Eintrag kann zwei Fotos tragen: das Haupt-Foto (Gerät bzw. Kontrolle) und das Box-Foto
 * (Schlüssel im Sichtfenster). Beide gehören in DASSELBE Vollbild — ein zweites Modal über dem
 * ersten wäre auf dem Handy eine Sackgasse, und ein zweites Vorschaubild in der Zeile macht die
 * Zeile eng, auch bei den vielen Einträgen ganz ohne Box-Foto.
 *
 * Der Hook hält die URLs mit und reicht sie an `PhotoChoice` weiter, statt sie den Aufrufer ein
 * zweites Mal hinschreiben zu lassen: sonst könnte die Auswahl auf ein anderes Bild schalten, als
 * das Modal anzeigt.
 */
export function usePhotoChoice(mainUrl: string | null, boxUrl: string | null | undefined): PhotoChoiceState {
  // Fehlt das Haupt-Foto (ein Verschluss ohne Foto darf ein Box-Foto haben), direkt das Box-Foto
  // zeigen — sonst öffnete das Vollbild eine leere Fläche, obwohl ein Bild da ist.
  const [choice, setChoice] = useState<PhotoChoiceKey>(mainUrl ? "main" : "box");
  return { choice, setChoice, mainUrl, boxUrl, src: (choice === "box" ? boxUrl : mainUrl) ?? "" };
}

/** Die Auswahl im Detail-Panel des Vollbilds. Rendert nichts, solange es nichts zu wählen gibt
 *  (nur eines der beiden Fotos vorhanden) — dann zeigt das Modal ohnehin das einzig vorhandene. */
export default function PhotoChoice({ photo }: { photo: PhotoChoiceState }) {
  const t = useTranslations("dashboard");
  const { mainUrl, boxUrl, choice, setChoice } = photo;
  if (!mainUrl || !boxUrl) return null;

  const options = [
    { key: "main" as const, url: mainUrl, label: t("photoMain") },
    { key: "box" as const, url: boxUrl, label: t("photoBox") },
  ];

  return (
    <DetailField label={t("photosLabel")}>
      <div className="flex gap-3">
        {options.map((o) => {
          const active = choice === o.key;
          return (
            <button key={o.key} type="button" aria-pressed={active} onClick={() => setChoice(o.key)}
              className="flex flex-col items-center gap-1">
              <PhotoThumb url={o.url} alt={o.label} size="md" className={active ? "ring-2 ring-lock" : "opacity-70"} />
              <span className={`text-xs ${active ? "font-semibold text-foreground" : "text-foreground-faint"}`}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </DetailField>
  );
}
