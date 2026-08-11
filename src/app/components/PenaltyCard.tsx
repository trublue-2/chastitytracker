import { Gavel } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import { formatDateTime } from "@/lib/utils";
import { offenseNameKey } from "@/lib/offenseLabels";
import type { SubPenalty } from "@/lib/openPenalties";

/**
 * Eine verhängte Strafe als Karte — geteilt vom Dashboard-Block und der Strafen-Seite.
 *
 * Rein lesend: der Träger kann eine Strafe nicht selbst als erledigt melden, deshalb trägt die Karte
 * anders als `TaskCard` gar keinen Aktions-Slot. Fällt eine dazu, gehört sie hierher und nicht in
 * eine zweite Karte daneben.
 *
 * Farbschema neutral wie bei `TaskCard`; die Semantik trägt allein das Badge (offen/erledigt).
 */
/**
 * Der Anzeigename einer Vergehensart — aus `offenses`, der EINEN Tabelle für alle Oberflächen
 * (`offenseLabels.ts`), nie aus einer zweiten Liste daneben.
 *
 * Als Komponente statt als Funktion, weil beide Aufrufer Server-Komponenten sind und der Name sonst
 * an jeder Stelle dieselben zwei `getTranslations` samt Null-Fall nachbauen müsste.
 */
export async function OffenseName({ type }: { type: SubPenalty["offenseType"] }) {
  const [t, tOffenses] = await Promise.all([getTranslations("penalties"), getTranslations("offenses")]);
  return <>{type ? tOffenses(offenseNameKey(type)) : t("offenseUnknown")}</>;
}

export default async function PenaltyCard({
  penalty,
  dl,
  tz,
}: {
  penalty: SubPenalty;
  /** Datums-Locale (`toDateLocale`). */
  dl: string;
  /** Zeitzone des TRÄGERS — es sind seine Strafen, auch wenn ein Keyholder mitliest. */
  tz: string;
}) {
  const t = await getTranslations("penalties");
  const at = (d: Date) => formatDateTime(d, dl, tz);

  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 p-4 border-l-[3px] border-l-border-strong">
        <div className="flex items-start gap-3">
          <div className="shrink-0 size-9 rounded-lg flex items-center justify-center bg-surface-raised text-foreground-muted" aria-hidden>
            <Gavel className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground break-words">
              <OffenseName type={penalty.offenseType} />
            </p>
            {/* Wofür — der TATzeitpunkt, nicht der des Urteils. Beide stehen an der Karte, weil sie
                verschiedene Fragen beantworten („was habe ich getan?" / „seit wann steht das?"). */}
            {penalty.offenseAt && (
              <p className="text-xs text-foreground-muted">{t("offenseAt", { date: at(penalty.offenseAt) })}</p>
            )}
          </div>
          <Badge
            variant={penalty.done ? "ok" : "warn"}
            size="sm"
            label={t(penalty.done ? "badgeDone" : "badgeOpen")}
            className="shrink-0"
          />
        </div>

        {penalty.penaltyText && (
          <p className="text-sm text-foreground-muted whitespace-pre-wrap break-words">{penalty.penaltyText}</p>
        )}

        {/* Die Strafe IST eine Aufgabe: das Badge sagt, wo der Rest steht (Bedingungen, Frist,
            Nachweise) — die Karte hier wiederholt davon bewusst nichts. */}
        {penalty.taskId && <div><Badge variant="neutral" size="sm" label={t("badgeTask")} /></div>}

        <p className="text-xs text-foreground-faint">
          {t("judgedAt", { date: at(penalty.judgedAt) })}
          {penalty.doneAt && ` · ${t("doneAt", { date: at(penalty.doneAt) })}`}
        </p>
      </div>
    </Card>
  );
}
