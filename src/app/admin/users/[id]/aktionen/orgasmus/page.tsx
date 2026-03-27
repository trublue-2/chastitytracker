import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import OrgasmusForm from "./OrgasmusForm";

export default async function AdminOrgasmusPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;

  return <OrgasmusForm userId={id} />;
}
