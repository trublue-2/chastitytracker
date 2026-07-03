"use client";

import { formatDateTime, APP_TZ } from "@/lib/utils";
import { GRUND_I18N_KEYS } from "@/lib/constants";
import { useTranslations } from "next-intl";

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
  verifikationStatus?: string | null;
  note?: string | null;
}

export default function EntryDetailPanel({
  startTime, locale, tz = APP_TZ, imageExifTime, oeffnenGrund, orgasmusArt,
  openingLabel, orgasmusLabel, kontrollCode, verifikationStatus, note,
}: Props) {
  const tc = useTranslations("common");
  const tOpen = useTranslations("openForm");

  const exifTime = imageExifTime
    ? (imageExifTime instanceof Date ? imageExifTime : new Date(imageExifTime as string))
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("dateTime")}</p>
        <p className="text-sm font-semibold text-foreground">{formatDateTime(startTime, locale, tz)}</p>
      </div>

      {exifTime && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
          <p className="text-sm text-foreground-muted">{formatDateTime(exifTime, locale, tz)}</p>
        </div>
      )}

      {oeffnenGrund && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("reason")}</p>
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border border-unlock-border bg-unlock-bg text-unlock-text">
            {openingLabel
              ?? (GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS]
                ? tOpen(GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS])
                : oeffnenGrund)}
          </span>
        </div>
      )}

      {orgasmusArt && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("type")}</p>
          <span className="text-xs text-[var(--color-orgasm)] font-medium">{orgasmusLabel ?? orgasmusArt}</span>
        </div>
      )}

      {kontrollCode && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("controlCode")}</p>
          <p className="text-sm font-mono font-bold text-[var(--color-inspect)]">
            {kontrollCode}
            {verifikationStatus && (
              verifikationStatus === "pending" ? (
                <span className="ml-2 text-xs font-sans font-medium text-foreground-muted">{tc("verifying")}</span>
              ) : (
                <span className="ml-2 text-xs font-sans font-medium text-ok-text">✓ {tc("verified")}</span>
              )
            )}
          </p>
        </div>
      )}

      {note && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("note")}</p>
          <p className="text-sm text-foreground-muted italic">„{note}"</p>
        </div>
      )}
    </div>
  );
}
