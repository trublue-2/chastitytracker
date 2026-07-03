import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import { effectiveOrgasmusArten, resolveOrgasmusOptions } from "@/lib/reasonsService";
import OrgasmusForm from "./OrgasmusForm";

export default async function AdminOrgasmusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  // Entry is created FOR the sub → the sub's reason config governs the options.
  const [tz, user, tOrgasm] = await Promise.all([
    getUserTimezone(id),
    prisma.user.findUnique({ where: { id }, select: { orgasmusArtenConfig: true } }),
    getTranslations("orgasmForm"),
  ]);

  const artOptions = resolveOrgasmusOptions(effectiveOrgasmusArten(user?.orgasmusArtenConfig), tOrgasm);

  return <OrgasmusForm userId={id} artOptions={artOptions} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
