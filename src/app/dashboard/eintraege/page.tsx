import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";
import { ClipboardList } from "lucide-react";
import Card from "@/app/components/Card";
import EmptyState from "@/app/components/EmptyState";
import EntryRow from "@/app/components/EntryRow";
import EntryActions from "../EntryActions";

export default async function EintraegePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const [locale, t] = await Promise.all([getLocale(), getTranslations("settings")]);
  const dl = toDateLocale(locale);

  const entries = await prisma.entry.findMany({
    where: { userId },
    orderBy: { startTime: "desc" },
  });

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">{t("entriesTitle")}</h2>

      {entries.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<ClipboardList size={36} />}
            title={t("entriesTitle")}
            description={t("entriesEmpty")}
          />
        </Card>
      ) : (
        <Card padding="none">
          <div className="divide-y divide-border-subtle">
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                locale={dl}
                actions={<EntryActions id={e.id} editHref={`/dashboard/edit/${e.id}?from=eintraege`} showDelete={false} />}
              />
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}
