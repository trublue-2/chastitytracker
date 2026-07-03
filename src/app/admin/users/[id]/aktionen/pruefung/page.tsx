import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { getUserTimezone } from "@/lib/queries";
import { nowDatetimeLocal } from "@/lib/utils";
import PruefungForm from "./PruefungForm";

export default async function AdminPruefungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const tz = await getUserTimezone(id);

  return <PruefungForm userId={id} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
