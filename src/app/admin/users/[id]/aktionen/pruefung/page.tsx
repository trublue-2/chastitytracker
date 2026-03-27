import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import PruefungForm from "./PruefungForm";

export default async function AdminPruefungPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;

  return <PruefungForm userId={id} />;
}
