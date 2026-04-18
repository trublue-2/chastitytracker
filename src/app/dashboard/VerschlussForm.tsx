"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import VerschlussFormCore, { type VerschlussPayload, type SubmitResult } from "@/app/entries/VerschlussFormCore";
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

    if (res === null) {
      // queued offline — full reload so isLocked in shared layout refreshes
      window.location.href = target;
      return { offline: true };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || t("savingError") };
    }
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    if (initial) router.push(target);
    else window.location.href = target; // full reload to refresh shared layouts
    return { ok: true };
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
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
