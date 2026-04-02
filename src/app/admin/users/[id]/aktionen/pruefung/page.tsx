import { assertAdmin } from "@/lib/authGuards";
import PruefungForm from "./PruefungForm";

export default async function AdminPruefungPage({ params }: { params: Promise<{ id: string }> }) {
  await assertAdmin();

  const { id } = await params;

  return <PruefungForm userId={id} />;
}
