import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale } from "@/lib/utils";
import { assertAdmin } from "@/lib/authGuards";
import Link from "next/link";
import EntryRow from "@/app/components/EntryRow";
import EntryActions from "@/app/dashboard/EntryActions";

const PAGE_SIZE = 100;

export default async function AdminUserEintraegePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  await assertAdmin();

  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const [locale, t, tStats] = await Promise.all([
    getLocale(),
    getTranslations("common"),
    getTranslations("stats"),
  ]);
  const dl = toDateLocale(locale);

  const [total, entries] = await Promise.all([
    prisma.entry.count({ where: { userId: id } }),
    prisma.entry.findMany({
      where: { userId: id },
      orderBy: { startTime: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const base = `/admin/users/${id}/eintraege`;

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">{tStats("allEntries")}</h2>
        <span className="text-xs text-foreground-faint tabular-nums">{total} {t("total")}</span>
      </div>

      {entries.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border py-12 text-center">
          <p className="text-foreground-faint text-sm">{t("noEntriesYet")}</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                locale={dl}
                actions={<EntryActions id={e.id} editHref={`/dashboard/edit/${e.id}?from=admin&userId=${id}`} />}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
              <Link
                href={page > 0 ? `${base}?page=${page - 1}` : "#"}
                aria-disabled={page === 0}
                className={`flex items-center gap-1 text-xs font-medium transition ${page === 0 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                <ChevronLeft size={14} /> {t("previous")}
              </Link>
              <span className="text-xs text-foreground-faint tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Link
                href={page < totalPages - 1 ? `${base}?page=${page + 1}` : "#"}
                aria-disabled={page >= totalPages - 1}
                className={`flex items-center gap-1 text-xs font-medium transition ${page >= totalPages - 1 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                {t("next")} <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
