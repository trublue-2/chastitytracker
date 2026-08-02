"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import Badge from "@/app/components/Badge";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import { useActionPatch } from "@/app/hooks/useActionPatch";
import type { TaskCardProof } from "@/lib/taskView";

/**
 * Annehmen oder Ablehnen der eingereichten Nachweise einer Aufgabe (Issue #39, Etappe 4).
 *
 * Der Ausweg aus `awaitingReview`: ohne diese Handlung bleibt die Aufgabe für immer weder erfüllt
 * noch versäumt. Deshalb steht sie direkt an der Karte und nicht hinter einer weiteren Seite — dort
 * liegt auch das Foto, über das geurteilt wird.
 */
export default function ProofReviewActions({
  proofs,
  tz,
  awaitingReview,
}: {
  proofs: TaskCardProof[];
  /** Zeitzone des Keyholders — das Urteil ist SEINE Handlung, nicht die des Subs. */
  tz: string;
  /** Hängt die ganze Aufgabe an seinem Urteil? Nicht aus den Nachweisen ableitbar: fehlt EINEM die
   *  Aufnahmezeit, wartet die Aufgabe auf ihn, während alle anderen längst bestätigt sind. */
  awaitingReview: boolean;
}) {
  // Nur was eingereicht ist, lässt sich beurteilen. Bereits Beurteiltes bleibt dabei: ein Urteil darf
  // korrigiert werden — die Alternative wäre, dass eine versehentliche Ablehnung den Sub
  // unwiderruflich ein Vergehen kostet.
  const reviewable = proofs.filter((p) => p.state !== "open");
  if (reviewable.length === 0) return null;

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {reviewable.map((p) => (
        // Der Zeitpunkt des Urteils gehört in den Key: er ändert sich mit jeder Sichtung, und nur so
        // holt sich das Anmerkungsfeld (lokaler State) den Stand vom Server. Ohne ihn behielt die
        // Zeile ihr leeres Feld, wenn zwischenzeitlich der MCP geurteilt hatte — und eine Korrektur
        // hätte dessen Anmerkung still gelöscht.
        <ProofReviewRow
          key={`${p.id}:${p.review?.at ?? ""}`}
          proof={p}
          index={proofs.indexOf(p) + 1}
          tz={tz}
          awaitingReview={awaitingReview}
        />
      ))}
    </div>
  );
}

/**
 * Der Stand der Sichtung an dieser Zeile — was bereits entschieden ist, bevor die Knöpfe eine neue
 * Entscheidung anbieten.
 *
 * Ohne diese Anzeige war ein über den MCP angenommener Nachweis von einem unbeurteilten nicht zu
 * unterscheiden: beide trugen dasselbe neutrale Knopfpaar. Wer nicht hochscrollte, urteilte ein
 * zweites Mal über dasselbe Foto.
 *
 * MEHRERE Abzeichen statt einer Rangfolge, und das ist Absicht: die Zustände hier schliessen
 * einander nicht aus. Ein Nachweis kann angenommen sein und trotzdem die Reihenfolge brechen (dann
 * scheitert die Aufgabe an ihm, obwohl das Urteil steht), und ein maschinell bestätigter Nachweis
 * kann in einer Aufgabe hängen, die wegen eines ANDEREN Fotos auf die Sichtung wartet. Wer hier eine
 * Rangfolge zieht, verschweigt genau die Hälfte, die zum Handeln auffordert.
 */
function ReviewVerdict({ proof, tz, awaitingReview }: { proof: TaskCardProof; tz: string; awaitingReview: boolean }) {
  const t = useTranslations("tasks");
  const locale = useLocale();

  return (
    <>
      {/* Zuerst der Grund zum Zögern: die gebrochene Reihenfolge ist der Grund, aus dem die Aufgabe
          scheitert — sie steht vor jedem Urteil, das sie nicht heilt. */}
      {proof.state === "outOfOrder" && <Badge variant="warn" size="sm" label={t("proofOutOfOrder")} />}
      {proof.review ? (
        <Badge
          variant={proof.review.accepted ? "ok" : "warn"}
          size="sm"
          label={t(proof.review.accepted ? "proofReviewedAccepted" : "proofReviewedRejected", {
            at: formatDateTime(proof.review.at, toDateLocale(locale), tz),
          })}
        />
      ) : (
        <>
          {/* „Über den Code bestätigt" ist etwas anderes als „von dir angenommen" — beides lässt die
              Aufgabe gelten, aber nur eines ist eine Handlung. */}
          {proof.state === "confirmed" && <Badge variant="ok" size="sm" label={t("proofCodeConfirmed")} />}
          {(awaitingReview || proof.state !== "confirmed") && (
            <Badge variant="neutral" size="sm" label={t("proofAwaitingReview")} />
          )}
        </>
      )}
    </>
  );
}

/**
 * Eine Zeile: Anmerkung plus die zwei Urteile.
 *
 * Eigene Komponente je Nachweis, damit Anmerkung und Laufzustand einfacher lokaler State sind —
 * dasselbe Muster wie `WithdrawButton`, das ebenfalls je Zeile instanziiert wird. Alles in der
 * Elternkomponente zu halten hiesse, beides über die id zu verschlüsseln.
 *
 * Die Anmerkung ist EIN Feld für beide Ausgänge: sie erklärt bei einer Ablehnung, was fehlte, und
 * kann bei einer Annahme ein Lob sein. Zwei getrennte Felder wären zwei Wege, dasselbe zu tun.
 */
function ProofReviewRow({
  proof,
  index,
  tz,
  awaitingReview,
}: {
  proof: TaskCardProof;
  index: number;
  tz: string;
  awaitingReview: boolean;
}) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  // Mit der bestehenden Anmerkung vorbelegt: die Knöpfe bleiben für eine Korrektur stehen, und ein
  // leeres Feld hätte beim nächsten Urteil die Begründung des vorigen still gelöscht.
  const [note, setNote] = useState(proof.reviewNote ?? "");
  const [error, setError] = useState("");

  async function review(accepted: boolean) {
    setError("");
    const res = await run(`/api/admin/tasks/proofs/${proof.id}`, { accepted, note: note || null });
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
  }

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <span className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-foreground-faint">
          {t("proofReviewFor", { index, description: proof.description })}
        </span>
        <ReviewVerdict proof={proof} tz={tz} awaitingReview={awaitingReview} />
      </span>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("proofReviewNotePlaceholder")}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" icon={<Check size={14} />} loading={saving} onClick={() => void review(true)}>
          {t("proofAccept")}
        </Button>
        <Button type="button" variant="secondary" size="sm" icon={<X size={14} />} loading={saving} onClick={() => void review(false)}>
          {t("proofReject")}
        </Button>
      </div>
      <FormError message={error} variant="compact" />
    </div>
  );
}
