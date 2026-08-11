import { Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import IconTile from "@/app/components/IconTile";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { offenseNameKey } from "@/lib/offenseLabels";
import type { SubPenalty } from "@/lib/openPenalties";

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

/**
 * Eine verhängte Strafe als Karte — geteilt vom Dashboard-Block und der Strafen-Seite.
 *
 * Rein lesend: der Träger kann eine Strafe nicht selbst als erledigt melden, deshalb trägt die Karte
 * anders als `TaskCard` gar keinen Aktions-Slot. Fällt eine dazu, gehört sie hierher und nicht in
 * eine zweite Karte daneben.
 *
 * EINE Darstellung, keine kompakte Zweitform: ob eine Strafe, die als Aufgabe gestellt wurde,
 * überhaupt erscheint, entscheidet der Dashboard-Block anhand der tatsächlichen Sichtbarkeit jener
 * Aufgabe. Erscheint sie hier, ist sie nirgends sonst zu sehen — dann gehört sie ganz hierher,
 * Straftext eingeschlossen.
 *
 * Farbschema neutral wie bei `TaskCard`; die Semantik trägt allein das Badge (offen/erledigt).
 */
export default async function PenaltyCard({
  penalty,
  tz,
}: {
  penalty: SubPenalty;
  /** Zeitzone des TRÄGERS — es sind seine Strafen, auch wenn ein Keyholder mitliest. */
  tz: string;
}) {
  const t = await getTranslations("penalties");
  // Die Datums-Locale kommt aus dem Request, nicht als Prop: beide Aufrufer haben sie ohnehin nur
  // von hier, und `getLocale` ist `cache()`-gestützt (Muster von `LaufendeSessionCard`).
  const dl = toDateLocale(await getLocale());
  const at = (d: Date) => formatDateTime(d, dl, tz);
  // `done` wird nicht getragen, sondern gefragt: `doneAt` IST das Kriterium. Ein zweites Feld
  // daneben könnte davon abweichen.
  const done = penalty.doneAt !== null;


  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 p-4 border-l-[3px] border-l-border-strong">
        <div className="flex items-start gap-3">
          <IconTile icon={<Gavel className="size-4" />} />
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
            variant={done ? "ok" : "warn"}
            size="sm"
            label={t(done ? "badgeDone" : "badgeOpen")}
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
