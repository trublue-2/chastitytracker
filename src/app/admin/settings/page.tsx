import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBuildDate } from "@/lib/utils";
import AdminSettingsForm from "./AdminSettingsForm";
import pkg from "../../../../package.json";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, email: true, role: true },
  });
  if (!user) return null;

  return (
    <AdminSettingsForm
      userId={user.id}
      username={user.username}
      email={user.email}
      version={pkg.version}
      buildDate={formatBuildDate()}
    />
  );
}
