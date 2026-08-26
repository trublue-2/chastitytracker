import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { bildersafeEnabled } from "@/lib/constants";
import { getCurrentSealedCode, isCodePhotoRevealed } from "@/lib/queries";
import CodeAnzeigen from "./CodeAnzeigen";

export default async function ShowBildersafeCodePage() {
  const session = await auth();
  const userId = session!.user.id;
  if (!bildersafeEnabled()) redirect("/dashboard");

  const latest = await getCurrentSealedCode(userId);
  const [tn] = await Promise.all([getTranslations("newEntry")]);
  const revealed = latest ? await isCodePhotoRevealed({ userId, startTime: latest.startTime }) : false;

  return (
    <EntryActionFormShell
      {...actionSign("BILDERSAFE_SHOW")}
      title={tn("bildersafeShowTitle")}
    >
      <CodeAnzeigen codeImageUrl={latest?.codeImageUrl ?? null} revealed={revealed} />
    </EntryActionFormShell>
  );
}
