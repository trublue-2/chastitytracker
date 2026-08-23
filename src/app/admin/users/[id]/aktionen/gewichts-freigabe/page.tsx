import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { weightTrackingEnabled } from "@/lib/constants";
import { nowDatetimeLocal } from "@/lib/utils";
import { currentWeightAverage, openWeightRelease } from "@/lib/weightReleaseService";
import { RELEASE_AVERAGE_DAYS_RANGE } from "@/lib/constants";
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

  const [sub, actor, tz, open, average] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { username: true, weightTrackingEnabled: true, heightCm: true } }),
    prisma.user.findUnique({ where: { id: actorId }, select: { unitSystem: true } }),
    getUserTimezone(id),
    openWeightRelease(id),
    // Wo er GERADE steht — ohne diese Zahl setzt die Keyholderin die Schwelle blind. Serverseitig
    // gerechnet, mit demselben Fenster wie die spätere Auswertung: ein Mittel aus alten Werten
    // stünde sonst als „heute" da, während er seit einer Woche nicht auf der Waage war.
    currentWeightAverage(id, RELEASE_AVERAGE_DAYS_RANGE.fallback),
  ]);
  if (!sub?.weightTrackingEnabled) redirect(`/admin/users/${id}/aktionen`);

  return (
    <WeightReleaseForm
      userId={id}
      subName={sub.username}
      tz={tz}
      nowDefault={nowDatetimeLocal(tz)}
      /* Die Einheit DER KEYHOLDERIN — sie tippt die Schwelle, nicht er. */
      unitSystem={(actor?.unitSystem ?? "metric") as UnitSystem}
      subHeightCm={sub.heightCm}
      hasOpen={!!open}
      averageKg={average?.averageKg ?? null}
    />
  );
}
