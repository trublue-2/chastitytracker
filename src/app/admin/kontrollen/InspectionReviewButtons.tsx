"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Button from "@/app/components/Button";
import { canReviewInspection } from "@/lib/kontrollePills";
import { useInspectionReview } from "./useInspectionReview";

/** Was eine Aufrufstelle braucht, um die Knöpfe zu zeigen. Nur Keyholder-Sichten reichen es
 *  durch — die Sicht des Subs auf seine eigenen Einträge lässt es weg und zeigt deshalb nichts. */
export interface InspectionReviewData {
  entryId: string;
  /** Angefordert (true) oder freiwillige Selbstkontrolle (false) — entscheidet nur den Text der
   *  Rückfrage: ein Vergehen kann nur aus der Ablehnung einer ANGEFORDERTEN Kontrolle entstehen. */
  requested: boolean;
  verifikationStatus: string | null;
}

/**
 * Verifizieren / Ablehnen direkt unter dem Vollbild-Foto einer Kontrolle — dort, wo die
 * Keyholderin das Foto ohnehin ansieht, statt über das Zeilenmenü der Kontrollen-Liste.
 *
 * Die Rückfrage vor dem Ablehnen steht hier INLINE im Sheet, nicht als `ConfirmDialog`: das
 * Vollbild liegt auf `z-index: 99999` mit eigener Fokus-Falle, das `ActionModal` darunter auf
 * `z-[9999]` — der Dialog ginge hinter dem Foto auf und wäre weder zu sehen noch zu erreichen.
 * Text und Knopf sind dieselben wie in `KontrolleActions` (Begründung der Rückfrage dort).
 * Die Fehlerzeile steht direkt unter den Knöpfen, also im Blickfeld; die Rückfrage schliesst
 * deshalb auch im Fehlerfall nicht von selbst.
 */
export default function InspectionReviewButtons({ entryId, requested, verifikationStatus }: InspectionReviewData) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { review, error, busy } = useInspectionReview(entryId);
  const [confirmReject, setConfirmReject] = useState(false);

  if (!canReviewInspection(verifikationStatus)) return null;

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {confirmReject ? (
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--color-warn-border)] bg-warn-bg p-3">
          <p className="text-sm font-semibold text-foreground">{t("kontrolleRejectConfirmTitle")}</p>
          <p className="text-sm text-foreground-muted">
            {t(requested ? "kontrolleRejectConfirmTextRequested" : "kontrolleRejectConfirmTextVoluntary")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" fullWidth disabled={busy !== null} onClick={() => setConfirmReject(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="danger" size="sm" fullWidth loading={busy === "reject"} icon={<X size={16} />} onClick={() => review("reject")}>
              {t("kontrolleRejectBtn")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="semantic" semantic="ok" size="sm" fullWidth
            loading={busy === "manuallyVerify"} disabled={busy !== null}
            icon={<CheckCircle2 size={16} />}
            onClick={() => review("manuallyVerify")}
          >
            {t("kontrolleVerifyBtn")}
          </Button>
          <Button variant="danger" size="sm" fullWidth disabled={busy !== null} icon={<X size={16} />} onClick={() => setConfirmReject(true)}>
            {t("kontrolleRejectBtn")}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}
