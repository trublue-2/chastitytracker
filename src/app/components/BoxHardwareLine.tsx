"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { boxIstLabel, boxFreshnessLabel, boxIsLive, boxBoltAlert } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import InfoDot from "@/app/components/InfoDot";

/**
 * Wie fest dieser Verschluss ist — EINE Zeile am Fuss des Zustands-Helden.
 *
 * **Warum es diese Zeile gibt.** Der Bildschirm sagte dasselbe zweimal und meinte zweimal etwas
 * anderes: oben ein eigener Block „BOX · Verschlossen", unten im Helden „Schlüssel in der Box".
 * Beide beschreiben, ob der Schlüssel gesichert ist — die eine über die Telemetrie der Box, die
 * andere über die Angabe des Trägers beim Verschluss. Zwei Tatsachen, die fast immer
 * übereinstimmen: keine Dublette zum Wegkürzen, sondern zwei Hälften einer Aussage.
 *
 * Der Docblock von `keyInBox` sagt es genau: es ist eine **Deklaration** („er behält den Schlüssel,
 * z.B. auf Reise"), nicht die Messung. Der Riegel daneben ist die Messung. Zusammen ergeben sie,
 * was der MCP als `hardwareEnforced` in einem Wert beantwortet.
 *
 * **Die Frische steht nur, wenn sie etwas sagt.** „gerade aktiv" ist keine Auskunft, die jemand
 * sucht — dieselbe Regel, nach der der Akkustand „voll" aus dem Dauerbild verschwunden ist. Erst
 * die Stille zählt.
 *
 * **Im Konflikt schweigt die Zeile über den Riegel.** Dann meldet ihn der Box-Block laut, und beide
 * zugleich sagten dasselbe zweimal. Die Bedingung ist DIESELBE Funktion (`boxBoltAlert`), nicht
 * eine nachgebaute — sonst behauptete der Kommentar die Arbeitsteilung, die es nicht gibt.
 *
 * **Das ⓘ hängt hier.** Es sass am Box-Block — und der ist im Ruhefall verschwunden, womit
 * Seriennummer und Firmware unerreichbar geworden wären. Sie gehören dorthin, wo die Box-Auskunft
 * jetzt wohnt.
 *
 * **Der Aufrufer entscheidet, ob es dieses Bauteil überhaupt gibt.** Es steht nur, wenn der
 * Schlüssel laut Deklaration in der Box liegt — sonst pollte eine Client-Insel alle fünf Sekunden
 * `/api/box` für eine Zeile, die den Wert gar nicht liest (Reise-Fall: „Schlüssel beim Träger", u.U.
 * wochenlang). Diese Zeile bleibt deshalb beim Aufrufer im Server-Rendering.
 */
export default function BoxHardwareLine({
  userId,
  keyInBox,
}: {
  /** Gesetzt = Sicht auf einen fremden Sub (Keyholderin). */
  userId?: string;
  /** Liegt der Schlüssel in der Box? Reicht die Rangfolge in `boxBoltAlert` durch — ohne ihn
   *  schwiege die Zeile im Reisefall über einen Riegel, den zu Recht niemand geschlossen hat.
   *  Vorgabe `true`: der einzige Aufrufer rendert sie ohnehin nur dann. */
  keyInBox: boolean | null;
}) {
  const t = useTranslations("boxStatus");
  const tDash = useTranslations("dashboard");
  const { boxes, now } = useBoxStatus(userId);

  // Nur EINE Box: mehrere sind heute kein realer Fall, und ein „Riegel zu" über die erste wäre bei
  // zweien schlicht falsch. Gibt es mehrere, schweigt die Zeile über den Riegel und überlässt ihn
  // dem Block, der die Namen mitführt.
  const box = boxes.length === 1 ? boxes[0] : null;
  // Dieselbe Rangfolge wie die Karte: schweigt bei JEDER Riegel-Aussage, nicht nur beim Konflikt.
  // Vorher kannte die Zeile nur `boxHasConflict` und sagte im Versäumnis-Fall leise „Riegel offen",
  // während die Karte darunter laut warnte.
  const showBolt = box !== null && boxBoltAlert(box, keyInBox) === null;

  return (
    <p className="relative mt-1.5 inline-flex flex-wrap items-center gap-x-1.5 text-neben text-foreground-faint">
      <KeyRound size={12} className="shrink-0" aria-hidden />
      {tDash("keyInBoxYes")}
      {/* Der Riegel als Nachsatz derselben Zeile, nicht als eigener Block: er qualifiziert die
          Aussage („Schlüssel drin — und die Box hält ihn auch"), er ist keine zweite. */}
      {showBolt && <span>{" · "}{boxIstLabel(box, t)}</span>}
      {box && !boxIsLive(box.lastSyncAt, now) && (
        <span>{" · "}{boxFreshnessLabel(box.lastSyncAt, now, t)}</span>
      )}
      {boxes.length > 0 && (
        <InfoDot label={t("deviceInfo")}>
          <span className="flex flex-col gap-0.5">
            {boxes.map((b) => (
              <span key={b.boxId} className="font-mono">
                {b.name}{b.fwVersion ? ` · ${b.fwVersion}` : ""}
              </span>
            ))}
          </span>
        </InfoDot>
      )}
    </p>
  );
}
