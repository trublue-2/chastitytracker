import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import { ClipboardCheck } from "lucide-react";
import KontrolleButton from "@/app/admin/KontrolleButton";
import EmptyState from "@/app/components/EmptyState";
import Section from "@/app/components/Section";
import AdminKontrolleListClient from "@/app/admin/kontrollen/AdminKontrolleListClient";
import { keyholderVisibleKontrolleWhere } from "@/lib/queries";
import { buildKontrolleRows, mapKontrolleRow } from "@/lib/kontrollen";
import { KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";
import { listInspectionTargets } from "@/lib/inspectionTarget";

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

  const [pruefungen, alleAnforderungen, targets] = await Promise.all([
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
    // Dieselbe Ziel-Menge wie das Formular (inkl. Kategorien-Feature-Flag) — ein eigener
    // Lock-/Trage-Check hier wäre eine zweite Wahrheit darüber, wann Anfordern überhaupt geht.
    listInspectionTargets(id),
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
      {targets.length > 0 && <KontrolleButton userId={id} hasEmail={!!user.email} targets={targets} />}

      {sortedOffene.length > 0 && (
        <Section title={ta("openRequests")}>
          <AdminKontrolleListClient items={sortedOffene.map((r) => mapKontrolleRow(r, mapOpts))} labels={labels} />
        </Section>
      )}

      {sortedPruefungen.length > 0 && (
        <Section title={ta("inspectionsCount", { count: sortedPruefungen.length })}>
          <AdminKontrolleListClient items={sortedPruefungen.map((r) => mapKontrolleRow(r, mapOpts))} labels={labels} />
        </Section>
      )}

      {sortedOffene.length === 0 && sortedPruefungen.length === 0 && (
        <EmptyState
          icon={<ClipboardCheck size={32} />}
          title={ta("noKontrollenYet")}
        />
      )}
    </>
  );
}
