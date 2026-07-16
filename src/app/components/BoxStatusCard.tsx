"use client";

import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatDateTime, toDateLocale, APP_TZ } from "@/lib/utils";
import { boxIsPhysicallyLocked, boxIstLabel, boxPendingTransition, boxSollLabel, boxFreshnessLabel, boxReinigungLabel, boxReinigungQuotaLabel, type BoxReinigungView } from "@/lib/boxStatus";
import { useBoxStatus } from "@/app/hooks/useBoxStatus";

/** Reine Status-Anzeige der Heimdall-Box(en) auf dem Dashboard (Ist + Soll + Frische). Keine
 *  Box-Kommandos — die Box folgt den Verschluss-/Öffnen-Einträgen. Pollt `/api/box` (self-hiding,
 *  wenn keine Box existiert oder Heimdall aus ist → `[]`). */
/** `reinigung` kommt als Prop von der Dashboard-Server-Komponente, NICHT aus dem 5s-Poll: die Regeln
 *  ändern sich, wenn der Keyholder sie editiert oder eine Reinigung eingetragen wird — nicht im
 *  Sekundentakt. Der Poll bleibt für die Hardware-Frische zuständig, die ihn wirklich braucht. */
export default function BoxStatusCard({ tz = APP_TZ, reinigung }: { tz?: string; reinigung?: BoxReinigungView | null }) {
  const t = useTranslations("boxStatus");
  const dl = toDateLocale(useLocale());
  const { boxes, now } = useBoxStatus();

  if (boxes.length === 0) return null;

  const fmtDateTime = (iso: string) => formatDateTime(iso, dl, tz);
  // Die Reinigungs-Regeln hängen am User, nicht an der Box — einmal ableiten, unter jeder Box zeigen.
  const reinigungLabel = boxReinigungLabel(reinigung ?? null, t);
  const quotaLabel = boxReinigungQuotaLabel(reinigung ?? null, t);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-6">
      <div className="flex flex-col gap-2">
        {boxes.map((b) => {
          // „Steht offen, obwohl eine Sperre verschlossen verlangt" (z.B. Reinigungspause) →
          // Warn-Optik. PHYSISCH offen, nicht SOLL-offen: eine erst scharfgestellte Öffnung
          // (Riegel noch zu, wartet auf Knopf) ist kein Alarm — dafür gibt es die Übergangs-Zeile.
          const istLocked = boxIsPhysicallyLocked(b);
          const shouldBeLocked = b.keyholderLocked || !!b.lockUntil || b.simpleLock;
          const conflict = !istLocked && shouldBeLocked;
          const transition = boxPendingTransition(b);
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
              <p className="text-xs text-foreground-faint">{boxFreshnessLabel(b.lastSyncAt, now, t)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
