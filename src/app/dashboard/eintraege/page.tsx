import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import { effectiveOrgasmusArten, effectiveOeffnenGruende, resolveOrgasmusArtDisplay, resolveReasonLabel } from "@/lib/reasonsService";
import { ClipboardList } from "lucide-react";
import EmptyState from "@/app/components/EmptyState";
import EntryRow from "@/app/components/EntryRow";
import DayGroups from "@/app/components/DayGroups";
import ListPagerLinks from "@/app/components/ListPagerLinks";
import { readingColCls } from "@/app/components/inputStyles";

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
    <main className={`${readingColCls} py-6 flex flex-col gap-2`}>
      {/* Der Titel steht in der Serif und ohne Kasten darunter: die Liste IST die Seite. Ein
          Rahmen um sie herum sagt nichts, was der Rand der Spalte nicht schon sagt. */}
      <h1 className="font-serif text-titel text-foreground">{t("entriesTitle")}</h1>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={36} />}
          title={t("entriesTitle")}
          description={t("entriesEmpty")}
        />
      ) : (
        <>
          <DayGroups
            locale={dl}
            tz={tz}
            today={tCommon("today")}
            yesterday={tCommon("yesterday")}
            rows={entries.map((e) => ({
              at: e.startTime,
              node: (
                <EntryRow
                  key={e.id}
                  timeOnly
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
              ),
            }))}
          />
          <ListPagerLinks
            page={page}
            totalPages={totalPages}
            href={(p) => `/dashboard/eintraege?page=${p}`}
            previousLabel={tCommon("previous")}
            nextLabel={tCommon("next")}
          />
        </>
      )}
    </main>
  );
}
