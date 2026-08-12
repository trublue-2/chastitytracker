import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import SettingsForm from "@/app/dashboard/settings/SettingsForm";
import { getSettingsProps } from "@/app/dashboard/settings/getSettingsProps";
import { isController } from "@/lib/ownTracker";

/**
 * Persönliche Einstellungen im blauen Adminportal — bewusst DIESELBEN wie unter /dashboard/settings
 * (identisches SettingsForm + geteiltes getSettingsProps), damit ein User in beiden Ansichten exakt
 * die gleichen Einstellungen sieht. Zugang wie zum Portal: Admins ODER Keyholder (controlsSubs);
 * der Proxy lässt Keyholder zusätzlich auf /admin/settings.
 */
export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isController(session.user)) redirect("/dashboard");

  const props = await getSettingsProps();
  return <SettingsForm {...props} />;
}
