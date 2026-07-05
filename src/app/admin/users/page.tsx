import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { assertAdmin } from "@/lib/authGuards";
import { getTranslations } from "next-intl/server";
import Card from "@/app/components/Card";
import Badge from "@/app/components/Badge";
import Button from "@/app/components/Button";
import EmptyState from "@/app/components/EmptyState";
import UserAvatar from "@/app/components/UserAvatar";
import { Users, UserPlus, ChevronRight } from "lucide-react";

// SECURITY: instance-management, admin-only — nie statisch/geteilt cachen.
export const dynamic = "force-dynamic";

/** Benutzerverwaltung (Management-Bereich, admin-only): User anlegen, Rolle/Keyholder verwalten,
 *  löschen. Bewusst getrennt von der /admin-Kontroll-Übersicht — die zeigt nur Subs + Direktiven. */
export default async function UserManagementPage() {
  await assertAdmin();
  const t = await getTranslations("admin");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, role: true, email: true },
  });

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">{t("title")}</h1>

      {users.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Users size={36} />}
            title={t("noUsers")}
            description={t("noUsersDesc")}
          />
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-border-subtle">
            {users.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/users/${u.id}/einstellungen`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-surface-raised transition"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <UserAvatar username={u.username} size="md" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{u.username}</p>
                      {u.email && <p className="text-xs text-foreground-faint truncate">{u.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {u.role === "admin" && (
                      <Badge variant="neutral" label={t("roleAdmin")} size="sm" />
                    )}
                    <ChevronRight size={16} className="text-foreground-faint" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/admin/users/new">
        <Button variant="secondary" icon={<UserPlus size={15} strokeWidth={2} />} fullWidth>
          {t("newUser")}
        </Button>
      </Link>
    </main>
  );
}
