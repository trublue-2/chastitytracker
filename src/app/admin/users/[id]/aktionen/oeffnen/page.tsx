import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked, getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import { effectiveOeffnenGruende, resolveReasonList } from "@/lib/reasonsService";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  // Entry is created FOR the sub → the sub's reason config governs the options.
  const [locked, tz, user, tOpen] = await Promise.all([
    getIsLocked(id),
    getUserTimezone(id),
    prisma.user.findUnique({ where: { id }, select: { oeffnenGruendeConfig: true } }),
    getTranslations("openForm"),
  ]);
  if (!locked) redirect(`/admin/users/${id}/aktionen`);

  const grundOptions = resolveReasonList(effectiveOeffnenGruende(user?.oeffnenGruendeConfig), "opening", tOpen);

  return <OeffnenForm userId={id} grundOptions={grundOptions} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
