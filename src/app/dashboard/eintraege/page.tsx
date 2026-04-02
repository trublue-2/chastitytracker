import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import EntryRow from "@/app/components/EntryRow";
import EntryActions from "../EntryActions";

export default async function EintraegePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const locale = await getLocale();
  const dl = locale === "de" ? "de-CH" : "en-GB";

  const entries = await prisma.entry.findMany({
    where: { userId },
    orderBy: { startTime: "desc" },
  });

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">Einträge</h2>

      {entries.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border py-12 text-center">
          <p className="text-foreground-faint text-sm">Noch keine Einträge vorhanden.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
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
        </div>
      )}
    </main>
  );
}
