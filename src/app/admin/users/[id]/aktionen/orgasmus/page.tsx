import { assertAdmin } from "@/lib/authGuards";
import OrgasmusForm from "./OrgasmusForm";

export default async function AdminOrgasmusPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  return <OrgasmusForm userId={id} />;
}
