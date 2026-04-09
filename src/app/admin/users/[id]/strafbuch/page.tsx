import { auth } from "@/lib/auth";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale, mapAnforderungStatus, formatDateTime, formatDate } from "@/lib/utils";
import { getLocale, getTranslations } from "next-intl/server";
import StrafbuchClient, { type KontrollRow, type UnerlaubteOeffnungRow, type StrafeRecordData, type ReinigungLimitRow } from "./StrafbuchClient";

export default async function StrafbuchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  const [t, dl] = [await getTranslations("admin"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/strafbuch`);

  const [oeffnungen, sperrzeiten, kontrollAnforderungen, strafeRecordsRaw, reinigungLimitRecords] = await Promise.all([
    prisma.entry.findMany({ where: { userId: id, type: "OEFFNEN" }, orderBy: { startTime: "desc" } }),
    prisma.verschlussAnforderung.findMany({ where: { userId: id, art: "SPERRZEIT" } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId: id, entryId: { not: null } },
      include: { entry: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.strafeRecord.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" } }),
    // REINIGUNG_LIMIT: fetch strafe records + their linked entries
    prisma.strafeRecord.findMany({
      where: { userId: id, offenseType: "REINIGUNG_LIMIT" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Fetch OEFFNEN entries for REINIGUNG_LIMIT offenses
  const reinigungEntryIds = reinigungLimitRecords.map(r => r.refId);
  const reinigungEntries = reinigungEntryIds.length > 0
    ? await prisma.entry.findMany({ where: { id: { in: reinigungEntryIds } } })
    : [];

  const reinigungLimitVergehen: ReinigungLimitRow[] = reinigungLimitRecords.map(r => {
    const entry = reinigungEntries.find(e => e.id === r.refId);
    return {
      entryId: r.refId,
      startTimeStr: entry ? formatDateTime(entry.startTime, dl) : "–",
      note: entry?.note ?? null,
    };
  });

  // Unerlaubte Öffnungen
  const unerlaubteOeffnungen: UnerlaubteOeffnungRow[] = oeffnungen
    .filter((o) =>
      sperrzeiten.some((s) => {
        const nachSperrzeit = o.startTime >= s.createdAt;
        const vorEnde = s.endetAt === null || o.startTime < s.endetAt;
        const nichtZurueckgezogen = s.withdrawnAt === null || s.withdrawnAt > o.startTime;
        return nachSperrzeit && vorEnde && nichtZurueckgezogen;
      })
    )
    .map((o) => {
      const aktiveSperrzeit = sperrzeiten.find((s) => {
        const nachSperrzeit = o.startTime >= s.createdAt;
        const vorEnde = s.endetAt === null || o.startTime < s.endetAt;
        const nichtZurueckgezogen = s.withdrawnAt === null || s.withdrawnAt > o.startTime;
        return nachSperrzeit && vorEnde && nichtZurueckgezogen;
      });
      return {
        id: o.id,
        startTimeStr: formatDateTime(o.startTime, dl),
        note: o.note,
        sperrzetEndetAtStr: aktiveSperrzeit?.endetAt ? formatDateTime(aktiveSperrzeit.endetAt, dl) : null,
        sperrzetUnbefristet: !!aktiveSperrzeit && aktiveSperrzeit.endetAt === null,
      };
    });

  // Zu spät erfüllte Kontrollen
  const zuSpaet: KontrollRow[] = kontrollAnforderungen
    .filter((k) => mapAnforderungStatus(k, k.entry?.startTime ?? null, now) === "late")
    .map((k) => {
      const backdated = !!(k.fulfilledAt && k.entry?.startTime &&
        k.entry.startTime.getTime() < k.deadline.getTime() &&
        k.fulfilledAt.getTime() > k.deadline.getTime());
      return {
        id: k.id,
        code: k.code,
        deadlineStr: formatDateTime(k.deadline, dl),
        fulfilledAtStr: k.fulfilledAt ? formatDateTime(k.fulfilledAt, dl) : null,
        entryStartTimeStr: k.entry?.startTime ? formatDateTime(k.entry.startTime, dl) : null,
        backdated,
        kommentar: k.kommentar,
        entryNote: k.entry?.note ?? null,
      };
    });

  // Abgelehnte Kontrollen
  const abgelehnt: KontrollRow[] = kontrollAnforderungen
    .filter((k) => k.entry?.verifikationStatus === "rejected")
    .map((k) => ({
      id: k.id,
      code: k.code,
      deadlineStr: formatDateTime(k.deadline, dl),
      fulfilledAtStr: k.fulfilledAt ? formatDateTime(k.fulfilledAt, dl) : null,
      entryStartTimeStr: k.entry?.startTime ? formatDateTime(k.entry.startTime, dl) : null,
      backdated: false,
      kommentar: k.kommentar,
      entryNote: k.entry?.note ?? null,
    }));

  const strafeRecords: StrafeRecordData[] = strafeRecordsRaw.map((r) => ({
    refId: r.refId,
    bestraftDatumStr: formatDate(r.bestraftDatum, dl),
    notiz: r.notiz,
  }));

  const labels = {
    lockedUntil: t("lockedUntil"),
    lockedIndefinite: t("lockedIndefinite"),
    frist: t("frist"),
    systemLabel: t("systemLabel"),
    givenLabel: t("givenLabel"),
    timeCorrected: t("timeCorrected"),
    fulfilledLabel: t("fulfilledLabel"),
    instructionLabel: t("instructionLabel"),
    strafbuchUnerlaubteOeffnungen: t("strafbuchUnerlaubteOeffnungen"),
    strafbuchZuSpaet: t("strafbuchZuSpaet"),
    strafbuchAbgelehnt: t("strafbuchAbgelehnt"),
    strafbuchEmpty: t("strafbuchEmpty"),
    strafbuchNoEntries: t("strafbuchNoEntries"),
    strafbuchWurdeBestraft: t("strafbuchWurdeBestraft"),
    strafbuchBestraftMarkieren: t("strafbuchBestraftMarkieren"),
    strafbuchBestraftDatum: t("strafbuchBestraftDatum"),
    strafbuchNotiz: t("strafbuchNotiz"),
    strafbuchBestraftBadge: t("strafbuchBestraftBadge"),
    strafbuchAlleAnzeigen: t("strafbuchAlleAnzeigen"),
    strafbuchOffeneAnzeigen: t("strafbuchOffeneAnzeigen"),
    strafbuchAbbrechen: t("strafbuchAbbrechen"),
    strafbuchRueckgaengig: t("strafbuchRueckgaengig"),
    strafbuchGeoeffnetAm: t("strafbuchGeoeffnetAm"),
    strafbuchTrotzUnbefristet: t("strafbuchTrotzUnbefristet"),
    strafbuchSperreLiefBis: t("strafbuchSperreLiefBis"),
    strafbuchKontrollePrefix: t("strafbuchKontrollePrefix"),
    strafbuchEingereicht: t("strafbuchEingereicht"),
    strafbuchFristWar: t("strafbuchFristWar"),
    strafbuchVordatiert: t("strafbuchVordatiert"),
    strafbuchAbgelehntAm: t("strafbuchAbgelehntAm"),
    strafbuchAblehnungsgrund: t("strafbuchAblehnungsgrund"),
    strafbuchAlleVergehenBestraft: t("strafbuchAlleVergehenBestraft"),
    strafbuchOffen: t("strafbuchOffen"),
    strafbuchGesamt: t("strafbuchGesamt"),
    strafbuchReinigungLimit: t("strafbuchReinigungLimit"),
    strafbuchReinigungLimitDate: t("strafbuchReinigungLimitDate"),
  };

  return (
    <main className="w-full max-w-5xl px-6 py-8">
      <StrafbuchClient
        userId={id}
        unerlaubteOeffnungen={unerlaubteOeffnungen}
        zuSpaet={zuSpaet}
        abgelehnt={abgelehnt}
        reinigungLimitVergehen={reinigungLimitVergehen}
        strafeRecords={strafeRecords}
        labels={labels}
      />
    </main>
  );
}
