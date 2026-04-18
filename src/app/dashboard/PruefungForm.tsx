"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import PruefungFormCore from "@/app/entries/PruefungFormCore";
import type { PruefungPayload, SubmitResult } from "@/app/entries/types";

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
  initialCode?: string;
  initialKommentar?: string;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
}

export default function PruefungForm({ initial, minTime, initialCode, initialKommentar, mobileDesktopMode, redirectTo }: Props) {
  const tCommon = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: PruefungPayload): Promise<SubmitResult> {
    const res = await fetch(initial ? `/api/entries/${initial.id}` : "/api/entries", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err.error || tCommon("savingError") };
    }
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  return (
    <PruefungFormCore
      initial={initial}
      minTime={minTime}
      initialCode={initialCode}
      initialKommentar={initialKommentar}
      mobileDesktopMode={mobileDesktopMode}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={() => router.push(target)}
      onCancel={() => router.push("/dashboard")}
      submitVariant="semantic"
    />
  );
}
