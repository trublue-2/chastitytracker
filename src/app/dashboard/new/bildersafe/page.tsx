import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { bildersafeMenuAction, getLatestKgEntry, getMobileDesktopMode } from "@/lib/queries";
import { bildersafeEnabled } from "@/lib/constants";
import BildersafeSealForm from "./BildersafeSealForm";

export default async function NewBildersafePage() {
  const session = await auth();
  const userId = session!.user.id;
  if (!bildersafeEnabled()) redirect("/dashboard");

  const [latest, mobileDesktopMode] = await Promise.all([
    getLatestKgEntry(userId),
    getMobileDesktopMode(userId),
  ]);
  // Versiegeln nur im verschlossenen Zustand und nur einmal pro Verschluss — dieselbe Regel wie der
  // Menüeintrag, damit ein alter Link nicht auf ein Formular führt, das die Route dann ablehnt.
  if (bildersafeMenuAction(latest) !== "seal") redirect("/dashboard");

  const [tn] = await Promise.all([getTranslations("newEntry")]);
  return (
    <EntryActionFormShell
      {...actionSign("BILDERSAFE_SEAL")}
      title={tn("bildersafeTitle")}
      subtitle={tn("bildersafeSubtitle")}
    >
      <BildersafeSealForm mobileDesktopMode={mobileDesktopMode} />
    </EntryActionFormShell>
  );
}
