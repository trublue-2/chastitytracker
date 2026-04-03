import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import ChangePasswordButton from "@/app/admin/ChangePasswordButton";
import ChangeEmailButton from "@/app/admin/ChangeEmailButton";
import Card from "@/app/components/Card";

export default async function AdminSettingsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user) return null;

  const t = await getTranslations("admin");

  return (
    <main className="flex-1 w-full max-w-2xl px-4 sm:px-6 py-8">
      <h1 className="text-xl font-bold text-foreground mb-6">{t("einstellungen")}</h1>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3 pb-4 border-b border-border-subtle">
          <div className="w-10 h-10 rounded-full bg-surface-raised flex items-center justify-center text-foreground font-bold text-lg">
            {user.name?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div>
            <p className="font-bold text-foreground">{user.name}</p>
            <span className="text-xs font-semibold text-foreground-faint bg-surface-raised px-2 py-0.5 rounded-full">{t("roleAdmin")}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{t("sectionCredentials")}</p>
          <div className="flex flex-wrap gap-2">
            <ChangeEmailButton userId={user.id} currentEmail={user.email ?? null} />
            <ChangePasswordButton userId={user.id} />
          </div>
        </div>
      </Card>
    </main>
  );
}
