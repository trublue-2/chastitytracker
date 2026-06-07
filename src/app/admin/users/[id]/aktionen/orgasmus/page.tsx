import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import OrgasmusForm from "./OrgasmusForm";

export default async function AdminOrgasmusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  return <OrgasmusForm userId={id} />;
}
