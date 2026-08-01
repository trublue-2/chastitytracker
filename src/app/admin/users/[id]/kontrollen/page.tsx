import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import KontrolleButton from "@/app/admin/KontrolleButton";
import Card from "@/app/components/Card";
import EmptyState from "@/app/components/EmptyState";
import AdminKontrolleListClient from "@/app/admin/kontrollen/AdminKontrolleListClient";
import { getIsLocked, getActiveWearSessions, keyholderVisibleKontrolleWhere } from "@/lib/queries";
import { buildKontrolleRows, mapKontrolleRow } from "@/lib/kontrollen";
import { KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";

export default async function AdminUserKontrollenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [ta, tReason, dl] = [
    await getTranslations("admin"),
    await getTranslations("inspectionForm"),
    toDateLocale(await getLocale()),
  ];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{ta("userNotFound")}</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/kontrollen`);

  const [pruefungen, alleAnforderungen, isLocked, activeWear] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, type: "PRUEFUNG" },
      orderBy: { startTime: "desc" },
      // `device` mit Kategorie: die Zeile zeigt an, WAS kontrolliert wurde (siehe buildKontrolleRows).
      include: {
        user: { select: { username: true, timezone: true } },
        device: { select: { name: true, category: { select: { name: true, isBuiltIn: true } } } },
      },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id, ...keyholderVisibleKontrolleWhere(now) },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, timezone: true } }, ...KONTROLLE_TARGET_INCLUDE },
    }),
    getIsLocked(id),
    getActiveWearSessions(id),
  ]);

  const { pruefungRows, offeneRows } = buildKontrolleRows(pruefungen, alleAnforderungen, now);
  const sortedOffene = [...offeneRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const sortedPruefungen = [...pruefungRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const mapOpts = { t: ta, dl, includeUsername: false, viewerTz: session?.user?.timezone ?? APP_TZ, tReason };

  const tc = await getTranslations("common");
  const labels = {
    fulfilledLabel: ta("fulfilledLabel"),
    fristLabel: ta("frist"),
    withdrawnLabel: ta("withdrawnLabel"),
    scheduledForLabel: ta("scheduledForLabel"),
    instructionLabel: ta("instructionLabel"),
    noteLabel: tc("note"),
    imageAlt: ta("kontrollenTitle"),
  };

  return (
    <>
      {/* Anfordern nur mit laufendem Ziel — verschlossen oder etwas getragen (v5.0.1). */}
      {(isLocked || activeWear.length > 0) && <KontrolleButton userId={id} hasEmail={!!user.email} />}

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
