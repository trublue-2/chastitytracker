import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { effectiveOrgasmusArten, resolveReasonList } from "@/lib/reasonsService";
import OrgasmusAnforderungForm from "./OrgasmusAnforderungForm";

export default async function AdminOrgasmusAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  // The directive sets times FOR the sub → the sub's tz governs the datetime-local defaults + submit.
  // The vorgegebeneArt list is the SUB's resolved orgasm types (their custom config, or built-in defaults).
  const [user, tz, tOrgasm] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { orgasmusArtenConfig: true } }),
    getUserTimezone(id),
    getTranslations("orgasmForm"),
  ]);
  if (!user) redirect("/admin");

  const artOptions = resolveReasonList(effectiveOrgasmusArten(user.orgasmusArtenConfig), "orgasm", tOrgasm);

  return <OrgasmusAnforderungForm userId={id} artOptions={artOptions} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
