import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/authGuards";
import { getIsLocked } from "@/lib/queries";
import OeffnenForm from "./OeffnenForm";

export default async function AdminOeffnenPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;
  if (!(await getIsLocked(id))) redirect(`/admin/users/${id}/aktionen`);

  return <OeffnenForm userId={id} />;
}
