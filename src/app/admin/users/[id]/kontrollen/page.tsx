import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale, mapAnforderungStatus, mapVerifikationStatus } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import KontrolleButton from "@/app/admin/KontrolleButton";
import UserNav from "../UserNav";
import { ANFORDERUNG_PILLS, getKombinierterPill } from "@/lib/kontrollePills";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";
import AdminKontrolleListClient, { type AdminKontrolleRowData } from "@/app/admin/kontrollen/AdminKontrolleListClient";

export default async function AdminUserKontrollenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const [ta, dl] = [await getTranslations("admin"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-gray-500">Benutzer nicht gefunden.</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/kontrollen`);

  const [pruefungen, alleAnforderungen, latestEntry] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: id, type: "PRUEFUNG" },
      orderBy: { startTime: "desc" },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.entry.findFirst({
      where: { userId: id, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      orderBy: { startTime: "desc" },
    }),
  ]);

  const isLocked = latestEntry?.type === "VERSCHLUSS";
  const kaByEntryId = new Map(alleAnforderungen.filter(k => k.entryId).map(k => [k.entryId!, k]));

  type Row = {
    sortTime: Date;
    imageUrl: string | null;
    anforderungStatus: AnforderungStatus | null;
    verifikationStatus: VerifikationStatus | null;
    code: string | null;
    deadline: Date | null;
    createdAt: Date | null;
    fulfilledAt: Date | null;
    submittedAt: Date | null;
    withdrawnAt: Date | null;
    kommentar: string | null;
    note: string | null;
    kontrolleId: string | null;
    entryId: string | null;
  };

  const pruefungRows: Row[] = pruefungen.map((e) => {
    const ka = kaByEntryId.get(e.id) ?? null;
    return {
      sortTime: e.startTime,
      imageUrl: e.imageUrl,
      anforderungStatus: ka ? mapAnforderungStatus(ka, e.startTime, now) : null,
      verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      code: ka?.code ?? e.kontrollCode ?? null,
      deadline: ka?.deadline ?? null,
      createdAt: ka?.createdAt ?? null,
      fulfilledAt: e.startTime,
      submittedAt: ka?.fulfilledAt ?? null,
      withdrawnAt: ka?.withdrawnAt ?? null,
      kommentar: ka?.kommentar ?? null,
      note: e.note,
      kontrolleId: ka?.id ?? null,
      entryId: e.id,
    };
  });

  const offeneRows: Row[] = alleAnforderungen
    .filter((k) => !k.entryId)
    .map((k) => ({
      sortTime: k.createdAt,
      imageUrl: null,
      anforderungStatus: mapAnforderungStatus(k, null, now),
      verifikationStatus: null,
      code: k.code,
      deadline: k.deadline,
      createdAt: k.createdAt,
      fulfilledAt: null,
      submittedAt: null,
      withdrawnAt: k.withdrawnAt,
      kommentar: k.kommentar,
      note: null,
      kontrolleId: k.id,
      entryId: null,
    }));

  const sortedOffene = [...offeneRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());
  const sortedPruefungen = [...pruefungRows].sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());

  function toItem(row: Row): AdminKontrolleRowData {
    const anfPill = !row.entryId && row.anforderungStatus ? ANFORDERUNG_PILLS[row.anforderungStatus] : null;
    const kPill = row.entryId
      ? getKombinierterPill(row.anforderungStatus, row.verifikationStatus, ta)
      : anfPill ? { label: ta(anfPill.labelKey), cls: anfPill.cls } : null;
    const timeCorrected = row.submittedAt && row.fulfilledAt && row.fulfilledAt.getTime() < row.submittedAt.getTime() - 60_000;
    return {
      imageUrl: row.imageUrl,
      kommentar: row.kommentar,
      pillLabel: kPill?.label ?? null,
      pillCls: kPill?.cls ?? null,
      code: row.code,
      fulfilledAtStr: row.fulfilledAt ? formatDateTime(row.fulfilledAt, dl) : null,
      deadlineStr: row.deadline ? formatDateTime(row.deadline, dl) : null,
      createdAtStr: row.createdAt ? formatDateTime(row.createdAt, dl) : null,
      withdrawnAtStr: row.withdrawnAt ? formatDateTime(row.withdrawnAt, dl) : null,
      timeCorrectedStr: timeCorrected
        ? `Zeit korrigiert – Angegeben: ${formatDateTime(row.fulfilledAt!, dl)} · System: ${formatDateTime(row.submittedAt!, dl)}`
        : null,
      note: row.note,
      kontrolleId: row.kontrolleId,
      entryId: row.entryId,
      anforderungStatus: row.anforderungStatus ?? "open",
      verifikationStatus: row.verifikationStatus,
    };
  }

  const labels = {
    fulfilledLabel: ta("fulfilledLabel"),
    fristLabel: ta("frist"),
    createdLabel: ta("createdLabel"),
    withdrawnLabel: ta("withdrawnLabel"),
    instructionLabel: ta("instructionLabel"),
    imageAlt: "Kontroll-Foto",
  };

  return (
    <main className="w-full max-w-5xl px-6 py-8 flex flex-col gap-6">
      <UserNav userId={id} username={user.username} current="kontrollen" />

      {isLocked && <KontrolleButton userId={id} hasEmail={!!user.email} />}

      {/* Offene Anforderungen */}
      {sortedOffene.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Offene Anforderungen</p>
          </div>
          <AdminKontrolleListClient items={sortedOffene.map(toItem)} labels={labels} />
        </div>
      )}

      {/* Kontrollen */}
      {sortedPruefungen.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Kontrollen ({sortedPruefungen.length})
            </p>
          </div>
          <AdminKontrolleListClient items={sortedPruefungen.map(toItem)} labels={labels} />
        </div>
      )}

      {sortedOffene.length === 0 && sortedPruefungen.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center text-gray-400 text-sm">
          Noch keine Kontrollen.
        </div>
      )}
    </main>
  );
}
