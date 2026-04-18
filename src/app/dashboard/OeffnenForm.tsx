"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OeffnenFormCore, { type OeffnenPayload, type SubmitResult } from "@/app/entries/OeffnenFormCore";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  maxTime?: string;
  sperrzeitEndetAt?: string | null;
  sperrzeitUnbefristet?: boolean;
  reinigungErlaubt?: boolean;
  reinigungMaxMinuten?: number;
  reinigungMaxProTag?: number;
  reinigungHeuteAnzahl?: number;
  redirectTo?: string;
}

export default function OeffnenForm({
  initial, maxTime,
  sperrzeitEndetAt, sperrzeitUnbefristet,
  reinigungErlaubt, reinigungMaxMinuten, reinigungMaxProTag, reinigungHeuteAnzahl,
  redirectTo,
}: Props) {
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

    if (res === null) {
      window.location.href = target;
      return { offline: true };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || tCommon("savingError") };
    }
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    if (initial) router.push(target);
    else window.location.href = target; // refresh shared layouts
    return { ok: true };
  }

  return (
    <OeffnenFormCore
      initial={initial}
      maxTime={maxTime}
      sperrzeitEndetAt={sperrzeitEndetAt}
      sperrzeitUnbefristet={sperrzeitUnbefristet}
      reinigungErlaubt={reinigungErlaubt}
      reinigungMaxMinuten={reinigungMaxMinuten}
      reinigungMaxProTag={reinigungMaxProTag}
      reinigungHeuteAnzahl={reinigungHeuteAnzahl}
      isEdit={!!initial}
      submitFn={submitFn}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
