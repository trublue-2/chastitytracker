import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked } from "@/lib/queries";
import VerschlussForm from "./VerschlussForm";

export default async function AdminVerschlussPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [isLocked, devices] = await Promise.all([getIsLocked(id), getUserDeviceOptions(id)]);
  if (isLocked) redirect(`/admin/users/${id}/aktionen`);

  return <VerschlussForm userId={id} devices={devices} />;
}
