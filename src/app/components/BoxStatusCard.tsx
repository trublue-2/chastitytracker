"use client";

import { useTranslations } from "next-intl";
import { boxIsPhysicallyLocked, boxIstLabel, boxBoltAlert, boxPendingTransition, boxBatteryLabel, boxBatteryIsLow, boxFailsafeWarnings, boxFailsafeLabel, boxCleaningWindowOpenLabel, type BoxCleaningView } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import DashboardBlock from "@/app/components/DashboardBlock";
import Card from "@/app/components/Card";
import WarnLine from "@/app/components/WarnLine";
import BlockHeading from "@/app/components/BlockHeading";
import BoxDeviceInfo from "@/app/components/BoxDeviceInfo";

/** Eine Zeile dieser Karte. Die Kette stand fünfmal wörtlich darin — `listRowCls` passt nicht,
 *  weil es `blockInsetCls` mitbringt und die Karte ihre Polsterung selbst hat. */
const boxRowCls = "flex items-center gap-2";

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
export default function BoxStatusCard({ cleaning, userId, wearerLocked = true, keyInBox }: {
  cleaning?: BoxCleaningView | null;
  userId?: string;
  /** Liegt der Schlüssel in der Box? `false` = Reisefall (der Träger behielt ihn) — dann ist ein
   *  offener Riegel kein Versäumnis, sondern die verabredete Lage. Siehe `boxBoltOpenDespiteLocked`. */
  keyInBox: boolean | null;
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

  const multiBox = boxes.length > 1;

  const windowOpen = boxCleaningWindowOpenLabel(cleaning ?? null, t);

  const boxRows = boxes.map((b) => {
    const isLocked = boxIsPhysicallyLocked(b);
    // Die EINE Riegel-Aussage samt Rangfolge — sie steht in `boxBoltAlert`, damit der Zustands-Held
    // dieselbe liest und nicht leise sagt, was hier laut steht.
    const boltAlert = boxBoltAlert(b, keyInBox);
    const transition = boxPendingTransition(b);
    const failsafes = boxFailsafeWarnings(b, now);
    // Sobald die Failsafe-Warnung steht, entfällt die grobe Stufe: die Warnung sagt dasselbe mit
    // Zahl und Handlungsanweisung.
    const batteryLabel = failsafes.some((w) => w.kind === "lowBatteryOpen") ? null : boxBatteryLabel(b, t);
    // Die STUFE aus dem Wert, nicht aus dem übersetzten Text: `boxBatteryLabel` hängt bei geladenem
    // Akku „· lädt" an, ein Vergleich auf „Akku niedrig" ginge dann immer daneben.
    const batteryLow = batteryLabel !== null && boxBatteryIsLow(b);
    return { b, isLocked, boltAlert, transition, failsafes, batteryLow, batteryLabel };
  });

  // Die Fläche richtet sich nach der lautesten Box. Im Normalfall die STILLE Karte (kein Rahmen,
  // keine Bedeutungsfarbe) — sie hebt sich durch die Fläche allein ab, und das reicht für eine
  // Auskunft. Erst wenn etwas nicht stimmt, wird sie zur semantischen Karte.
  const hasWarning = boxRows.some((s) => s.boltAlert !== null || s.batteryLow || s.failsafes.some((w) => w.severity !== "info"));
  const hasTransition = boxRows.some((s) => s.transition);
  const semantic = hasWarning ? "warn" : hasTransition ? "sperrzeit" : null;

  // Die LEISE Vorwarnung (`severity: "info"` — die Hälfte des Funkstille-Fensters ist um) zählt für
  // die Sichtbarkeit mit, auch wenn sie den Ton nicht färbt. Ohne das wäre der Block genau für die
  // Warnung unabschaltbar geworden, die er im selben Zug verloren hätte: `hasWarning` prüft
  // ausdrücklich `!== "info"`, der Frühausstieg hätte sie also nie erreicht.
  const hasQuietWarning = boxRows.some((s) => s.failsafes.length > 0);
  // Die Box hält den Schlüssel, obwohl NIEMAND verschlossen ist. Nach einer Sperrbruch-Öffnung
  // bleibt der Riegel zu (`boxCommandForEntry` schickt dann bewusst kein Kommando): der Träger
  // steht auf „offen" und hätte sonst nirgends mehr die Auskunft, dass sein Schlüssel weiter
  // festsitzt — die Hardware-Zeile im Helden gibt es nur bei laufendem Verschluss.
  //
  // `!wearerLocked` ist die entscheidende Hälfte. Ohne sie träfe die Bedingung auch den
  // NORMALFALL: ein Verschluss ohne Sperrzeit hat kein Soll, und der Block stünde wieder dauerhaft
  // da — samt „Riegel zu" ein zweites Mal neben der Hardware-Zeile.
  const hasUnexplainedHold = !wearerLocked && boxRows.some((s) => s.isLocked);

  // **Im Ruhefall rendert dieser Block gar nichts mehr.** Der Dauerzustand der Hardware ist ein
  // Qualifikator des Verschlusses und steht als eine Zeile im Zustands-Helden
  // (`BoxHardwareLine`); was hier bleibt, sind EREIGNISSE — Riegel steht falsch, Knopfdruck steht
  // aus, Funkstille, knapper Akku. Damit löst sich der Rang-Konflikt von selbst, den der Docblock
  // oben beschreibt: der Block ist keine Auskunft mehr, die lauter wäre als eine offene Frist.
  //
  // Das offene Reinigungsfenster zählt mit: es läuft ab, ist also auch ein Ereignis.
  if (!semantic && !windowOpen && !hasQuietWarning && !hasUnexplainedHold) return null;

  return (
    <DashboardBlock>
      <Card
        variant={semantic ? "semantic" : "default"}
        semantic={semantic ?? undefined}
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
          <BoxDeviceInfo boxes={boxes} align="right" />
        </div>

        {boxRows.map(({ b, isLocked, boltAlert, transition, failsafes, batteryLow, batteryLabel }) => {
          const prefix = multiBox ? `${b.name} · ` : "";
          return (
            <div key={b.boxId} className="flex flex-col gap-0.5">
              {/* KEINE Ist-Zeile mehr. Sie sagte „Verschlossen" über den Riegel, während der
                  Zustands-Held zwei Zeilen tiefer dasselbe Wort über den TRÄGER sagte — und sie
                  hängte das Sperr-Ende an, das der Held ebenfalls nennt. Kein Zufall: `/api/box`
                  überschreibt `lockUntil` mit dem `endsAt` der Sperrzeit, es war buchstäblich
                  dasselbe Feld, in zwei verschiedenen Zeitzonen formatiert. Der Riegel steht jetzt
                  als Nachsatz im Helden, das Sperr-Ende nur dort. */}
              {/* Das Versäumnis sagt dasselbe wie der Konflikt, plus den Grund und die Handlung —
                  deshalb gilt genau eines von beiden. Der Träger liest eine Aufforderung (er steht
                  am Gerät und kann es beheben), die Keyholderin eine Feststellung. Das Sperr-Ende
                  steht bei keinem: `/api/box` setzt `lockUntil` auf das `endsAt` der Sperrzeit, es
                  wäre dasselbe Datum, das der Held eine Zeile tiefer lauter zeigt. */}
              {boltAlert && (
                <WarnLine>
                  {prefix}
                  {boltAlert === "omission"
                    ? (userId ? t("boltOpenKeyholder") : t("boltOpenSelf"))
                    : boxIstLabel(b, t)}
                </WarnLine>
              )}
              {/* Riegel zu, obwohl niemand verschlossen ist — leise, es ist keine Störung, nur
                  eine Auskunft, die sonst niemand gäbe. */}
              {!wearerLocked && isLocked && (
                <p className={`${boxRowCls} text-neben text-foreground-muted`}>{prefix}{boxIstLabel(b, t)}</p>
              )}
              {transition && (
                <p className={`${boxRowCls} text-neben font-medium text-sperrzeit-text`}>
                  {transition === "closing" ? t("pendingCloseAtDevice") : t("pendingOpenAtDevice")}
                </p>
              )}
              {/* Failsafe: die Box öffnet nach genug Funkstille oder bei leerem Akku von SELBST.
                  Ohne diese Zeile war der Zustand bis zur Not-Öffnung nirgends sichtbar
                  (heimdall#1) — und verhindern lässt er sich nur rechtzeitig. */}
              {failsafes.map((w) => (
                w.severity === "info"
                  ? <p key={w.kind} className={`${boxRowCls} text-neben text-foreground-muted`}>{boxFailsafeLabel(w, t)}</p>
                  : <WarnLine key={w.kind}>{boxFailsafeLabel(w, t)}</WarnLine>
              ))}
              {/* Ein knapper Akku ohne Failsafe-Warnung: das Band zwischen „niedrig" und der
                  Not-Öffnungs-Schwelle hätte sonst gar keine Stimme mehr. */}
              {batteryLow && batteryLabel && <WarnLine>{batteryLabel}</WarnLine>}
            </div>
          );
        })}
        {windowOpen && <p className="text-neben text-foreground-muted">{windowOpen}</p>}
      </Card>
    </DashboardBlock>
  );
}
