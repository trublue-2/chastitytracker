import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { weightTrackingEnabled } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getWeightFormProps } from "@/lib/weightFormProps";
import { weighingWindowHint } from "@/lib/weightWindows";
import WeightForm from "../../WeightForm";
import { readingColCls } from "@/app/components/inputStyles";

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

  const [tn, t] = await Promise.all([getTranslations("newEntry"), getTranslations("weightForm")]);
  return (
    <div className={`${readingColCls} py-6`}>
      <Link href="/dashboard" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{tn("back")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-6">{t("title")}</h1>
      <WeightForm {...props} windowHint={weighingWindowHint(props, t)} />
    </div>
  );
}
