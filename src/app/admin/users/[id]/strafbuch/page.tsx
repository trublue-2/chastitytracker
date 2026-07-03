import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale, formatDateTime, formatDate } from "@/lib/utils";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";
import { getLocale, getTranslations } from "next-intl/server";
import StrafbuchClient, { type KontrollRow, type UnerlaubteOeffnungRow, type StrafeRecordData, type ReinigungLimitRow } from "./StrafbuchClient";

export default async function StrafbuchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [t, dl] = [await getTranslations("admin"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;
  const tz = user.timezone;

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/strafbuch`);

  const sb = await buildStrafbuch(id, now);

  const reinigungLimitVergehen: ReinigungLimitRow[] = sb.reinigungLimitViolations.map((v) => ({
    entryId: v.entryId,
    startTimeStr: v.startTime ? formatDateTime(v.startTime, dl, tz) : "–",
    note: v.note,
  }));

  const unerlaubteOeffnungen: UnerlaubteOeffnungRow[] = sb.unauthorizedOpenings.map((o) => ({
    id: o.id,
    startTimeStr: formatDateTime(o.startTime, dl, tz),
    note: o.note,
    sperrzetEndetAtStr: o.sperrzeitEndetAt ? formatDateTime(o.sperrzeitEndetAt, dl, tz) : null,
    sperrzetUnbefristet: o.sperrzeitIndefinite,
  }));

  const toKontrollRow = (k: StrafbuchControlOffense, backdated: boolean): KontrollRow => ({
    id: k.id,
    code: k.code,
    deadlineStr: formatDateTime(k.deadline, dl, tz),
    fulfilledAtStr: k.fulfilledAt ? formatDateTime(k.fulfilledAt, dl, tz) : null,
    entryStartTimeStr: k.entryStartTime ? formatDateTime(k.entryStartTime, dl, tz) : null,
    backdated,
    kommentar: k.kommentar,
    entryNote: k.entryNote,
  });
  const zuSpaet: KontrollRow[] = sb.lateControls.map((k) => toKontrollRow(k, k.backdated));
  const abgelehnt: KontrollRow[] = sb.rejectedControls.map((k) => toKontrollRow(k, false));

  const strafeRecords: StrafeRecordData[] = sb.strafeRecords.map((r) => ({
    refId: r.refId,
    status: r.status,
    bestraftDatumStr: formatDate(r.bestraftDatum, dl, tz),
    notiz: r.notiz,
    reason: r.reason,
    judgedBy: r.judgedBy,
    done: r.erledigtAt !== null,
    erledigtAtStr: r.erledigtAt ? formatDate(r.erledigtAt, dl, tz) : null,
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
    strafbuchVerwerfen: t("strafbuchVerwerfen"),
    strafbuchVerworfenBadge: t("strafbuchVerworfenBadge"),
    strafbuchBegruendung: t("strafbuchBegruendung"),
    strafbuchUrteilKI: t("strafbuchUrteilKI"),
    strafbuchStrafeLabel: t("strafbuchStrafeLabel"),
    strafbuchStrafePlaceholder: t("strafbuchStrafePlaceholder"),
    strafbuchStrafeVerhaengen: t("strafbuchStrafeVerhaengen"),
    strafbuchStrafeBadge: t("strafbuchStrafeBadge"),
    strafbuchErledigtBadge: t("strafbuchErledigtBadge"),
    strafbuchAlsErledigt: t("strafbuchAlsErledigt"),
    strafbuchWiederOffen: t("strafbuchWiederOffen"),
  };

  return (
    <StrafbuchClient
      userId={id}
      unerlaubteOeffnungen={unerlaubteOeffnungen}
      zuSpaet={zuSpaet}
      abgelehnt={abgelehnt}
      reinigungLimitVergehen={reinigungLimitVergehen}
      strafeRecords={strafeRecords}
      labels={labels}
    />
  );
}
