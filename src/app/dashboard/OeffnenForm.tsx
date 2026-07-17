"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OeffnenFormCore from "@/app/entries/OeffnenFormCore";
import type { OeffnenPayload, ReinigungConfig, SperrzeitState, SubmitResult } from "@/app/entries/types";
import type { BoxHold } from "@/lib/boxOpenOutlook";
import { entryRequest, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { ResolvedReason } from "@/lib/reasonsService";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  grundOptions: ResolvedReason[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  sperrzeit?: SperrzeitState;
  reinigung?: ReinigungConfig;
  boxHold?: BoxHold | null;
  hasBox?: boolean;
  redirectTo?: string;
}

export default function OeffnenForm({ initial, grundOptions, maxTime, tz, nowDefault, sperrzeit, reinigung, boxHold, hasBox, redirectTo }: Props) {
  const apiError = useApiError();
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: OeffnenPayload): Promise<SubmitResult> {
    const [url, init] = entryRequest(initial?.id, payload);
    // Nur beim Anlegen offline-queuefaehig; ein Edit braucht den echten Server.
    const res = initial ? await fetch(url, init) : await offlineFetch(url, init);
    if (res === null) return { ok: true, offline: true };
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  function onSuccess() {
    if (initial) router.push(target);
    else window.location.href = target;
  }

  return (
    <OeffnenFormCore
      initial={initial}
      grundOptions={grundOptions}
      maxTime={maxTime}
      tz={tz}
      nowDefault={nowDefault}
      sperrzeit={sperrzeit}
      reinigung={reinigung}
      boxHold={boxHold}
      hasBox={hasBox}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={onSuccess}
      onCancel={() => router.push(target)}
      submitVariant="semantic"
    />
  );
}
