import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { listInspectionTargets } from "@/lib/inspectionTarget";
import KontrolleForm from "./KontrolleForm";

export default async function AdminKontrollePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await assertKeyholderOrAdmin(id);

  const [user, targets] = await Promise.all([
    prisma.user.findUnique({ where: { id } }),
    listInspectionTargets(id),
  ]);
  if (!user) redirect("/admin");
  // Ohne laufendes Ziel gäbe es nichts zu kontrollieren — dieselbe Menge, die das Formular anbietet.
  if (!user.email || targets.length === 0) redirect(`/admin/users/${id}/aktionen`);

  // Die Ziele stehen hier schon (der Guard braucht sie) — durchreichen statt sie das Formular
  // gleich noch einmal über die Route holen zu lassen.
  return <KontrolleForm userId={id} targets={targets} />;
}
