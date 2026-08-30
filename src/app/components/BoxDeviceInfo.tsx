"use client";

import { useTranslations } from "next-intl";
import InfoDot from "@/app/components/InfoDot";
import type { BoxRow } from "@/lib/boxStatus";

/**
 * Das ⓘ mit den Angaben zum Gerät — Name und Firmware je Box.
 *
 * Steht hier und nicht zweimal an den Aufrufstellen: die Box-Karte und die Hardware-Zeile zeigen
 * dasselbe Panel, und sie stehen auf demselben Bildschirm untereinander. Als zwei Kopien waren sie
 * bis auf `align` Zeichen für Zeichen gleich — die erste Ergänzung (Seriennummer, Akku), die der
 * Docblock von `BoxHardwareLine` ausdrücklich vorsieht, hätte zwei ⓘ auf einem Schirm erzeugt, die
 * sich widersprechen.
 *
 * Rendert nichts ohne Boxen: ein ⓘ, das eine leere Liste aufklappt, ist ein Versprechen ohne Inhalt.
 */
export default function BoxDeviceInfo({
  boxes,
  align,
}: {
  boxes: BoxRow[];
  /** Wie beim `InfoDot` — `"right"`, wo das Zeichen am rechten Rand einer Kopfzeile sitzt. */
  align?: "right";
}) {
  const t = useTranslations("boxStatus");
  if (boxes.length === 0) return null;

  return (
    <InfoDot label={t("deviceInfo")} align={align}>
      <span className="flex flex-col gap-0.5">
        {boxes.map((b) => (
          <span key={b.boxId} className="font-mono">
            {b.name}{b.fwVersion ? ` · ${b.fwVersion}` : ""}
          </span>
        ))}
      </span>
    </InfoDot>
  );
}
