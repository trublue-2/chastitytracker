import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, toDateLocale, mapAnforderungStatus, mapVerifikationStatus, isTimeCorrected } from "@/lib/utils";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { ANFORDERUNG_PILLS, getKombinierterPill } from "@/lib/kontrollePills";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";
import AdminKontrolleListClient, { type AdminKontrolleRowData } from "./AdminKontrolleListClient";

export default async function AdminKontrollenPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await auth();
  const { userId } = await searchParams;
  const t = await getTranslations("admin");
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
    : null;

  const [pruefungen, alleAnforderungen] = await Promise.all([
    prisma.entry.findMany({
      where: { type: "PRUEFUNG", ...(userId ? { userId } : {}) },
      orderBy: { startTime: "desc" },
      include: { user: { select: { username: true } } },
    }),
    prisma.kontrollAnforderung.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
  ]);

  const kaByEntryId = new Map(alleAnforderungen.filter(k => k.entryId).map(k => [k.entryId!, k]));

  type Row = {
    sortTime: Date;
    imageUrl: string | null;
    username: string;
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
      username: e.user.username,
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
      username: k.user.username,
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

  const rows = [...pruefungRows, ...offeneRows]
    .filter((row) => {
      if (!row.entryId) return true; // offene Anforderung — immer Alarm
      if (row.verifikationStatus === "unverified") return true; // nicht verifiziert
      if (row.verifikationStatus === "rejected") return true; // abgelehnt
      if (row.anforderungStatus === "open" || row.anforderungStatus === "overdue") return true;
      return false;
    })
    .sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());

  const items: AdminKontrolleRowData[] = rows.map((row) => {
    const anfPill = !row.entryId && row.anforderungStatus ? ANFORDERUNG_PILLS[row.anforderungStatus] : null;
    const kPill = row.entryId
      ? getKombinierterPill(row.anforderungStatus, row.verifikationStatus, t)
      : anfPill ? { label: t(anfPill.labelKey), cls: anfPill.cls } : null;
    const timeCorrected = row.submittedAt && row.fulfilledAt && row.fulfilledAt.getTime() < row.submittedAt.getTime() - 60_000;
    return {
      imageUrl: row.imageUrl,
      kommentar: row.kommentar,
      pillLabel: kPill?.label ?? null,
      pillCls: kPill?.cls ?? null,
      username: userId ? null : row.username,
      code: row.code,
      fulfilledAtStr: row.fulfilledAt ? formatDateTime(row.fulfilledAt, dl) : null,
      deadlineStr: row.deadline ? formatDateTime(row.deadline, dl) : null,
      createdAtStr: row.createdAt ? formatDateTime(row.createdAt, dl) : null,
      withdrawnAtStr: row.withdrawnAt ? formatDateTime(row.withdrawnAt, dl) : null,
      timeCorrectedStr: timeCorrected
        ? `${t("timeCorrected")} – ${t("givenLabel")}: ${formatDateTime(row.fulfilledAt!, dl)} · ${t("systemLabel")}: ${formatDateTime(row.submittedAt!, dl)}`
        : null,
      note: row.note,
      kontrolleId: row.kontrolleId,
      entryId: row.entryId,
      anforderungStatus: row.anforderungStatus ?? "open",
      verifikationStatus: row.verifikationStatus,
    };
  });

  const labels = {
    fulfilledLabel: t("fulfilledLabel"),
    fristLabel: t("frist"),
    createdLabel: t("createdLabel"),
    withdrawnLabel: t("withdrawnLabel"),
    instructionLabel: t("instructionLabel"),
    imageAlt: t("kontrollenTitle"),
  };

  return (
    <main className="flex-1 w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        {user ? (
          <Link href={`/admin/users/${user.id}`} className="text-sm text-foreground-faint hover:text-foreground-muted transition">
            ← {user.username}
          </Link>
        ) : (
          <Link href="/admin" className="text-sm text-foreground-faint hover:text-foreground-muted transition">
            {t("backToUsers")}
          </Link>
        )}
        <h1 className="text-xl font-bold text-foreground mt-1">
          {t("alarmeTitle")}{user ? ` – ${user.username}` : ""}
        </h1>
        <p className="text-sm text-foreground-faint mt-0.5">{t("alarmeCount", { count: rows.length })}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border py-20 text-center text-foreground-faint text-sm">
          {t("noKontrollenYet")}
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <AdminKontrolleListClient items={items} labels={labels} />
        </div>
      )}
    </main>
  );
}
