"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import PruefungFormCore from "@/app/entries/PruefungFormCore";
import type { PruefungPayload, SubmitResult } from "@/app/entries/types";
import { entryRequest, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    verifikationStatus?: string | null;
  };
  minTime?: string;
  tz: string;
  nowDefault: string;
  initialCode?: string;
  initialKommentar?: string;
  /** Aktives Siegel: die Siegel-Nummer muss zusätzlich zum Code auf dem Foto lesbar sein. */
  sealRequired?: boolean;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
}

export default function PruefungForm({ initial, minTime, tz, nowDefault, initialCode, initialKommentar, sealRequired, mobileDesktopMode, redirectTo }: Props) {
  const apiError = useApiError();
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: PruefungPayload): Promise<SubmitResult> {
    // Bewusst ohne offlineFetch: ein Pruefungs-Foto laesst sich nicht sinnvoll queuen.
    const [url, init] = entryRequest(initial?.id, payload);
    const res = await fetch(url, init);
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  return (
    <PruefungFormCore
      initial={initial}
      minTime={minTime}
      tz={tz}
      nowDefault={nowDefault}
      initialCode={initialCode}
      initialKommentar={initialKommentar}
      sealRequired={sealRequired}
      mobileDesktopMode={mobileDesktopMode}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={() => router.push(target)}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
