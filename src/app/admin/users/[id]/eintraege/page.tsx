import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Lock, LockOpen, ClipboardList, Droplets } from "lucide-react";
import { getLocale } from "next-intl/server";

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

export default async function AdminUserEintraegePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/admin");

  const locale = await getLocale();
  const dl = locale === "de" ? "de-CH" : "en-GB";

  const entries = await prisma.entry.findMany({
    where: { userId: id },
    orderBy: { startTime: "desc" },
  });

  return (
    <main className="w-full max-w-3xl px-4 sm:px-6 py-6 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">Alle Einträge</h2>

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
                  {e.startTime.toLocaleString(dl, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
                {e.orgasmusArt && (
                  <span className="text-xs text-[var(--color-orgasm)] font-medium">{e.orgasmusArt}</span>
                )}
                {e.note && (
                  <span className="text-xs text-foreground-faint italic truncate min-w-0">„{e.note}"</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
