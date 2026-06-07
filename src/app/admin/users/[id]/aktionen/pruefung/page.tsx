import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import PruefungForm from "./PruefungForm";

export default async function AdminPruefungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  return <PruefungForm userId={id} />;
}
