import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { weightTrackingEnabled } from "@/lib/constants";
import { nowDatetimeLocal } from "@/lib/utils";
import { openWeightRelease } from "@/lib/weightReleaseService";
import type { UnitSystem } from "@/lib/weight";
import WeightReleaseForm from "./WeightReleaseForm";

/**
 * Die Freigabe-Vorgabe stellen (docs/gewicht-freigabe-konzept.md).
 *
 * Zwei Gates wie überall im Feature: die Instanz muss es führen, und die Keyholderin muss es bei
 * DIESEM Träger freigeschaltet haben. Ohne Messungen gäbe es nichts, woran die Vorgabe hinge.
 */
export default async function AdminWeightReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId: actorId } = await assertKeyholderOrAdmin(id);
  if (!weightTrackingEnabled()) redirect(`/admin/users/${id}/aktionen`);

  const [sub, actor, tz, open] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { weightTrackingEnabled: true, heightCm: true } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { unitSystem: true } }),
    getUserTimezone(id),
    openWeightRelease(id),
  ]);
  if (!sub?.weightTrackingEnabled) redirect(`/admin/users/${id}/aktionen`);

  return (
    <WeightReleaseForm
      userId={id}
      tz={tz}
      nowDefault={nowDatetimeLocal(tz)}
      /* Die Einheit DER KEYHOLDERIN — sie tippt die Schwelle, nicht er. */
      unitSystem={(actor?.unitSystem ?? "metric") as UnitSystem}
      subHeightCm={sub.heightCm}
      hasOpen={!!open}
    />
  );
}
