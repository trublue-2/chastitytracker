"use client";

import { formatDateTime, APP_TZ } from "@/lib/utils";
import { GRUND_I18N_KEYS } from "@/lib/constants";
import { useTranslations } from "next-intl";
import DetailField from "@/app/components/DetailField";
import Badge from "@/app/components/Badge";
import type { KontrollePill } from "@/lib/kontrollePills";

interface Props {
  startTime: Date;
  locale: string;
  /** Governing timezone of the data owner (sub). Defaults to APP_TZ (Europe/Zurich). */
  tz?: string;
  imageExifTime?: Date | string | null;
  oeffnenGrund?: string | null;
  orgasmusArt?: string | null;
  /** Pre-resolved display labels via the data-owner's reason config (from a server parent). When
   *  omitted, falls back to built-in i18n (oeffnenGrund) / the raw stored value (orgasmusArt). */
  openingLabel?: string | null;
  orgasmusLabel?: string | null;
  kontrollCode?: string | null;
  /** Die Kontroll-Pille der Zeile darüber — DIESELBE, nicht eine zweite Ableitung. Begründung
   *  unten am Kontroll-Code. */
  inspectionPill?: KontrollePill | null;
  note?: string | null;
}

export default function EntryDetailPanel({
  startTime, locale, tz = APP_TZ, imageExifTime, oeffnenGrund, orgasmusArt,
  openingLabel, orgasmusLabel, kontrollCode, inspectionPill, note,
}: Props) {
  const tc = useTranslations("common");
  const tOpen = useTranslations("openForm");

  const exifTime = imageExifTime
    ? (imageExifTime instanceof Date ? imageExifTime : new Date(imageExifTime as string))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <DetailField label={tc("dateTime")}>
        <p className="text-sm font-semibold text-foreground">{formatDateTime(startTime, locale, tz)}</p>
      </DetailField>

      {exifTime && (
        <DetailField label={tc("exifDate")}>
          <p className="text-sm text-foreground-muted">{formatDateTime(exifTime, locale, tz)}</p>
        </DetailField>
      )}

      {oeffnenGrund && (
        <DetailField label={tc("reason")}>
          <span className="inline-flex items-center text-fliess font-semibold text-foreground">
            {openingLabel
              ?? (GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS]
                ? tOpen(GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS])
                : oeffnenGrund)}
          </span>
        </DetailField>
      )}

      {orgasmusArt && (
        <DetailField label={tc("type")}>
          <span className="text-xs text-[var(--color-orgasm)] font-medium">{orgasmusLabel ?? orgasmusArt}</span>
        </DetailField>
      )}

      {kontrollCode && (
        <DetailField label={tc("controlCode")}>
          <p className="text-fliess font-mono font-semibold text-foreground">
            {kontrollCode}
            {/* DIESELBE Pille wie in der Zeile darüber, nicht ein zweites Vokabular.
                Hier standen vier eigene Zweige aus dem `common`-Namensraum, und seit die Zeile den
                Status zeigt, widersprachen sie ihr auf einen Tipp Abstand: die Zeile sagte
                „Angenommen (KI)" in Grau, das Panel „✓ Verifiziert" in Grün — obwohl der geprüfte
                Normalfall bewusst KEINE Farbe mehr trägt (`kontrollePills.ts`). Und `not_required`
                hiess oben „Kein Code nötig", unten „Nicht verifiziert".
                Das war Issue #59 auf kürzester Distanz: zwei Auskünfte über denselben Vorgang,
                gleichzeitig sichtbar. Von zwei widersprechenden glaubt man die grüne. */}
            {inspectionPill && (
              <Badge size="sm" label={inspectionPill.label} tone={inspectionPill.cls} className="ml-2" />
            )}
          </p>
        </DetailField>
      )}

      {note && (
        <DetailField label={tc("note")}>
          <p className="text-sm text-foreground-muted italic">„{note}"</p>
        </DetailField>
      )}
    </div>
  );
}
