"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OrgasmusFormCore from "@/app/entries/OrgasmusFormCore";
import type { OrgasmusPayload, SubmitResult } from "@/app/entries/types";
import type { ResolvedReason } from "@/lib/reasonsService";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; orgasmusArt?: string | null };
  artOptions: ResolvedReason[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  redirectTo?: string;
}

export default function OrgasmusForm({ initial, artOptions, maxTime, tz, nowDefault, redirectTo }: Props) {
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: OrgasmusPayload): Promise<SubmitResult> {
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

  return (
    <OrgasmusFormCore
      initial={initial}
      artOptions={artOptions}
      maxTime={maxTime}
      tz={tz}
      nowDefault={nowDefault}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={() => router.push(target)}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
