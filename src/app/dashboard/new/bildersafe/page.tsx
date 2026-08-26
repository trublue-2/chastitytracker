import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getIsLocked, getMobileDesktopMode } from "@/lib/queries";
import { bildersafeEnabled } from "@/lib/constants";
import BildersafeSealForm from "./BildersafeSealForm";

export default async function NewBildersafePage() {
  const session = await auth();
  const userId = session!.user.id;
  if (!bildersafeEnabled()) redirect("/dashboard");

  const [isLocked, mobileDesktopMode] = await Promise.all([
    getIsLocked(userId),
    getMobileDesktopMode(userId),
  ]);
  // Versiegeln nur im verschlossenen Zustand (das Code-Foto hängt am aktuellen Verschluss).
  if (!isLocked) redirect("/dashboard");

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
