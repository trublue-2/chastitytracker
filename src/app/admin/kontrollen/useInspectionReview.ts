"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

export type InspectionReviewAction = "manuallyVerify" | "reject";

/**
 * Das Urteil der Keyholderin über eine eingereichte Kontrolle — Verifizieren oder Ablehnen.
 *
 * Geteilt zwischen dem Zeilenmenü der Kontrollen-Liste (`KontrolleActions`) und den Knöpfen unter
 * dem Vollbild-Foto (`InspectionReviewButtons`): zwei Wege zur selben Handlung dürfen nicht zwei
 * Abrufe mit zwei Fehlerbehandlungen sein.
 *
 * Am EINTRAG, nicht an der Anforderung: eine Selbstkontrolle hat keine, und die Kontrollen-Route
 * erreicht sie deshalb nicht. Für angeforderte Kontrollen ist das Ergebnis dasselbe — die Route
 * findet die Anforderung selbst.
 */
export function useInspectionReview(entryId: string | null) {
  const tc = useTranslations("common");
  const apiError = useApiError();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<InspectionReviewAction | null>(null);

  /** `true`, wenn das Urteil gespeichert ist. */
  async function review(action: InspectionReviewAction): Promise<boolean> {
    setError(null);
    // Auffangnetz wie in `KontrolleActions`: ohne Eintrag sichtbar scheitern statt still nichts tun.
    if (!entryId) {
      setError(apiError(null));
      return false;
    }
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setError(apiError(await parseApiErrorCode(res)));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(tc("networkError"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { review, error, busy };
}
