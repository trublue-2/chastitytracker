"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import FormError from "@/app/components/FormError";
import Input from "@/app/components/Input";
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
export default function ProofReviewActions({ proofs }: { proofs: TaskCardProof[] }) {
  // Nur was eingereicht ist, lässt sich beurteilen. Bereits Beurteiltes bleibt dabei: ein Urteil darf
  // korrigiert werden — die Alternative wäre, dass eine versehentliche Ablehnung den Sub
  // unwiderruflich ein Vergehen kostet.
  const reviewable = proofs.filter((p) => p.state !== "open");
  if (reviewable.length === 0) return null;

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {reviewable.map((p) => (
        <ProofReviewRow key={p.id} proof={p} index={proofs.indexOf(p) + 1} />
      ))}
    </div>
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
function ProofReviewRow({ proof, index }: { proof: TaskCardProof; index: number }) {
  const t = useTranslations("tasks");
  const tc = useTranslations("common");
  const apiError = useApiError();
  const { saving, run } = useActionPatch();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function review(accepted: boolean) {
    setError("");
    const res = await run(`/api/admin/tasks/proofs/${proof.id}`, { accepted, note: note || null });
    if (!res) setError(tc("networkError"));
    else if (!res.ok) setError(apiError(await parseApiErrorCode(res)));
  }

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <span className="text-xs text-foreground-faint">
        {t("proofReviewFor", { index, description: proof.description })}
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
