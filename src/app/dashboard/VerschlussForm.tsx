"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import VerschlussFormCore from "@/app/entries/VerschlussFormCore";
import type { VerschlussPayload, SubmitResult } from "@/app/entries/types";
import type { DeviceOption } from "@/lib/queries";

interface Props {
  initial?: {
    id: string;
    startTime: string;
    imageUrl?: string | null;
    imageExifTime?: string | null;
    note?: string | null;
    kontrollCode?: string | null;
    deviceId?: string | null;
  };
  minTime?: string;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
  devices?: DeviceOption[];
  anforderungDeviceId?: string | null;
}

export default function VerschlussForm({ initial, minTime, mobileDesktopMode, redirectTo, devices, anforderungDeviceId }: Props) {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: VerschlussPayload): Promise<SubmitResult> {
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
      return { ok: false, error: err.error || t("savingError") };
    }
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  // Create toggles isLocked in the shared dashboard layout — full reload
  // ensures the layout re-fetches; router.push alone would stale.
  function onSuccess() {
    if (initial) router.push(target);
    else window.location.href = target;
  }

  return (
    <VerschlussFormCore
      initial={initial}
      minTime={minTime}
      mobileDesktopMode={mobileDesktopMode}
      devices={devices}
      anforderungDeviceId={anforderungDeviceId}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={onSuccess}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
