"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import VerschlussFormCore from "@/app/entries/VerschlussFormCore";
import type { VerschlussPayload, SubmitResult } from "@/app/entries/types";
import { entryRequest, parseApiError } from "@/lib/apiClient";
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
  tz: string;
  nowDefault: string;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
  devices?: DeviceOption[];
  anforderungDeviceId?: string | null;
  bildersafe?: boolean;
  /** Box-User: „Schlüssel ist in der Box"-Bestätigung statt Bildersafe. */
  boxConfirm?: boolean;
  /** Reinigungs-Re-Lock: leichte Variante (nur Bestätigung, kein Foto/Siegel/Gerät). */
  lightRelock?: boolean;
}

export default function VerschlussForm({ initial, minTime, tz, nowDefault, mobileDesktopMode, redirectTo, devices, anforderungDeviceId, bildersafe, boxConfirm, lightRelock }: Props) {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: VerschlussPayload): Promise<SubmitResult> {
    const [url, init] = entryRequest(initial?.id, payload);
    // Nur beim Anlegen offline-queuefaehig; ein Edit braucht den echten Server.
    const res = initial ? await fetch(url, init) : await offlineFetch(url, init);
    if (res === null) return { ok: true, offline: true };
    if (!res.ok) return { ok: false, error: await parseApiError(res, t("savingError")) };
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
      tz={tz}
      nowDefault={nowDefault}
      mobileDesktopMode={mobileDesktopMode}
      devices={devices}
      anforderungDeviceId={anforderungDeviceId}
      bildersafe={bildersafe}
      boxConfirm={boxConfirm}
      lightRelock={lightRelock}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={onSuccess}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
