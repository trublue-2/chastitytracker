"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { boxIsPhysicallyLocked, boxIstLabel, boxPendingTransition, boxSollLabel, boxSollLocked, boxFreshnessLabel, boxBatteryLabel, boxBatteryIsLow, boxFailsafeWarnings, boxFailsafeLabel, boxCleaningWindowOpenLabel, type BoxReinigungView } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import DashboardBlock from "@/app/components/DashboardBlock";
import Section from "@/app/components/Section";
import type { SectionTone } from "@/app/components/Section";
import InfoDot from "@/app/components/InfoDot";
import { listRowCls } from "@/app/components/inputStyles";
import { LockClosedIcon, LockOpenIcon } from "@/app/components/lockIcons";

/** Die eine Warn-Zeile dieses Blocks — Konflikt, Failsafe und knapper Akku sehen gleich aus, weil
 *  sie dasselbe sagen: hier stimmt etwas nicht. Lokal, weil es (noch) keine zweite Datei gibt, die
 *  sie braucht; wandert neben `listRowCls`, sobald doch. */
function WarnZeile({ children }: { children: ReactNode }) {
  return (
    <p className={`${listRowCls} text-neben font-medium text-warn`}>
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
 *  will — und sie borgt sich deshalb auch NICHT die Alarm-Figur der Banner. Wenn etwas nicht
 *  stimmt, färbt sie Rubrik und Haarlinie (`Section tone`) und bekommt EINE zusätzliche Zeile;
 *  im Normalfall belegt dieser Ausnahmefall keinen Platz.
 *
 *  Was aus dem Dauerbild verschwunden ist und wo es geblieben ist:
 *  - Box-Name und Firmware → hinter das ⓘ in der Rubrik. Support-Angaben, kein Dauerinhalt; einen
 *    anderen Ort hätten sie nicht, `/dashboard/geraete` kennt die Box nicht.
 *  - Reinigungsfenster und Kontingent → Begründung an `boxCleaningWindowOpenLabel`.
 *  - Akku „voll"/„mittel" → ersatzlos. Ein Akkustand, der in Ordnung ist, ist keine Auskunft, die
 *    jemand sucht; niedrig und kritisch melden sich weiterhin.
 *
 *  `tz` ist IMMER die Zone des Subs. `viewerTz` (nur Keyholder-Sicht) blendet zusätzlich die eigene
 *  Zeit ein: das Sperr-Ende ist ein absoluter Zeitpunkt, und unbeschriftet in Sub-Zeit gelesen plant
 *  eine Keyholderin in einer anderen Zone die Freigabe um den Zonen-Versatz falsch. */
export default function BoxStatusCard({ tz = APP_TZ, reinigung, userId, viewerTz }: { tz?: string; reinigung?: BoxReinigungView | null; userId?: string; viewerTz?: string }) {
  const t = useTranslations("boxStatus");
  const tBlock = useTranslations("dashboard");
  const dl = toDateLocale(useLocale());
  const { boxes, now } = useBoxStatus(userId);

  if (boxes.length === 0) return null;

  const fmtDateTime = (iso: string) => formatDateTimeDual(iso, dl, viewerTz, tz, t("subTimePrefix"));
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

  // Der Ton des ganzen Abschnitts richtet sich nach der lautesten Box: warn ▸ sperrzeit ▸ tonlos.
  const hatWarnung = zustaende.some((z) => z.conflict || z.batterieKnapp || z.failsafes.some((w) => w.severity !== "info"));
  const hatUebergang = zustaende.some((z) => z.transition);
  const ton: SectionTone | undefined = hatWarnung ? "warn" : hatUebergang ? "sperrzeit" : undefined;

  return (
    <DashboardBlock>
      <Section
        tone={ton}
        title={tBlock("blockBoxStatus")}
        /* Das ⓘ steht im `action`-Slot und NICHT in der Rubrik: `Section` rendert sie als `h2`,
           und der aufgeklappte Inhalt läge damit im Überschriftentext — die
           Überschriften-Navigation läse „Box, 262007, 0.2.40" als eine Überschrift vor. */
        action={
          <InfoDot label={t("deviceInfo")} align="right">
            <span className="flex flex-col gap-0.5">
              {boxes.map((b) => (
                <span key={b.boxId} className="font-mono">
                  {b.name}{b.fwVersion ? ` · ${b.fwVersion}` : ""}
                </span>
              ))}
            </span>
          </InfoDot>
        }
      >
        {zustaende.map(({ b, istLocked, conflict, transition, failsafes, batterieKnapp, batteryLabel }) => {
          const Icon = istLocked ? LockClosedIcon : LockOpenIcon;
          return (
            <div key={b.boxId} className="flex flex-col gap-1">
              <p className={`${listRowCls} text-fliess text-foreground`}>
                <Icon size={14} className={`shrink-0 ${conflict ? "text-warn" : "text-foreground-muted"}`} aria-hidden />
                <span className="min-w-0">
                  {mehrere && <span className="text-foreground-muted">{b.name} · </span>}
                  {boxIstLabel(b, t)}
                  {/* Das Soll-ENDE als Nachsatz statt als zweite Zeile: im Normalfall ist das Soll
                      deckungsgleich mit dem Ist und sagte dasselbe ein zweites Mal. Was es
                      ZUSÄTZLICH trägt, ist der Zeitpunkt. */}
                  {!conflict && boxSollLocked(b) && b.lockUntil && (
                    <span className="text-foreground-muted">{" — "}{fmtDateTime(b.lockUntil)}</span>
                  )}
                  {/* Die Funk-Frische als Nachsatz statt eigener Zeile: die Box ist ein Funkgerät,
                      ihre Stille muss ablesbar bleiben. Sie stand kurzzeitig im `action`-Slot der
                      Rubrik — der ist im ganzen Baum für BEDIENELEMENTE reserviert („ein Zähler,
                      ein Schalter, ein ‚alle anzeigen'"), und ein passiver Text darin nimmt der
                      Position rechts oben ihr Versprechen. */}
                  <span className="text-foreground-faint">{" · "}{boxFreshnessLabel(b.lastSyncAt, now, t)}</span>
                </span>
              </p>
              {/* Im Konflikt bekommt das Soll seine Zeile zurück: dort IST es die Nachricht. */}
              {conflict && <WarnZeile>{boxSollLabel(b, t, fmtDateTime)}</WarnZeile>}
              {transition && (
                <p className={`${listRowCls} text-neben font-medium text-sperrzeit-text`}>
                  {transition === "closing" ? t("pendingCloseAtDevice") : t("pendingOpenAtDevice")}
                </p>
              )}
              {/* Failsafe: die Box öffnet nach genug Funkstille oder bei leerem Akku von SELBST.
                  Ohne diese Zeile war der Zustand bis zur Not-Öffnung nirgends sichtbar
                  (heimdall#1) — und verhindern lässt er sich nur rechtzeitig. */}
              {failsafes.map((w) => (
                w.severity === "info"
                  ? <p key={w.kind} className={`${listRowCls} text-neben text-foreground-muted`}>{boxFailsafeLabel(w, t)}</p>
                  : <WarnZeile key={w.kind}>{boxFailsafeLabel(w, t)}</WarnZeile>
              ))}
              {/* Ein knapper Akku ohne Failsafe-Warnung: das Band zwischen „niedrig" und der
                  Not-Öffnungs-Schwelle hatte bisher nur die Dauer-Zeile. Ohne diese Zeile fiele es
                  mit ihr still weg. */}
              {batterieKnapp && batteryLabel && (
                <WarnZeile>{batteryLabel}</WarnZeile>
              )}
            </div>
          );
        })}
        {fensterOffen && (
          <p className={`${listRowCls} text-neben text-foreground-muted`}>{fensterOffen}</p>
        )}
      </Section>
    </DashboardBlock>
  );
}
