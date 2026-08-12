import Link from "next/link";
import { ChevronRight, Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Card, { CARD_BODY_STRIPED } from "@/app/components/Card";
import Badge, { type BadgeVariant } from "@/app/components/Badge";
import IconTile from "@/app/components/IconTile";
import DetailField from "@/app/components/DetailField";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { TASK_LIST_ANCHOR } from "@/lib/constants";
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
 * Ein Vergehen als Karte — der Strafen-Block des Sub-Dashboards.
 *
 * Zeigt heute nur offene Strafen (`openPenaltiesOf`); die übrigen Zustände bleiben bedient, weil die
 * Karte den ganzen Lebenszyklus beschreibt und ein Block, der auch Beurteiltes zeigt, keine neue
 * Komponente brauchen soll.
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
  // Das eine Bit, an dem die Karte zweimal hängt: bei einem fallengelassenen Vergehen trägt der
  // Freitext die Begründung statt der Strafe, und „verhängt" wird zu „entschieden".
  const dismissed = o.state === "dismissed";
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
            {o.title ? (
              <>
                <p className="text-xs text-foreground-faint">{offenseName}</p>
                <p className="text-sm font-semibold text-foreground break-words">{o.title}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-foreground break-words">{offenseName}</p>
            )}
            {/* Der TATzeitpunkt, nicht der des Urteils. Beide stehen an der Karte, weil sie
                verschiedene Fragen beantworten („was habe ich getan?" / „seit wann steht das?"). */}
            {o.offenseAt && (
              <p className="text-xs text-foreground-muted">{t("offenseAt", { date: at(o.offenseAt) })}</p>
            )}
            {o.description && (
              <p className="text-sm text-foreground-muted whitespace-pre-wrap break-words mt-1">{o.description}</p>
            )}
          </div>
          <Badge variant={badge.variant} size="sm" label={t(badge.key)} className="shrink-0" />
        </div>

        {/* Die zweite Frage, die diese Karte beantworten muss: WIE werde ich bestraft. Deshalb steht
            der Straftext abgesetzt und nicht als weitere graue Zeile — er ist die Antwort, nicht ein
            Zusatz. Bei einem fallengelassenen Vergehen trägt dasselbe Feld die Begründung; damit es
            sich nicht wie eine Strafe liest, ist es beschriftet und bleibt ohne Rahmen. */}
        {o.judgmentText && (dismissed ? (
          <p className="text-sm text-foreground-faint">
            <span className="font-medium">{t("dismissReasonLabel")}:</span> {o.judgmentText}
          </p>
        ) : (
          <div className="border-l-2 border-warn pl-3">
            <DetailField label={t("penaltyLabel")}>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{o.judgmentText}</p>
            </DetailField>
          </div>
        ))}

        {/* Wie diese Strafe zugeht — die Frage, die „Strafe offen" allein offen lässt. Nur bei
            `punished`: bei `done`/`dismissed` ist nichts mehr zu schliessen, bei `open` steht noch
            gar kein Urteil.

            KEINE zweite Variante für „schliesst sich mit der Aufgabe", obwohl es den Automatismus
            gibt (`closePenaltyForFulfilledTask`) — das ist kein Versehen. Der Automatismus greift
            NUR bei einer ERFÜLLTEN Aufgabe, und eine erfüllte schliesst die Strafe, womit die Karte
            gar nicht mehr in `openPenaltiesOf` steht. Der einzige Renderpfad (`OpenPenalties`)
            filtert zusätzlich jede Karte weg, deren Aufgabe noch im Aufgaben-Block lebt. Übrig
            bleibt bei gesetzter `taskId` praktisch nur die TOTE Aufgabe (versäumt/abgebrochen) —
            die wird nie mehr erfüllt, ihre Strafe also nie automatisch geschlossen. „Sobald die
            Aufgabe erfüllt ist" hiesse dort, den Träger auf etwas warten zu lassen, das für seinen
            Fall nicht mehr eintreten kann. Der eine Satz ist für diesen Pfad schlicht wahr. */}
        {o.state === "punished" && (
          <p className="text-xs text-foreground-faint">{t("punishedClosedByKeyholder")}</p>
        )}

        {/* Die Strafe IST eine Aufgabe: das Badge sagt, wo der Rest steht (Bedingungen, Frist,
            Nachweise) — die Karte hier wiederholt davon bewusst nichts. Es FÜHRT auch dorthin
            (Begründung an `TASK_LIST_ANCHOR`); `/dashboard` ist fix, weil `OffenseList` heute nur
            in der Sub-Sicht steht — käme sie je in eine Keyholder-Seite, führte der Link ihn in
            SEIN eigenes Dashboard (dieselbe Falle, die `SessionList.keyholderView` beschreibt). */}
        {o.taskId && (
          <div>
            <Link href={`/dashboard#${TASK_LIST_ANCHOR}`} className="inline-flex hover:opacity-80 transition">
              <Badge variant="neutral" size="sm" label={t("badgeTask")}>
                <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
              </Badge>
            </Link>
          </div>
        )}

        {o.judgedAt && (
          <p className="text-xs text-foreground-faint">
            {t(dismissed ? "decidedAt" : "judgedAt", { date: at(o.judgedAt) })}
            {o.doneAt && ` · ${t("doneAt", { date: at(o.doneAt) })}`}
          </p>
        )}
      </div>
    </Card>
  );
}
