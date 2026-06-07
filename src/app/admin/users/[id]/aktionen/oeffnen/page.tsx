import { redirect } from "next/navigation";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  if (!(await getIsLocked(id))) redirect(`/admin/users/${id}/aktionen`);

  return <OeffnenForm userId={id} />;
}
