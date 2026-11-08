import { assertKeyholderOrAdmin } from "@/lib/auth/authGuards";
import { getUserTimezone } from "@/lib/entries/queries";
import { nowDatetimeLocal } from "@/lib/shared/time";
import VergehenForm from "./VergehenForm";

export default async function AdminVergehenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  // Der Zeitpunkt sagt, wann es beim SUB passiert ist — also seine Zeitzone, wie bei den übrigen
  // Aktions-Formularen. Sonst notierte ein Keyholder auf Reisen um Stunden daneben.
  const tz = await getUserTimezone(id);

  return <VergehenForm userId={id} tz={tz} nowDefault={nowDatetimeLocal(tz)} />;
}
