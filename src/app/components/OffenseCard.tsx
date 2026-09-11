import Link from "next/link";
import { ChevronRight, Gavel } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Card, { CARD_BODY_STRIPED } from "@/app/components/Card";
import Badge, { type BadgeVariant } from "@/app/components/Badge";
import IconTile from "@/app/components/IconTile";
import { warnEdgeCls } from "@/app/components/inputStyles";
import DetailField from "@/app/components/DetailField";
import OffenseStatementField from "@/app/components/OffenseStatementField";
import type { StatementView } from "@/lib/offenseStatementService";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { TASK_LIST_ANCHOR } from "@/lib/constants";
import { offenseNameKey } from "@/lib/offenseLabels";
import { PenaltyDoneButton, PenaltyReportButton } from "@/app/components/PenaltyActions";
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
 * Zeigt unbeurteilte Vergehen und offene Strafen (`attentionOffensesOf`); die übrigen Zustände
 * bleiben bedient, weil die Karte den ganzen Lebenszyklus beschreibt.
 *
 * Geteilt vom Sub-Dashboard und der Sub-Übersicht der Keyholderin (`keyholderOf`). Aktionen: der
 * Träger nimmt Stellung, solange nicht geurteilt ist, und meldet eine offene Strafe als erledigt; die
 * Keyholderin liest seine Stellungnahme und schliesst die Strafe ab. Urteilen bleibt dem Strafbuch
 * vorbehalten.
 *
 * Der Freitext heisst je nach Zustand etwas anderes — Strafe bei `punished`/`done`, Begründung des
 * Fallenlassens bei `dismissed` — und wird deshalb beschriftet statt nackt hingestellt. Ohne die
 * Beschriftung läse sich „war abgesprochen" wie eine Strafe.
 */
export default async function OffenseCard({
  offense: o,
  tz,
  keyholderOf = null,
  statement,
}: {
  offense: SubOffense;
  tz: string;
  /** Der Träger, wenn die KEYHOLDERIN die Karte sieht (seine Sub-Übersicht) — sonst null. Sie bekommt
   *  „Als erledigt markieren" statt des Hinweises, dass nur sie abschliessen kann, und der
   *  Aufgaben-Link führt in SEINE Aufgaben statt in ihr eigenes Dashboard. */
  keyholderOf?: string | null;
  /** Seine Stellungnahme — für ihn mit Feld, solange er schreiben darf, für sie als Zitat. */
  statement: StatementView | null;
}) {
  const [t, tOffenses, tAdmin] = await Promise.all([
    getTranslations("penalties"), getTranslations("offenses"), getTranslations("admin"),
  ]);
  // Die Datums-Locale kommt aus dem Request, nicht als Prop: beide Aufrufer haben sie ohnehin nur
  // von hier, und `getLocale` ist `cache()`-gestützt (Muster von `LaufendeSessionCard`).
  const dl = toDateLocale(await getLocale());
  const at = (d: Date) => formatDateTime(d, dl, tz);
  const badge = STATE_BADGE[o.state];
  // Das eine Bit, an dem die Karte zweimal hängt: bei einem fallengelassenen Vergehen trägt der
  // Freitext die Begründung statt der Strafe, und „verhängt" wird zu „entschieden".
  const dismissed = o.state === "dismissed";
  const offenseName = o.offenseType ? tOffenses(offenseNameKey(o.offenseType)) : t("offenseUnknown");
  // Der Satz unter einer offenen Strafe: seine Erledigt-Meldung, sonst (nur für ihn) wer abschliesst.
  const penaltyNote = o.reportedDoneAt
    ? t(keyholderOf ? "reportedDoneAtKeyholder" : "reportedDoneAt", { date: at(o.reportedDoneAt) })
    : keyholderOf ? null : t("punishedClosedByKeyholder");

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

        {/* Seine Sicht auf das Vergehen, direkt unter dem Vorwurf — und vor dem Urteil, dem sie
            vorausgeht. Die Keyholderin liest sie hier, ohne ins Strafbuch zu wechseln. */}
        {/* Für sie ohne Schreibrecht (`writer: null`) — das Feld zeigt dann nur das Zitat. */}
        {statement && (
          <OffenseStatementField statement={statement} label={keyholderOf ? tAdmin("strafbuchStellungnahme") : undefined} />
        )}

        {/* Die zweite Frage, die diese Karte beantworten muss: WIE werde ich bestraft. Deshalb steht
            der Straftext abgesetzt und nicht als weitere graue Zeile — er ist die Antwort, nicht ein
            Zusatz. Bei einem fallengelassenen Vergehen trägt dasselbe Feld die Begründung; damit es
            sich nicht wie eine Strafe liest, ist es beschriftet und bleibt ohne Rahmen. */}
        {o.judgmentText && (dismissed ? (
          <p className="text-sm text-foreground-faint">
            <span className="font-medium">{t("dismissReasonLabel")}:</span> {o.judgmentText}
          </p>
        ) : (
          <div className={warnEdgeCls}>
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
            gar nicht mehr unter den offenen Strafen steht. Der Sub-Pfad (`OpenPenalties`)
            filtert zusätzlich jede Karte weg, deren Aufgabe noch im Aufgaben-Block lebt. Übrig
            bleibt bei gesetzter `taskId` praktisch nur die TOTE Aufgabe (versäumt/abgebrochen) —
            die wird nie mehr erfüllt, ihre Strafe also nie automatisch geschlossen. „Sobald die
            Aufgabe erfüllt ist" hiesse dort, den Träger auf etwas warten zu lassen, das für seinen
            Fall nicht mehr eintreten kann. Der eine Satz ist für diesen Pfad schlicht wahr. */}
        {/* Der Rückkanal: der Träger meldet „erledigt", die Keyholderin schliesst ab — beides direkt
            an der Karte. */}
        {o.state === "punished" && (
          <>
            {penaltyNote && <p className="text-xs text-foreground-faint">{penaltyNote}</p>}
            {keyholderOf ? <PenaltyDoneButton refId={o.refId} /> : !o.reportedDoneAt && <PenaltyReportButton refId={o.refId} />}
          </>
        )}

        {/* Die Strafe IST eine Aufgabe: das Badge sagt, wo der Rest steht (Bedingungen, Frist,
            Nachweise) — die Karte hier wiederholt davon bewusst nichts. Es FÜHRT auch dorthin
            (Begründung an `TASK_LIST_ANCHOR`). In der Keyholder-Sicht in SEINE Aufgaben — ein fester
            `/dashboard`-Link führte sie in ihr eigenes (dieselbe Falle, die
            `SessionList.keyholderView` beschreibt). */}
        {o.taskId && (
          <div>
            <Link href={keyholderOf ? `/admin/users/${keyholderOf}/aufgaben` : `/dashboard#${TASK_LIST_ANCHOR}`} className="inline-flex hover:opacity-80 transition">
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
