"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { boxIsPhysicallyLocked, boxIstLabel, boxPendingTransition, boxSollLocked, boxBatteryLabel, boxBatteryIsLow, boxFailsafeWarnings, boxFailsafeLabel, boxCleaningWindowOpenLabel, type BoxReinigungView } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import DashboardBlock from "@/app/components/DashboardBlock";
import Card from "@/app/components/Card";
import BlockHeading from "@/app/components/BlockHeading";
import InfoDot from "@/app/components/InfoDot";

/** Die eine Warn-Zeile dieses Blocks — Konflikt, Failsafe und knapper Akku sehen gleich aus, weil
 *  sie dasselbe sagen: hier stimmt etwas nicht. Lokal, weil es (noch) keine zweite Datei gibt, die
 *  sie braucht. */
/** Eine Zeile dieser Karte. Die Kette stand fünfmal wörtlich darin — `listRowCls` passt nicht,
 *  weil es `blockInsetCls` mitbringt und die Karte ihre Polsterung selbst hat. */
const zeileCls = "flex items-center gap-2";

function WarnZeile({ children }: { children: ReactNode }) {
  return (
    <p className={`${zeileCls} text-neben font-medium text-warn`}>
      <AlertTriangle size={14} className="shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** Reine Status-Anzeige der Heimdall-Box(en). Keine Box-Kommandos — die Box folgt den
 *  Verschluss-/Öffnen-Einträgen. Pollt `/api/box` (self-hiding, wenn keine Box existiert oder
 *  Heimdall aus ist → `[]`).
 *
 *  Geteilt vom Sub-Dashboard und der Keyholder-Detailseite: `userId` gesetzt = Sicht auf einen
 *  fremden Sub. Bewusst DIESELBE Karte statt einer zweiten Keyholder-Variante — der Box-Zustand
 *  ist derselbe, und zwei Darstellungen desselben Zustands laufen früher oder später auseinander.
 *
 *  **Eine Zeile im Normalfall, nicht vier.** Der Block war der einzige umrandete Kasten des
 *  Bildschirms — und nicht einmal ein `Card`, sondern von Hand gebaut mit `rounded-2xl px-5`, also
 *  mit mehr Radius und mehr Polsterung als alles, was das System sonst erzeugt. Er zog damit das
 *  Auge stärker an als eine offene Frist („zu wichtig/prominent", Rückmeldung 27.08.2026).
 *
 *  Der Rang ist damit gerade gerückt: eine offene Kontrolle ist eine HANDLUNG mit Frist, der
 *  Box-Zustand eine AUSKUNFT. Eine Auskunft darf nicht lauter sein als das, was etwas von einem
 *  will — und sie borgt sich deshalb auch NICHT die Alarm-Figur der Banner.
 *
 *  **Aber sie bekommt eine Fläche.** Als rahmenloser `Section`-Abschnitt ging sie zwischen den
 *  Angaben zum Träger unter (Rückmeldung 27.08.2026) — richtig zurückgenommen, aber nicht mehr
 *  auffindbar. `Card`s eigene Regel gibt die Fläche her: sie steht dem zu, was sich vom Fluss
 *  abheben SOLL. Und das soll es hier, weil es eine andere Gattung ist: ein Gerät meldet seinen
 *  Zustand, während ringsum die Daten des Trägers stehen. Die Fläche sagt „das hier ist die
 *  Hardware" — sie sagt nicht „das hier ist dringend".
 *
 *  `padding="compact"` und enge Zeilen: die Karte ist ein Ablesegerät, kein Abschnitt. Als
 *  Abschnitt hatte sie den Blockabstand zwischen Rubrik und Zeile und stand dadurch weiter
 *  auseinander als sie Inhalt hat.
 *
 *  Was aus dem Dauerbild verschwunden ist und wo es geblieben ist:
 *  - Box-Name und Firmware → hinter das ⓘ in der Rubrik. Support-Angaben, kein Dauerinhalt; einen
 *    anderen Ort hätten sie nicht, `/dashboard/geraete` kennt die Box nicht.
 *  - Reinigungsfenster und Kontingent → Begründung an `boxCleaningWindowOpenLabel`.
 *  - Akku „voll"/„mittel" → ersatzlos. Ein Akkustand, der in Ordnung ist, ist keine Auskunft, die
 *    jemand sucht; niedrig und kritisch melden sich weiterhin.
 *
 *  KEINE Zeitzonen mehr: das einzige Datum dieser Karte war das Sperr-Ende, und das nennt jetzt der
 *  Zustands-Held — dort zweizonig, wo es hingehört. Hier stand es ein zweites Mal, in einer anderen
 *  Zone formatiert als dort. */
export default function BoxStatusCard({ reinigung, userId, wearerLocked = true }: {
  reinigung?: BoxReinigungView | null;
  userId?: string;
  /**
   * Trägt der Sub gerade? Die Karte sieht die Sitzung sonst nicht — und ohne sie liesse sich der
   * eine Fall nicht von seinem Gegenteil unterscheiden: „Riegel zu, obwohl niemand verschlossen
   * ist" ist eine Lage, „Riegel zu, während der Verschluss läuft" der Normalfall.
   *
   * Vorgabe `true` = „nimm den Normalfall an", damit ein Aufrufer ohne diese Kenntnis den Block
   * nicht versehentlich dauerhaft aufmacht.
   */
  wearerLocked?: boolean;
}) {
  const t = useTranslations("boxStatus");
  const tBlock = useTranslations("dashboard");
  const { boxes, now } = useBoxStatus(userId);

  if (boxes.length === 0) return null;

  const mehrere = boxes.length > 1;

  const fensterOffen = boxCleaningWindowOpenLabel(reinigung ?? null, t);

  const zustaende = boxes.map((b) => {
    // „Steht offen, obwohl eine Sperre verschlossen verlangt" (z.B. Reinigungspause). PHYSISCH
    // offen, nicht SOLL-offen: eine erst scharfgestellte Öffnung (Riegel noch zu, wartet auf den
    // Knopf) ist kein Alarm — dafür gibt es die Übergangs-Zeile.
    const istLocked = boxIsPhysicallyLocked(b);
    const conflict = !istLocked && boxSollLocked(b);
    const transition = boxPendingTransition(b);
    const failsafes = boxFailsafeWarnings(b, now);
    // Sobald die Failsafe-Warnung steht, entfällt die grobe Stufe: die Warnung sagt dasselbe mit
    // Zahl und Handlungsanweisung.
    const batteryLabel = failsafes.some((w) => w.kind === "lowBatteryOpen") ? null : boxBatteryLabel(b, t);
    // Die STUFE aus dem Wert, nicht aus dem übersetzten Text: `boxBatteryLabel` hängt bei geladenem
    // Akku „· lädt" an, ein Vergleich auf „Akku niedrig" ginge dann immer daneben.
    const batterieKnapp = batteryLabel !== null && boxBatteryIsLow(b);
    return { b, istLocked, conflict, transition, failsafes, batterieKnapp, batteryLabel };
  });

  // Die Fläche richtet sich nach der lautesten Box. Im Normalfall die STILLE Karte (kein Rahmen,
  // keine Bedeutungsfarbe) — sie hebt sich durch die Fläche allein ab, und das reicht für eine
  // Auskunft. Erst wenn etwas nicht stimmt, wird sie zur semantischen Karte.
  const hatWarnung = zustaende.some((z) => z.conflict || z.batterieKnapp || z.failsafes.some((w) => w.severity !== "info"));
  const hatUebergang = zustaende.some((z) => z.transition);
  const semantik = hatWarnung ? "warn" : hatUebergang ? "sperrzeit" : null;

  // Die LEISE Vorwarnung (`severity: "info"` — die Hälfte des Funkstille-Fensters ist um) zählt für
  // die Sichtbarkeit mit, auch wenn sie den Ton nicht färbt. Ohne das wäre der Block genau für die
  // Warnung unabschaltbar geworden, die er im selben Zug verloren hätte: `hatWarnung` prüft
  // ausdrücklich `!== "info"`, der Frühausstieg hätte sie also nie erreicht.
  const hatLeiseWarnung = zustaende.some((z) => z.failsafes.length > 0);
  // Die Box hält den Schlüssel, obwohl NIEMAND verschlossen ist. Nach einer Sperrbruch-Öffnung
  // bleibt der Riegel zu (`boxCommandForEntry` schickt dann bewusst kein Kommando): der Träger
  // steht auf „offen" und hätte sonst nirgends mehr die Auskunft, dass sein Schlüssel weiter
  // festsitzt — die Hardware-Zeile im Helden gibt es nur bei laufendem Verschluss.
  //
  // `!wearerLocked` ist die entscheidende Hälfte. Ohne sie träfe die Bedingung auch den
  // NORMALFALL: ein Verschluss ohne Sperrzeit hat kein Soll, und der Block stünde wieder dauerhaft
  // da — samt „Riegel zu" ein zweites Mal neben der Hardware-Zeile.
  const haeltOhneAnlass = !wearerLocked && zustaende.some((z) => z.istLocked);

  // **Im Ruhefall rendert dieser Block gar nichts mehr.** Der Dauerzustand der Hardware ist ein
  // Qualifikator des Verschlusses und steht als eine Zeile im Zustands-Helden
  // (`BoxHardwareLine`); was hier bleibt, sind EREIGNISSE — Riegel steht falsch, Knopfdruck steht
  // aus, Funkstille, knapper Akku. Damit löst sich der Rang-Konflikt von selbst, den der Docblock
  // oben beschreibt: der Block ist keine Auskunft mehr, die lauter wäre als eine offene Frist.
  //
  // Das offene Reinigungsfenster zählt mit: es läuft ab, ist also auch ein Ereignis.
  if (!semantik && !fensterOffen && !hatLeiseWarnung && !haeltOhneAnlass) return null;

  return (
    <DashboardBlock>
      <Card
        variant={semantik ? "semantic" : "default"}
        semantic={semantik ?? undefined}
        padding="compact"
        // `rounded-xl` statt einer eigenen Variante: `default` bringt die Fläche schon mit, es
        // fehlt nur der Radius. Eine fünfte Variante für ein Utility mit einem Aufrufer hätte die
        // Liste weiter aufgebläht, die ohnehin ein Kreuzprodukt aus Fläche × Radius × Rahmen ×
        // Hover in vier Namen presst. `interactive` wäre falsch: dessen Aufhellung sagt „klick
        // mich", und hier passiert nichts.
        className="rounded-xl flex flex-col gap-1"
      >
        {/* Rubrik und ⓘ in EINER Zeile mit dem Zustand darunter — kein Abschnitts-Abstand
            dazwischen: die Karte hat eine bis zwei Zeilen Inhalt und stand als Abschnitt weiter
            auseinander, als sie zu sagen hat. */}
        <div className="flex items-center justify-between gap-2">
          <BlockHeading tone="label">{tBlock("blockBoxStatus")}</BlockHeading>
          {/* Das ⓘ NICHT in der Rubrik: `BlockHeading` ist eine Überschrift, und der aufgeklappte
              Inhalt läge damit im Überschriftentext. */}
          <InfoDot label={t("deviceInfo")} align="right">
            <span className="flex flex-col gap-0.5">
              {boxes.map((b) => (
                <span key={b.boxId} className="font-mono">
                  {b.name}{b.fwVersion ? ` · ${b.fwVersion}` : ""}
                </span>
              ))}
            </span>
          </InfoDot>
        </div>

        {zustaende.map(({ b, istLocked, conflict, transition, failsafes, batterieKnapp, batteryLabel }) => {
          return (
            <div key={b.boxId} className="flex flex-col gap-0.5">
              {/* KEINE Ist-Zeile mehr. Sie sagte „Verschlossen" über den Riegel, während der
                  Zustands-Held zwei Zeilen tiefer dasselbe Wort über den TRÄGER sagte — und sie
                  hängte das Sperr-Ende an, das der Held ebenfalls nennt. Kein Zufall: `/api/box`
                  überschreibt `lockUntil` mit dem `endetAt` der Sperrzeit, es war buchstäblich
                  dasselbe Feld, in zwei verschiedenen Zeitzonen formatiert. Der Riegel steht jetzt
                  als Nachsatz im Helden, das Sperr-Ende nur dort. */}
              {/* Im Konflikt IST der Riegel die Nachricht. Das Sperr-Ende steht bewusst NICHT
                  dabei: `/api/box` setzt `lockUntil` auf das `endetAt` der Sperrzeit, es wäre
                  buchstäblich dasselbe Datum, das der Held eine Zeile tiefer lauter zeigt. */}
              {conflict && (
                <WarnZeile>{mehrere ? `${b.name} · ` : ""}{boxIstLabel(b, t)}</WarnZeile>
              )}
              {/* Riegel zu, obwohl niemand verschlossen ist — leise, es ist keine Störung, nur
                  eine Auskunft, die sonst niemand gäbe. */}
              {!wearerLocked && istLocked && (
                <p className={`${zeileCls} text-neben text-foreground-muted`}>
                  {mehrere ? `${b.name} · ` : ""}{boxIstLabel(b, t)}
                </p>
              )}
              {transition && (
                <p className={`${zeileCls} text-neben font-medium text-sperrzeit-text`}>
                  {transition === "closing" ? t("pendingCloseAtDevice") : t("pendingOpenAtDevice")}
                </p>
              )}
              {/* Failsafe: die Box öffnet nach genug Funkstille oder bei leerem Akku von SELBST.
                  Ohne diese Zeile war der Zustand bis zur Not-Öffnung nirgends sichtbar
                  (heimdall#1) — und verhindern lässt er sich nur rechtzeitig. */}
              {failsafes.map((w) => (
                w.severity === "info"
                  ? <p key={w.kind} className={`${zeileCls} text-neben text-foreground-muted`}>{boxFailsafeLabel(w, t)}</p>
                  : <WarnZeile key={w.kind}>{boxFailsafeLabel(w, t)}</WarnZeile>
              ))}
              {/* Ein knapper Akku ohne Failsafe-Warnung: das Band zwischen „niedrig" und der
                  Not-Öffnungs-Schwelle hätte sonst gar keine Stimme mehr. */}
              {batterieKnapp && batteryLabel && <WarnZeile>{batteryLabel}</WarnZeile>}
            </div>
          );
        })}
        {fensterOffen && <p className="text-neben text-foreground-muted">{fensterOffen}</p>}
      </Card>
    </DashboardBlock>
  );
}
