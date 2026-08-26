import { EntryActionFormShell } from "@/app/components/AdminActionFormShell";
import { actionSign } from "@/app/entries/actionSign";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { weightTrackingEnabled } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getWeightFormProps } from "@/lib/weightFormProps";
import { weighingWindowHint } from "@/lib/weightWindows";
import WeightForm from "../../WeightForm";

/** Der Träger erfasst sein Gewicht. Beide Schalter gelten auch hier: die Seite gibt es nicht, wenn
 *  die Instanz das Feature nicht führt oder die Keyholderin es nicht freigeschaltet hat. */
export default async function NewWeightPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");
  if (!weightTrackingEnabled()) redirect("/dashboard");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { weightTrackingEnabled: true } });
  if (!user?.weightTrackingEnabled) redirect("/dashboard");

  const props = await getWeightFormProps(userId, userId);
  if (!props) redirect("/dashboard");

  const [t] = await Promise.all([getTranslations("weightForm")]);
  return (
    <EntryActionFormShell {...actionSign("WEIGHT")} title={t("title")}>
      <WeightForm {...props} windowHint={weighingWindowHint(props, t)} />
    </EntryActionFormShell>
  );
}
