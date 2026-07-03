import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import { effectiveOrgasmusArten, effectiveOeffnenGruende, resolveOrgasmusArtDisplay, resolveReasonLabel } from "@/lib/reasonsService";
import { ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Card from "@/app/components/Card";
import EmptyState from "@/app/components/EmptyState";
import EntryRow from "@/app/components/EntryRow";

const PAGE_SIZE = 20;

export default async function EintraegePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = session.user.id;
  const tz = session.user.timezone ?? APP_TZ;
  const { page: pageStr } = await searchParams;
  const page = Math.max(0, parseInt(pageStr ?? "0", 10) || 0);

  const [locale, t, tCommon, tOrgasm, tOpen] = await Promise.all([
    getLocale(),
    getTranslations("settings"),
    getTranslations("common"),
    getTranslations("orgasmForm"),
    getTranslations("openForm"),
  ]);
  const dl = toDateLocale(locale);

  const [total, entries, cfgUser] = await Promise.all([
    prisma.entry.count({ where: { userId } }),
    prisma.entry.findMany({
      where: { userId },
      orderBy: { startTime: "desc" },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        device: { select: { category: { select: { name: true, color: true, icon: true, isBuiltIn: true } } } },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { orgasmusArtenConfig: true, oeffnenGruendeConfig: true } }),
  ]);

  const orgasmCfg = effectiveOrgasmusArten(cfgUser?.orgasmusArtenConfig);
  const openCfg = effectiveOeffnenGruende(cfgUser?.oeffnenGruendeConfig);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">{t("entriesTitle")}</h1>

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
                entry={{
                  ...e,
                  category: e.device?.category && !e.device.category.isBuiltIn
                    ? { name: e.device.category.name, color: e.device.category.color, icon: e.device.category.icon }
                    : null,
                }}
                locale={dl}
                tz={tz}
                orgasmusLabel={resolveOrgasmusArtDisplay(e.orgasmusArt, orgasmCfg, tOrgasm)}
                openingLabel={e.oeffnenGrund ? resolveReasonLabel(e.oeffnenGrund, openCfg, "opening", tOpen) : null}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border-subtle">
              <Link
                href={page > 0 ? `/dashboard/eintraege?page=${page - 1}` : "#"}
                aria-disabled={page === 0}
                className={`flex items-center gap-1 text-xs font-medium transition ${page === 0 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                <ChevronLeft size={14} /> {tCommon("previous")}
              </Link>
              <span className="text-xs text-foreground-faint tabular-nums">
                {page + 1} / {totalPages}
              </span>
              <Link
                href={page < totalPages - 1 ? `/dashboard/eintraege?page=${page + 1}` : "#"}
                aria-disabled={page >= totalPages - 1}
                className={`flex items-center gap-1 text-xs font-medium transition ${page >= totalPages - 1 ? "text-foreground-faint pointer-events-none" : "text-foreground-muted hover:text-foreground"}`}
              >
                {tCommon("next")} <ChevronRight size={14} />
              </Link>
            </div>
          )}
        </Card>
      )}
    </main>
  );
}
