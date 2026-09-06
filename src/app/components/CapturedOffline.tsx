"use client";

import { useTranslations } from "next-intl";
import Badge from "@/app/components/Badge";
import DetailField from "@/app/components/DetailField";

/**
 * Die „offline erfasst"-Markierung — EINE Quelle für Ton, Beschriftung und Erklärung, geteilt von
 * Eintrag und Wiegung in Zeile (`EntryRow`/`WeightRow`) wie Detail (`EntryDetailPanel`/`WeightRow`).
 *
 * Neutral (grau), NICHT eingefärbt: eine Farbe hiesse in diesem System „das will etwas von dir".
 * „Offline erfasst" sagt nur, wie die Zeit in die Zeile kam. Der Aufrufer entscheidet, OB sie
 * erscheint (`{row.capturedOffline && …}`) — hier steht nur, WIE.
 */
export function CapturedOfflineBadge() {
  const tc = useTranslations("common");
  return <Badge variant="neutral" label={tc("capturedOffline")} />;
}

export function CapturedOfflineDetail() {
  const tc = useTranslations("common");
  return (
    <DetailField label={tc("capturedOffline")}>
      <p className="text-sm text-foreground-muted">{tc("capturedOfflineHint")}</p>
    </DetailField>
  );
}
