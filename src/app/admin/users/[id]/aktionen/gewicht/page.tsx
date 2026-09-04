import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { actionSign } from "@/app/entries/actionSign";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { weightTrackingEnabled } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getWeightFormProps } from "@/lib/weightFormProps";
import { weighingWindowHint } from "@/lib/weightWindows";
import AdminActionFormShell from "@/app/components/AdminActionFormShell";
import WeightForm from "@/app/dashboard/WeightForm";

/** Die Keyholderin trägt eine Messung für den Träger nach — dasselbe Formular, ohne Beleg-Pflicht:
 *  sie steht nicht vor seiner Waage. */
export default async function AdminWeightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId: actorId } = await assertKeyholderOrAdmin(id);
  if (!weightTrackingEnabled()) redirect(`/admin/users/${id}`);

  const user = await prisma.user.findUnique({ where: { id }, select: { weightTrackingEnabled: true } });
  if (!user?.weightTrackingEnabled) redirect(`/admin/users/${id}`);

  const props = await getWeightFormProps(id, actorId);
  if (!props) redirect(`/admin/users/${id}`);

  const [t, ta] = await Promise.all([getTranslations("weightForm"), getTranslations("admin")]);
  return (
    <AdminActionFormShell
      userId={id}
      backLabel={ta("aktionen")}
      {...actionSign("WEIGHT")}
      title={t("titleAdmin")}
    >
      <WeightForm {...props} windowHint={weighingWindowHint(props, t)} adminUserId={id} />
    </AdminActionFormShell>
  );
}
