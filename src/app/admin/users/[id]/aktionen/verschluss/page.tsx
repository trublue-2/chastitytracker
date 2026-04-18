import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/authGuards";
import { getUserDeviceOptions, getIsLocked } from "@/lib/queries";
import VerschlussForm from "./VerschlussForm";

export default async function AdminVerschlussPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;
  const [isLocked, devices] = await Promise.all([getIsLocked(id), getUserDeviceOptions(id)]);
  if (isLocked) redirect(`/admin/users/${id}/aktionen`);

  return <VerschlussForm userId={id} devices={devices} />;
}
