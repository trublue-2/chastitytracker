"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import PruefungFormCore from "@/app/entries/PruefungFormCore";
import type { PruefungPayload, SubmitResult } from "@/app/entries/types";
import { entryRequest, parseApiErrorCode } from "@/lib/apiClient";
import { useApiError } from "@/app/hooks/useApiError";

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
  tz: string;
  nowDefault: string;
  initialCode?: string;
  initialKommentar?: string;
  /** Aktives Siegel: die Siegel-Nummer muss zusätzlich zum Code auf dem Foto lesbar sein. */
  sealRequired?: boolean;
  /** Verlangt das getragene Gerät einen Kontroll-Code? false → das Formular fragt keinen ab und
   *  schickt keinen (Gerät mit `requireInspectionCode: false`). Default true = Bestandsverhalten. */
  codeRequired?: boolean;
  /** ZIEL der Kontrolle: das kontrollierte Gerät (Trage-Kontrolle). null = KG. */
  targetDeviceId?: string | null;
  /** Name des Ziels für die Anzeige — null beim KG. */
  targetLabel?: string | null;
  /** Id der angeforderten Kontrolle, deren Code hier steht — schaltet den „Code senden"-Knopf frei
   *  (Bedeutung und die zwei Fälle, in denen sie fehlt, an der Prop im Core). */
  codePushControlId?: string | null;
  mobileDesktopMode?: boolean;
  redirectTo?: string;
  /** Sub hat eine Heimdall-Box: zusätzliches Foto durchs Sichtfenster. */
  boxConfirm?: boolean;
  /** ZIEL der Kontrolle — nur für den Code-Push der Selbstkontrolle (siehe PruefungFormCore). */
  categoryId?: string | null;
}

export default function PruefungForm({ initial, minTime, tz, nowDefault, initialCode, initialKommentar, sealRequired, codeRequired, targetDeviceId, targetLabel, codePushControlId, categoryId, mobileDesktopMode, redirectTo, boxConfirm }: Props) {
  const apiError = useApiError();
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const toast = useToast();
  const target = redirectTo ?? "/dashboard";

  async function submitFn(payload: PruefungPayload): Promise<SubmitResult> {
    // Bewusst ohne offlineFetch: ein Pruefungs-Foto laesst sich nicht sinnvoll queuen.
    const [url, init] = entryRequest(initial?.id, payload);
    const res = await fetch(url, init);
    if (!res.ok) return { ok: false, error: apiError(await parseApiErrorCode(res)) };
    toast.success(initial ? tDash("entryUpdated") : tDash("entrySaved"));
    return { ok: true };
  }

  return (
    <PruefungFormCore
      initial={initial}
      minTime={minTime}
      tz={tz}
      nowDefault={nowDefault}
      initialCode={initialCode}
      initialKommentar={initialKommentar}
      sealRequired={sealRequired}
      codeRequired={codeRequired}
      targetDeviceId={targetDeviceId}
      targetLabel={targetLabel}
      codePushControlId={codePushControlId}
      // Der eigene Weg des Trägers: hier — und nur hier — darf auch der SELBST gewählte Code
      // einer Selbstkontrolle als Meldung aufs Gerät. Das Keyholder-Formular teilt sich diesen
      // Kern und lässt die Zusage bewusst weg: dort drückt nicht der, den die Meldung angeht.
      selfCodePush
      categoryId={categoryId}
      mobileDesktopMode={mobileDesktopMode}
      boxConfirm={boxConfirm}
      isEdit={!!initial}
      submitFn={submitFn}
      onSuccess={() => router.push(target)}
      onCancel={() => router.push(target)}
      submitVariant="semantic"
    />
  );
}
