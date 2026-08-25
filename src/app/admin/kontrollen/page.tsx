import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertAdmin } from "@/lib/authGuards";
import { toDateLocale, APP_TZ } from "@/lib/utils";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import EmptyState from "@/app/components/EmptyState";
import AdminKontrolleListClient from "./AdminKontrolleListClient";
import { buildKontrolleRows, isKontrolleAlarm, mapKontrolleRow } from "@/lib/kontrollen";
import { KONTROLLE_TARGET_INCLUDE } from "@/lib/queries";
import { keyholderVisibleKontrolleWhere } from "@/lib/queries";

export default async function AdminKontrollenPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await assertAdmin();
  const { userId } = await searchParams;
  const session = await auth();
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const [t, tc, tReason] = await Promise.all([
    getTranslations("admin"),
    getTranslations("common"),
    getTranslations("inspectionForm"),
  ]);
  const dl = toDateLocale(await getLocale());
  const now = new Date();

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } })
    : null;

  const [pruefungen, alleAnforderungen] = await Promise.all([
    prisma.entry.findMany({
      where: { type: "PRUEFUNG", ...(userId ? { userId } : {}) },
      orderBy: { startTime: "desc" },
      // `device` mit Kategorie: die Kontroll-Zeile zeigt an, WAS kontrolliert wurde (KG-Prüfungen
      // tragen kein Gerät, Trage-Kontrollen das gezeigte).
      include: {
        user: { select: { username: true, timezone: true } },
        device: { select: { name: true, category: { select: { name: true, isBuiltIn: true } } } },
      },
    }),
    prisma.kontrollAnforderung.findMany({
      // Keyholder-Sicht: manuell geplante Kontrollen ZEIGEN (stornierbar), nur zukünftige
      // Auto-/Zufalls-Kontrollen verbergen (Überraschungseffekt).
      where: { ...keyholderVisibleKontrolleWhere(now), ...(userId ? { userId } : {}) },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, timezone: true } }, ...KONTROLLE_TARGET_INCLUDE },
    }),
  ]);

  const { pruefungRows, offeneRows } = buildKontrolleRows(pruefungen, alleAnforderungen, now);
  const allRows = [...pruefungRows, ...offeneRows]
    .sort((a, b) => b.sortTime.getTime() - a.sortTime.getTime());

  const mapOpts = { t, dl, includeUsername: !userId, viewerTz, tReason };
  const items = allRows.filter(isKontrolleAlarm).map((r) => mapKontrolleRow(r, mapOpts));
  const allItems = allRows.map((r) => mapKontrolleRow(r, mapOpts));

  const labels = {
    fulfilledLabel: t("fulfilledLabel"),
    fristLabel: t("frist"),
    withdrawnLabel: t("withdrawnLabel"),
    scheduledForLabel: t("scheduledForLabel"),
    instructionLabel: t("instructionLabel"),
    noteLabel: tc("note"),
    imageAlt: t("kontrollenTitle"),
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
      <div className="mb-6">
        {user ? (
          <Link href={`/admin/users/${user.id}`} className="text-sm text-foreground-faint hover:text-foreground-muted transition">
            ← {user.username}
          </Link>
        ) : (
          <Link href="/admin" className="text-sm text-foreground-faint hover:text-foreground-muted transition">
            {t("backToOverview")}
          </Link>
        )}
        <h1 className="text-xl font-bold text-foreground mt-1">
          {t("alarmeTitle")}{user ? ` – ${user.username}` : ""}
        </h1>
        <p className="text-sm text-foreground-faint mt-0.5">{t("alarmeCount", { count: items.length })}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={32} />}
          title={t("noKontrollenYet")}
        />
      ) : (
        <AdminKontrolleListClient items={items} allItems={allItems} labels={labels} />
      )}
    </main>
  );
}
