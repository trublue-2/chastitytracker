import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import KontrolleButton from "@/app/admin/KontrolleButton";
import Card from "@/app/components/Card";
import EmptyState from "@/app/components/EmptyState";
import AdminKontrolleListClient from "@/app/admin/kontrollen/AdminKontrolleListClient";
import { getIsLocked, keyholderVisibleKontrolleWhere } from "@/lib/queries";
import { buildKontrolleRows, mapKontrolleRow } from "@/lib/kontrollen";

export default async function AdminUserKontrollenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [ta, dl] = [await getTranslations("admin"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{ta("userNotFound")}</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/kontrollen`);

  const [pruefungen, alleAnforderungen, isLocked] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, type: "PRUEFUNG" },
      orderBy: { startTime: "desc" },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id, ...keyholderVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
    }),
    getIsLocked(id),
  ]);

  const { pruefungRows, offeneRows } = buildKontrolleRows(pruefungen, alleAnforderungen, now);
  const sortedOffene = [...offeneRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const sortedPruefungen = [...pruefungRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const mapOpts = { t: ta, dl, includeUsername: false };

  const tc = await getTranslations("common");
  const labels = {
    fulfilledLabel: ta("fulfilledLabel"),
    fristLabel: ta("frist"),
    createdLabel: ta("createdLabel"),
    withdrawnLabel: ta("withdrawnLabel"),
    scheduledForLabel: ta("scheduledForLabel"),
    instructionLabel: ta("instructionLabel"),
    noteLabel: tc("note"),
    imageAlt: ta("kontrollenTitle"),
  };

  return (
    <>
      {isLocked && <KontrolleButton userId={id} hasEmail={!!user.email} />}

      {sortedOffene.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">{ta("openRequests")}</p>
          </div>
          <AdminKontrolleListClient items={sortedOffene.map((r) => mapKontrolleRow(r, mapOpts))} labels={labels} />
        </Card>
      )}

      {sortedPruefungen.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border-subtle">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-faint">
              {ta("inspectionsCount", { count: sortedPruefungen.length })}
            </p>
          </div>
          <AdminKontrolleListClient items={sortedPruefungen.map((r) => mapKontrolleRow(r, mapOpts))} labels={labels} />
        </Card>
      )}

      {sortedOffene.length === 0 && sortedPruefungen.length === 0 && (
        <Card padding="none">
          <EmptyState
            icon={<ClipboardCheck size={32} />}
            title={ta("noKontrollenYet")}
          />
        </Card>
      )}
    </>
  );
}
