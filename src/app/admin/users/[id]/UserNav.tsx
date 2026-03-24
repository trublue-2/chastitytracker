import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function UserNav({
  userId, username, current,
}: {
  userId: string;
  username: string;
  current: "uebersicht" | "statistik" | "vorgaben" | "kontrollen" | "strafbuch";
}) {
  const t = await getTranslations("admin");

  const tabs = [
    { label: t("overview"),   key: "uebersicht",  path: `/admin/users/${userId}` },
    { label: t("statsTitle"), key: "statistik",   path: `/admin/users/${userId}/stats` },
    { label: t("vorgaben"),   key: "vorgaben",    path: `/admin/users/${userId}/vorgaben` },
    { label: t("kontrollen"), key: "kontrollen",  path: `/admin/users/${userId}/kontrollen` },
    { label: t("strafbuch"),  key: "strafbuch",   path: `/admin/users/${userId}/strafbuch` },
  ];

  return (
    <div>
      <Link href="/admin" className="text-sm text-foreground-faint hover:text-foreground-muted transition">{t("backToUsers")}</Link>
      <h1 className="text-xl font-bold text-foreground mt-1 mb-4">{username}</h1>
      <div className="flex gap-1 border-b border-border-subtle overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <Link
              key={tab.key}
              href={tab.path}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition -mb-px border-b-2 ${
                active
                  ? "text-foreground border-foreground"
                  : "text-foreground-faint border-transparent hover:text-foreground-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
