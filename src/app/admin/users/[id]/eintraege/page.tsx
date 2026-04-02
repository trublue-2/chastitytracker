import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Lock, LockOpen, ClipboardList, Droplets, ChevronLeft, ChevronRight } from "lucide-react";
import { getLocale } from "next-intl/server";
import { formatDateTime, toDateLocale } from "@/lib/utils";
import { assertAdmin } from "@/lib/authGuards";
import Link from "next/link";

const PAGE_SIZE = 100;

const TYPE_LABELS: Record<string, string> = {
  VERSCHLUSS: "Verschluss",
  OEFFNEN: "Öffnen",
  PRUEFUNG: "Prüfung",
  ORGASMUS: "Orgasmus",
};

const TYPE_COLORS: Record<string, string> = {
  VERSCHLUSS: "text-foreground-muted",
  OEFFNEN: "text-foreground-muted",
  PRUEFUNG: "text-[var(--color-inspect)]",
  ORGASMUS: "text-[var(--color-orgasm)]",
};

const ICONS: Record<string, React.ReactNode> = {
  VERSCHLUSS: <Lock size={12} />,
  OEFFNEN: <LockOpen size={12} />,
  PRUEFUNG: <ClipboardList size={12} />,
  ORGASMUS: <Droplets size={12} />,
};

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

  const dl = toDateLocale(await getLocale());

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
        <h2 className="text-lg font-bold text-foreground">Alle Einträge</h2>
        <span className="text-xs text-foreground-faint tabular-nums">{total} total</span>
      </div>

      {entries.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border py-12 text-center">
          <p className="text-foreground-faint text-sm">Noch keine Einträge vorhanden.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="divide-y divide-border-subtle">
            {entries.map((e) => (
              <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                <span className={`flex items-center gap-1 text-xs font-semibold w-24 flex-shrink-0 ${TYPE_COLORS[e.type] ?? "text-foreground-muted"}`}>
                  {ICONS[e.type]}
                  {TYPE_LABELS[e.type] ?? e.type}
                </span>
                <span className="text-sm text-foreground tabular-nums">
                  {formatDateTime(e.startTime, dl)}
                </span>
                {e.orgasmusArt && (
                  <span className="text-xs text-[var(--color-orgasm)] font-medium">{e.orgasmusArt}</span>
                )}
                {e.type === "VERSCHLUSS" && e.kontrollCode && (
                  <span className="text-xs text-[var(--color-lock)] font-mono tabular-nums">#{e.kontrollCode}</span>
                )}
                {e.note && (
                  <span className="text-xs text-foreground-faint italic truncate min-w-0">„{e.note}"</span>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
              <Link
                href={page > 0 ? `${base}?page=${page - 1}` : "#"}
                aria-disabled={page === 0}
                className={`flex items-center gap-1 text-xs font-medium transition ${page === 0 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                <ChevronLeft size={14} /> Zurück
              </Link>
              <span className="text-xs text-foreground-faint tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Link
                href={page < totalPages - 1 ? `${base}?page=${page + 1}` : "#"}
                aria-disabled={page >= totalPages - 1}
                className={`flex items-center gap-1 text-xs font-medium transition ${page >= totalPages - 1 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                Weiter <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
