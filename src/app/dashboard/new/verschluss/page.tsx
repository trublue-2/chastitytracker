import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import VerschlussForm from "../../VerschlussForm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserDeviceOptions, getIsLocked, getOpenLockRequest, getBoxFormContext, getMobileDesktopMode } from "@/lib/queries";
import { bildersafeEnabled } from "@/lib/constants";
import { nowDatetimeLocal, safeInternalPath, APP_TZ } from "@/lib/utils";

export default async function NewVerschlussPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  // Aus der URL (Ketten-Weiterleitung der Aufgaben-Bedingungen) → geprüft, siehe safeInternalPath.
  const target = safeInternalPath((await searchParams).redirectTo) ?? undefined;
  const session = await auth();
  const userId = session!.user.id;
  const tz = session!.user.timezone ?? APP_TZ;

  const [isLocked, mobileDesktopMode, devices, offeneAnforderung, box] = await Promise.all([
    getIsLocked(userId),
    getMobileDesktopMode(userId),
    getUserDeviceOptions(userId),
    // Dieselbe Auswahl wie die Durchsetzung in POST /api/entries (dringendste zuerst) — sonst
    // schlägt das Formular Gerät X vor, während gegen Y beurteilt wird.
    getOpenLockRequest(userId),
    // Box-User (Heimdall aktiv + eigene Box): „Schlüssel ist in der Box"-Block statt Bildersafe.
    getBoxFormContext(userId),
  ]);

  if (isLocked) redirect("/dashboard");

  const { boxConfirm, boxName } = box;
  const tf = await getTranslations("lockForm");
  return (
    <EntryActionFormShell {...actionSign("VERSCHLUSS")} title={tf("title")}>
      <VerschlussForm
        tz={tz}
        nowDefault={nowDatetimeLocal(tz)}
        mobileDesktopMode={mobileDesktopMode}
        devices={devices}
        anforderungDeviceId={offeneAnforderung?.deviceId ?? null}
        redirectTo={target}
        bildersafe={!boxConfirm && bildersafeEnabled()}
        boxConfirm={boxConfirm}
        boxName={boxName}
      />
    </EntryActionFormShell>
  );
}
