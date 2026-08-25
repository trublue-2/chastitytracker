"use client";

import { useState } from "react";
import { Scale, Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { FullscreenImageModal } from "@/app/components/ImageViewer";
import DetailField from "@/app/components/DetailField";
import { listRowCls, listRowButtonCls, listRowTimeCls } from "@/app/components/inputStyles";
import { formatDateTime, formatTime, APP_TZ } from "@/lib/utils";
import { weightText, type UnitSystem } from "@/lib/weight";
import type { WeightRowData } from "@/lib/weightRows";

/**
 * Eine Wiegung als Zeile — geteilt von der Liste in der Statistik-Karte (Träger) und der
 * Eintragsliste der Keyholderin, in die die Messungen eingemischt sind.
 *
 * Aufbau bewusst wie `EntryRow`: dieselbe Spaltenbreite für den Typ, dieselbe Klickfläche, dasselbe
 * Vollbild-Modal mit Detail-Panel. In der gemischten Liste stehen beide Sorten untereinander, und
 * eine Zeile, die sich anders verhält als ihre Nachbarn, liest sich wie ein Fremdkörper.
 *
 * **Die Einheit gehört dem BETRACHTER**, die Daten dem Träger: eine Keyholderin in den USA sieht
 * Pfund, während er in Kilogramm einträgt (docs/gewicht-konzept.md, Abschnitt 2).
 */
export default function WeightRow({
  row, locale, tz = APP_TZ, unitSystem, actions, timeOnly,
}: {
  row: WeightRowData;
  locale: string;
  /** Zeitzone des TRÄGERS — er hat um 23:50 gewogen, nicht die Keyholderin um 22:50. */
  tz?: string;
  unitSystem: UnitSystem;
  actions?: React.ReactNode;
  /** Wie bei `EntryRow`: in einer nach Tagen gruppierten Liste trägt der Tageskopf das Datum. */
  timeOnly?: boolean;
}) {
  const t = useTranslations("weightList");
  const tc = useTranslations("common");
  const [showDetail, setShowDetail] = useState(false);

  const unitLabel = unitSystem === "imperial" ? tc("unitLbs") : tc("unitKg");
  const show = (kg: number) => `${weightText(kg, unitSystem, locale)} ${unitLabel}`;
  // Das Vorzeichen bleibt stehen: „−0,3" ist die Information, „0,3" wäre die halbe. Ohne Färbung —
  // ob eine Abnahme gut ist, weiss nur das Ziel, und die Zeile kennt es nicht.
  const delta = row.deltaKg === null
    ? null
    : `${row.deltaKg > 0 ? "+" : ""}${weightText(row.deltaKg, unitSystem, locale)}`;
  const measuredAt = new Date(row.measuredAt);
  // Nur die ABWEICHUNG ist eine Aussage: las die Waage dasselbe, sagt die Zeile nichts darüber.
  // Als WERT und nicht als Ja/Nein, damit die beiden Anzeigen darunter ihn ohne `!` benutzen.
  const mismatchKg = row.detectedKg !== null && Math.abs(row.detectedKg - row.weightKg) >= 0.05
    ? row.detectedKg
    : null;

  return (
    <>
      <div className={listRowCls}>
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className={listRowButtonCls}
        >
          {/* Dieselbe Spaltenfolge wie `EntryRow`: erst die Zeit, dann die Art, dann der Wert.
              In der gemischten Liste stehen beide Sorten untereinander — eine Zeile mit anderer
              Ordnung liest sich dort als Fremdkörper. */}
          <span className={listRowTimeCls}>
            {timeOnly ? formatTime(measuredAt, locale, tz) : formatDateTime(measuredAt, locale, tz)}
          </span>
          <span className="flex items-center gap-1.5 text-fliess text-foreground flex-shrink-0">
            <Scale size={13} className="text-foreground-faint" />
            {/* Auf schmalen Bildschirmen trägt das Zeichen die Art allein: mit Beschriftung bleibt
                neben Zeit und Wert kein Platz, und die Zeile bricht mitten in „74,4 kg" um. */}
            <span className="hidden sm:inline">{t("typeLabel")}</span>
          </span>
          <span className="text-fliess font-semibold text-foreground tabular-nums whitespace-nowrap">{show(row.weightKg)}</span>
          {delta && <span className="text-neben text-foreground-muted tabular-nums">{delta}</span>}
          {row.imageUrl && <Camera size={12} className="text-foreground-faint flex-shrink-0" />}
          {!row.inWindow && (
            <span className="hidden sm:inline text-neben text-foreground-faint flex-shrink-0">{t("outsideWindow")}</span>
          )}
          {mismatchKg !== null && (
            <span className="hidden sm:inline text-neben text-warn flex-shrink-0 tabular-nums">
              {t("detectedShort", { value: show(mismatchKg) })}
            </span>
          )}
          {row.note && (
            <span className="hidden sm:inline text-neben text-foreground-faint italic truncate min-w-0">„{row.note}"</span>
          )}
        </button>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>

      {showDetail && (
        <FullscreenImageModal
          src={row.imageUrl ?? ""}
          alt={t("typeLabel")}
          onClose={() => setShowDetail(false)}
          title={<span className="flex items-center gap-1.5"><Scale size={14} />{t("typeLabel")}</span>}
          panel={
            <div className="flex flex-col gap-3">
              <DetailField label={tc("dateTime")}>
                <p className="text-sm font-semibold text-foreground">{formatDateTime(measuredAt, locale, tz)}</p>
              </DetailField>

              {row.imageExifTime && (
                <DetailField label={tc("exifDate")}>
                  <p className="text-sm text-foreground-muted">
                    {formatDateTime(new Date(row.imageExifTime), locale, tz)}
                  </p>
                </DetailField>
              )}

              <DetailField label={t("weightLabel")}>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {show(row.weightKg)}
                  {delta && <span className="ml-2 font-normal text-foreground-muted">{delta} {unitLabel}</span>}
                </p>
              </DetailField>

              {/* Getippt neben gelesen — dieselbe Trennung wie `deviceCheckNote` neben `deviceCheck`:
                  was die Maschine gelesen hat, bleibt getrennt von dem, was der Mensch bestätigt hat.
                  Nur so ist sichtbar, ob korrigiert wurde. */}
              {mismatchKg !== null && (
                <DetailField label={t("detectedLabel")} tone="warn">
                  <p className="text-sm text-foreground tabular-nums">{show(mismatchKg)}</p>
                </DetailField>
              )}

              {!row.inWindow && (
                <DetailField label={t("windowLabel")}>
                  <p className="text-sm text-foreground-muted">{t("outsideWindowDesc")}</p>
                </DetailField>
              )}

              {row.source !== "user" && (
                <DetailField label={t("sourceLabel")}>
                  <p className="text-sm text-foreground-muted">
                    {t(row.source === "keyholder" ? "sourceKeyholder" : "sourceAgent")}
                  </p>
                </DetailField>
              )}

              {row.imagePrunedAt && (
                <DetailField label={t("photoLabel")}>
                  <p className="text-sm text-foreground-muted">{t("photoExpired")}</p>
                </DetailField>
              )}

              {row.note && (
                <DetailField label={tc("note")}>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{row.note}</p>
                </DetailField>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
