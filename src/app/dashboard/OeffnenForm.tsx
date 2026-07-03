"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OeffnenFormCore from "@/app/entries/OeffnenFormCore";
import type { OeffnenPayload, ReinigungConfig, SperrzeitState, SubmitResult } from "@/app/entries/types";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  maxTime?: string;
  tz: string;
  nowDefault: string;
  sperrzeit?: SperrzeitState;
  reinigung?: ReinigungConfig;
  redirectTo?: string;
}

export default function OeffnenForm({ initial, maxTime, tz, nowDefault, sperrzeit, reinigung, redirectTo }: Props) {
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: OeffnenPayload): Promise<SubmitResult> {
    const url = initial ? `/api/entries/${initial.id}` : "/api/entries";
    const init: RequestInit = {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    const res = initial ? await fetch(url, init) : await offlineFetch(url, init);
    if (res === null) return { ok: true, offline: true };
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || tCommon("savingError") };
    }
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
      maxTime={maxTime}
      tz={tz}
      nowDefault={nowDefault}
      sperrzeit={sperrzeit}
      reinigung={reinigung}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={onSuccess}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
