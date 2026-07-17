"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OrgasmusFormCore from "@/app/entries/OrgasmusFormCore";
import type { OrgasmusPayload, SubmitResult } from "@/app/entries/types";
import { entryRequest, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { OrgasmusOption } from "@/lib/reasonsService";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; orgasmusArt?: string | null };
  artOptions: OrgasmusOption[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  redirectTo?: string;
}

export default function OrgasmusForm({ initial, artOptions, maxTime, tz, nowDefault, redirectTo }: Props) {
  const apiError = useApiError();
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: OrgasmusPayload): Promise<SubmitResult> {
    const [url, init] = entryRequest(initial?.id, payload);
    // Nur beim Anlegen offline-queuefaehig; ein Edit braucht den echten Server.
    const res = initial ? await fetch(url, init) : await offlineFetch(url, init);
    if (res === null) return { ok: true, offline: true };
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
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
      onCancel={() => router.push(target)}
      submitVariant="semantic"
    />
  );
}
