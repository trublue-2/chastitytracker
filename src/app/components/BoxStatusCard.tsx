"use client";

import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTimeDual, toDateLocale, APP_TZ } from "@/lib/utils";
import { boxIsPhysicallyLocked, boxIstLabel, boxPendingTransition, boxSollLabel, boxSollLocked, boxFreshnessLabel, boxBatteryLabel, boxReinigungLabel, boxReinigungQuotaLabel, boxFailsafeWarnings, boxFailsafeLabel, type BoxReinigungView } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";
import DashboardBlock from "@/app/components/DashboardBlock";

/** Reine Status-Anzeige der Heimdall-Box(en) (Ist + Soll + Frische). Keine Box-Kommandos — die Box
 *  folgt den Verschluss-/Öffnen-Einträgen. Pollt `/api/box` (self-hiding, wenn keine Box existiert
 *  oder Heimdall aus ist → `[]`).
 *
 *  Geteilt vom Sub-Dashboard und der Keyholder-Detailseite: `userId` gesetzt = Sicht auf einen
 *  fremden Sub. Bewusst DIESELBE Karte statt einer zweiten Keyholder-Variante — der Box-Zustand
 *  ist derselbe, und zwei Darstellungen desselben Zustands laufen früher oder später auseinander.
 *
 *  `reinigung` kommt serverseitig aus `buildBoxReinigungView` (Begründung dort), nicht aus dem Poll.
 *
 *  `tz` ist IMMER die Zone des Subs. `viewerTz` (nur Keyholder-Sicht) blendet zusätzlich die eigene
 *  Zeit ein: das Sperr-Ende ist ein absoluter Zeitpunkt, und unbeschriftet in Sub-Zeit gelesen plant
 *  eine Keyholderin in einer anderen Zone die Freigabe um den Zonen-Versatz falsch. Ohne `viewerTz`
 *  (Sub-Dashboard) fällt `formatDateTimeDual` auf den reinen Primärwert zurück — unverändert.
 *  Die Reinigungs-FENSTER bleiben davon unberührt: die sind echte Wanduhrzeit des Subs. */
