import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import OrgasmusAnforderungForm from "./OrgasmusAnforderungForm";

export default async function AdminOrgasmusAnforderungPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  // The directive sets times FOR the sub → the sub's tz governs the datetime-local defaults + submit.
  const [user, tz] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { id: true } }),
    getUserTimezone(id),
  ]);
  if (!user) redirect("/admin");

  return <OrgasmusAnforderungForm userId={id} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
