"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import WeightFormCore, { type WeightPayload } from "@/app/entries/WeightFormCore";
import type { SubmitResult } from "@/app/entries/types";
import { parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { UnitSystem } from "@/lib/weight";

interface Props {
  tz: string;
  nowDefault: string;
  unitSystem: UnitSystem;
  heightCm: number | null;
  lastWeightKg: number | null;
  windowHint: string | null;
  mobileDesktopMode: boolean;
  /** Gesetzt = die Keyholderin trägt FÜR diesen Träger nach; ungesetzt = er selbst. */
  adminUserId?: string;
  redirectTo?: string;
}

/**
 * Der Client-Teil der Gewichts-Erfassung — für beide Wege derselbe.
 *
 * Anders als die Einträge geht das Gewicht NICHT über `/api/entries`: es ist kein `Entry`, sondern
 * eine eigene Zeile. Und bewusst nicht über die Offline-Warteschlange — bei einem Wert je Tag
 * würde eine nachgereichte Meldung nach Tagen den Tag treffen, an dem sie hochgeht, statt den, an
 * dem gewogen wurde.
 */
export default function WeightForm({
  tz, nowDefault, unitSystem, heightCm, lastWeightKg, windowHint, mobileDesktopMode, adminUserId, redirectTo,
}: Props) {
  const apiError = useApiError();
  const t = useTranslations("weightForm");
  const router = useRouter();
  const toast = useToast();
  const target = redirectTo ?? (adminUserId ? `/admin/users/${adminUserId}` : "/dashboard");

  async function submitFn(payload: WeightPayload): Promise<SubmitResult> {
    const res = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminUserId ? { ...payload, userId: adminUserId } : payload),
    });
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    // Ein Wert je Tag: eine zweite Meldung desselben Tages ersetzt die erste. Das sagt die Meldung
    // auch, statt den Nutzer im Glauben zu lassen, er habe zwei Werte erfasst.
    const { replaced } = await res.json() as { replaced: boolean };
    toast.success(replaced ? t("savedReplaced") : t("saved"));
    return { ok: true };
  }

  return (
    <WeightFormCore
      tz={tz}
      nowDefault={nowDefault}
      unitSystem={unitSystem}
      heightCm={heightCm}
      lastWeightKg={lastWeightKg}
      proofRequired={!adminUserId}
      windowHint={windowHint}
      mobileDesktopMode={mobileDesktopMode}
      submitFn={submitFn}
      onSuccess={() => router.push(target)}
      onCancel={() => router.push(target)}
    />
  );
}
