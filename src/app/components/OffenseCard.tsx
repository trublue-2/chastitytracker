import { Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Card, { CARD_BODY_STRIPED } from "@/app/components/Card";
import Badge, { type BadgeVariant } from "@/app/components/Badge";
import IconTile from "@/app/components/IconTile";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { offenseNameKey } from "@/lib/offenseLabels";
import type { SubOffense, SubOffenseState } from "@/lib/subOffenses";

/** Zustand → Badge. Vier Zustände, vier Beschriftungen — der Träger muss keinen Lebenszyklus
 *  lernen, die Karte sagt in einem Wort, woran er ist. */
const STATE_BADGE: Record<SubOffenseState, { key: string; variant: BadgeVariant }> = {
  open: { key: "badgeOpen", variant: "neutral" },
  dismissed: { key: "badgeDismissed", variant: "ok" },
  punished: { key: "badgePunished", variant: "warn" },
  done: { key: "badgeDone", variant: "ok" },
};

/**
 * Ein Vergehen als Karte — geteilt vom Dashboard-Block und der Strafbuch-Seite des Trägers.
 *
 * Rein lesend: der Träger kann weder urteilen noch eine Strafe abschliessen, deshalb trägt die Karte
 * anders als `TaskCard` gar keinen Aktions-Slot. Fällt eine dazu, gehört sie hierher und nicht in
 * eine zweite Karte daneben.
 *
 * Der Freitext heisst je nach Zustand etwas anderes — Strafe bei `punished`/`done`, Begründung des
 * Fallenlassens bei `dismissed` — und wird deshalb beschriftet statt nackt hingestellt. Ohne die
 * Beschriftung läse sich „war abgesprochen" wie eine Strafe.
 */
export default async function OffenseCard({ offense: o, tz }: { offense: SubOffense; tz: string }) {
  const [t, tOffenses] = await Promise.all([getTranslations("penalties"), getTranslations("offenses")]);
  // Die Datums-Locale kommt aus dem Request, nicht als Prop: beide Aufrufer haben sie ohnehin nur
  // von hier, und `getLocale` ist `cache()`-gestützt (Muster von `LaufendeSessionCard`).
  const dl = toDateLocale(await getLocale());
  const at = (d: Date) => formatDateTime(d, dl, tz);
  const badge = STATE_BADGE[o.state];
  const offenseName = o.offenseType ? tOffenses(offenseNameKey(o.offenseType)) : t("offenseUnknown");

  return (
    <Card padding="none">
      <div className={CARD_BODY_STRIPED}>
        <div className="flex items-start gap-3">
          <IconTile icon={<Gavel className="size-4" />} />
          <div className="min-w-0 flex-1">
            {/* Die ERSTE Frage der Karte: was wird mir angelastet. Wo das Vergehen einen eigenen
                Anlass trägt (notiertes Vergehen, Aufgabe), ist DAS die Überschrift und die Art nur
                die Einordnung darüber — „Notiertes Vergehen" allein sagt dem Träger nichts. */}
            {o.detail ? (
              <>
                <p className="text-xs text-foreground-faint">{offenseName}</p>
                <p className="text-sm font-semibold text-foreground break-words">{o.detail}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-foreground break-words">{offenseName}</p>
            )}
            {/* Der TATzeitpunkt, nicht der des Urteils. Beide stehen an der Karte, weil sie
                verschiedene Fragen beantworten („was habe ich getan?" / „seit wann steht das?"). */}
            {o.offenseAt && (
              <p className="text-xs text-foreground-muted">{t("offenseAt", { date: at(o.offenseAt) })}</p>
            )}
            {o.detailText && (
              <p className="text-sm text-foreground-muted whitespace-pre-wrap break-words mt-1">{o.detailText}</p>
            )}
          </div>
          <Badge variant={badge.variant} size="sm" label={t(badge.key)} className="shrink-0" />
        </div>

        {/* Die zweite Frage, die diese Karte beantworten muss: WIE werde ich bestraft. Deshalb steht
            der Straftext abgesetzt und nicht als weitere graue Zeile — er ist die Antwort, nicht ein
            Zusatz. Bei einem fallengelassenen Vergehen trägt dasselbe Feld die Begründung; damit es
            sich nicht wie eine Strafe liest, ist es beschriftet und bleibt ohne Rahmen. */}
        {o.text && (o.state === "dismissed" ? (
          <p className="text-sm text-foreground-faint">
            <span className="font-medium">{t("dismissReasonLabel")}:</span> {o.text}
          </p>
        ) : (
          <div className="border-l-2 border-warn pl-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("penaltyLabel")}</p>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{o.text}</p>
          </div>
        ))}

        {/* Die Strafe IST eine Aufgabe: das Badge sagt, wo der Rest steht (Bedingungen, Frist,
            Nachweise) — die Karte hier wiederholt davon bewusst nichts. */}
        {o.taskId && <div><Badge variant="neutral" size="sm" label={t("badgeTask")} /></div>}

        {o.judgedAt && (
          <p className="text-xs text-foreground-faint">
            {/* „Verhängt" stimmt nur für eine Strafe — ein fallengelassenes Vergehen wurde
                entschieden, nicht verhängt. */}
            {t(o.state === "dismissed" ? "decidedAt" : "judgedAt", { date: at(o.judgedAt) })}
            {o.doneAt && ` · ${t("doneAt", { date: at(o.doneAt) })}`}
          </p>
        )}
      </div>
    </Card>
  );
}
