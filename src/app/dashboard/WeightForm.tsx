"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
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
 * eine eigene Zeile. Der SUB-Pfad reiht offline trotzdem ein — die Zeile trägt `measuredAt` (die
 * Wiege-Zeit aus dem Formular), also trifft eine nachgereichte Messung den Tag, an dem gewogen
 * wurde, nicht den der Zustellung. Sie wird als „offline erfasst" markiert. Der Keyholder-Pfad
 * (`adminUserId`) sendet weiter direkt — die Keyholderin trägt aus der laufenden Oberfläche nach.
 */
export default function WeightForm({
  tz, nowDefault, unitSystem, heightCm, lastWeightKg, windowHint, mobileDesktopMode, adminUserId, redirectTo,
}: Props) {
  const apiError = useApiError();
  const t = useTranslations("weightForm");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? (adminUserId ? `/admin/users/${adminUserId}` : "/dashboard");

  async function submitFn(payload: WeightPayload): Promise<SubmitResult> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adminUserId ? { ...payload, userId: adminUserId } : payload),
    };
    // Keyholder-Pfad direkt, Sub-Pfad offline-queuefähig (mit „offline erfasst"-Markierung).
    const res = adminUserId
      ? await fetch("/api/weight", init)
      : await offlineFetch("/api/weight", init, { offlineCapture: true });
    // `null` = eingereiht; die Meldung „offline gespeichert" kommt aus `offlineFetch`.
    if (res === null) return { ok: true, offline: true };
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
