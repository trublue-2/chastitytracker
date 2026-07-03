import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked, getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import VerschlussForm from "./VerschlussForm";

export default async function AdminVerschlussPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [isLocked, devices, tz] = await Promise.all([getIsLocked(id), getUserDeviceOptions(id), getUserTimezone(id)]);
  if (isLocked) redirect(`/admin/users/${id}/aktionen`);

  return <VerschlussForm userId={id} devices={devices} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