export default function BoxStatusCard({ tz = APP_TZ, reinigung, userId, viewerTz }: { tz?: string; reinigung?: BoxReinigungView | null; userId?: string; viewerTz?: string }) {
  const t = useTranslations("boxStatus");
  const dl = toDateLocale(useLocale());
  const { boxes, now } = useBoxStatus(userId);

  if (boxes.length === 0) return null;

  const fmtDateTime = (iso: string) => formatDateTimeDual(iso, dl, viewerTz, tz, t("subTimePrefix"));
  // Die Reinigungs-Regeln hängen am User, nicht an der Box — einmal ableiten, unter jeder Box zeigen.
  const reinigungLabel = boxReinigungLabel(reinigung ?? null, t);
  const quotaLabel = boxReinigungQuotaLabel(reinigung ?? null, t);

  return (
    <DashboardBlock>
      <div className="flex flex-col gap-2">
        {boxes.map((b) => {
          // „Steht offen, obwohl eine Sperre verschlossen verlangt" (z.B. Reinigungspause) →
          // Warn-Optik. PHYSISCH offen, nicht SOLL-offen: eine erst scharfgestellte Öffnung
          // (Riegel noch zu, wartet auf Knopf) ist kein Alarm — dafür gibt es die Übergangs-Zeile.
          // Das SOLL kommt aus `boxSollLocked` (nicht aus den Spiegel-Feldern direkt), damit die
          // Warn-Optik dieselbe Quelle hat wie die Soll-Zeile darunter: nach einer eingetragenen
          // Öffnung schlug die Karte sonst Alarm wegen eines Konflikts, den der Eintrag löste.
          const istLocked = boxIsPhysicallyLocked(b);
          const conflict = !istLocked && boxSollLocked(b);
          const transition = boxPendingTransition(b);
          const failsafes = boxFailsafeWarnings(b, now);
          // Sobald die Akku-Warnung steht, entfällt die grobe Stufe: die Warnung sagt dasselbe mit
          // Zahl und Handlungsanweisung, „Akku niedrig" daneben wäre nur eine zweite, ärmere Fassung
          // derselben Aussage. Die Frische-Zeile bleibt.
          const batteryLabel = failsafes.some((w) => w.kind === "lowBatteryOpen") ? null : boxBatteryLabel(b, t);
          const scheme = conflict
            ? { bg: "bg-warn-bg", border: "border-warn-border", accent: "text-warn", text: "text-warn-text", Icon: AlertTriangle }
            : istLocked
              ? { bg: "bg-sperrzeit-bg", border: "border-sperrzeit-border", accent: "text-sperrzeit", text: "text-sperrzeit-text", Icon: Lock }
              : { bg: "bg-background-subtle", border: "border-border", accent: "text-unlock", text: "text-foreground", Icon: LockOpen };
          const Icon = scheme.Icon;
          return (
            <div key={b.boxId} className={`flex flex-col gap-1.5 ${scheme.bg} border ${scheme.border} rounded-2xl px-5 py-4`}>
              <div className="flex items-center gap-2">
                <Icon size={15} className={`${scheme.accent} shrink-0`} />
                <p className={`text-sm font-bold ${scheme.text}`}>{b.name}</p>
                <span className={`text-sm ${scheme.accent}`}>· {boxIstLabel(b, t)}</span>
              </div>
              <p className={`text-xs ${scheme.accent}`}>{t("sollLabel")}: {boxSollLabel(b, t, fmtDateTime)}</p>
              {/* Übergangs-Zustand (Präsenz-Gate): sofort nach dem Eintrag sichtbar (pendingCommand,
                  tracker-lokal), danach über den Soll/Ist-Mismatch bis zur Riegel-Bestätigung —
                  dieselbe Sprache wie die Heimdall-Karte. (Am Consume-Sync selbst kann die Zeile
                  für einen Poll-Takt verschwinden, bis der Push den Mismatch nachliefert.) */}
              {transition && (
                <p className="text-xs font-medium text-sperrzeit-text">
                  {transition === "closing" ? t("pendingCloseAtDevice") : t("pendingOpenAtDevice")}
                </p>
              )}
              {reinigungLabel && (
                <p className="text-xs text-foreground-muted">
                  {reinigungLabel}{quotaLabel ? ` · ${quotaLabel}` : ""}
                </p>
              )}
              {/* Failsafe-Vorwarnung: die Box öffnet nach genug Funkstille oder bei leerem Akku von
                  SELBST. Ohne diese Zeile war der Zustand bis zur Not-Öffnung nirgends sichtbar
                  (heimdall#1) — und verhindern lässt sie sich nur rechtzeitig. Deshalb steht sie
                  über der Frische-Zeile: sie ist die dringlichere Lesart derselben Stille. */}
              {failsafes.map((w) => (
                <p
                  key={w.kind}
                  className={`text-xs ${w.severity === "info" ? "text-foreground-muted" : "font-medium text-warn"}`}
                >
                  {boxFailsafeLabel(w, t)}
                </p>
              ))}
              {/* Frische UND grober Akkustand in EINER Zeile — nicht aus Platzgründen, sondern weil
                  der Akkuwert genau so alt ist wie der letzte Kontakt. Nebeneinander liest man die
                  Alterung automatisch mit („zuletzt vor 19 Std · Akku niedrig"); zwei getrennte
                  Zeilen liessen den Akkustand aktuell wirken. */}
              <p className="text-xs text-foreground-faint">
                {[boxFreshnessLabel(b.lastSyncAt, now, t), batteryLabel].filter(Boolean).join(" · ")}
              </p>
            </div>
          );
        })}
      </div>
    </DashboardBlock>
  );
}
