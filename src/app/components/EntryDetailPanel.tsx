"use client";

import { formatDateTime } from "@/lib/utils";
import { GRUND_I18N_KEYS } from "@/lib/constants";
import { useTranslations } from "next-intl";

interface Props {
  startTime: Date;
  locale: string;
  imageExifTime?: Date | string | null;
  oeffnenGrund?: string | null;
  orgasmusArt?: string | null;
  kontrollCode?: string | null;
  verifikationStatus?: string | null;
  note?: string | null;
}

export default function EntryDetailPanel({
  startTime, locale, imageExifTime, oeffnenGrund, orgasmusArt,
  kontrollCode, verifikationStatus, note,
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
        <p className="text-sm font-semibold text-foreground">{formatDateTime(startTime, locale)}</p>
      </div>

      {exifTime && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("exifDate")}</p>
          <p className="text-sm text-foreground-muted">{formatDateTime(exifTime, locale)}</p>
        </div>
      )}

      {oeffnenGrund && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("reason")}</p>
          <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border border-unlock-border bg-unlock-bg text-unlock-text">
            {GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS]
              ? tOpen(GRUND_I18N_KEYS[oeffnenGrund as keyof typeof GRUND_I18N_KEYS])
              : oeffnenGrund}
          </span>
        </div>
      )}

      {orgasmusArt && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("type")}</p>
          <span className="text-xs text-[var(--color-orgasm)] font-medium">{orgasmusArt}</span>
        </div>
      )}

      {kontrollCode && (
        <div>
          <p className="text-xs text-foreground-faint uppercase tracking-wider font-semibold mb-0.5">{tc("controlCode")}</p>
          <p className="text-sm font-mono font-bold text-[var(--color-inspect)]">
            {kontrollCode}
            {verifikationStatus && (
              <span className="ml-2 text-xs font-sans font-medium text-ok-text">✓ {tc("verified")}</span>
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
