import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked, getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [locked, tz] = await Promise.all([getIsLocked(id), getUserTimezone(id)]);
  if (!locked) redirect(`/admin/users/${id}/aktionen`);

  return <OeffnenForm userId={id} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
