"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import useOfflineQueue from "@/app/hooks/useOfflineQueue";
import OeffnenFormCore from "@/app/entries/OeffnenFormCore";
import type { OeffnenPayload, CleaningConfig, LockPeriodState, SubmitResult } from "@/app/entries/types";
import type { BoxHold } from "@/lib/boxOpenOutlook";
import { entryRequest, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";
import type { ResolvedReason } from "@/lib/reasonsService";
import type { TaskWarning } from "@/lib/taskIntervals";

interface Props {
  initial?: { id: string; startTime: string; note?: string | null; oeffnenGrund?: string | null };
  grundOptions: ResolvedReason[];
  maxTime?: string;
  tz: string;
  nowDefault: string;
  lockPeriod?: LockPeriodState;
  cleaning?: CleaningConfig;
  boxHold?: BoxHold | null;
  hasBox?: boolean;
  redirectTo?: string;
  taskWarnings?: TaskWarning[];
  /** Hatte der Verschluss, der gerade endet, ein Bildersafe-Foto, geht es nach dem Speichern dorthin
   *  statt aufs Dashboard: mit der erfassten Öffnung ist der Code frei (Issue #111). Nur online —
   *  eine erst eingereihte Öffnung existiert auf dem Server noch nicht, der Code wäre noch zu. */
  codeRevealHref?: string;
}

export default function OeffnenForm({ initial, grundOptions, maxTime, tz, nowDefault, lockPeriod, cleaning, boxHold, hasBox, redirectTo, taskWarnings, codeRevealHref }: Props) {
  const apiError = useApiError();
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const { offlineFetch } = useOfflineQueue();
  const target = redirectTo ?? "/dashboard";
  const savedOnline = useRef(false);

  async function submitFn(payload: OeffnenPayload): Promise<SubmitResult> {
    const [url, init] = entryRequest(initial?.id, payload);
    // Nur beim Anlegen offline-queuefaehig; ein Edit braucht den echten Server.
    const res = initial ? await fetch(url, init) : await offlineFetch(url, init, { offlineCapture: true });
    if (res === null) return { ok: true, offline: true };
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    savedOnline.current = true;
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  function onSuccess() {
    if (initial) router.push(target);
    else window.location.href = codeRevealHref && savedOnline.current ? codeRevealHref : target;
  }

  return (
    <OeffnenFormCore
      initial={initial}
      grundOptions={grundOptions}
      maxTime={maxTime}
      tz={tz}
      nowDefault={nowDefault}
      lockPeriod={lockPeriod}
      cleaning={cleaning}
      boxHold={boxHold}
      hasBox={hasBox}
      taskWarnings={taskWarnings}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={onSuccess}
      onCancel={() => router.push(target)}
      submitVariant="semantic"
    />
  );
}
