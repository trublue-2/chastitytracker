import { auth } from "@/lib/auth";
import { assertKeyholderOrAdmin } from "@/lib/authGuards";
import { logAccess } from "@/lib/serverLog";
import { prisma } from "@/lib/prisma";
import { toDateLocale, formatDateTimeDual, formatDate, APP_TZ } from "@/lib/utils";
import { buildStrafbuch, type StrafbuchControlOffense } from "@/lib/strafbuch";
import { cleaningNotRelockedRef } from "@/lib/strafurteilService";
import { getLocale, getTranslations } from "next-intl/server";
import StrafbuchClient, { type KontrollRow, type UnerlaubteOeffnungRow, type StrafeRecordData, type ReinigungLimitRow, type AufgabeRow, type NichtVerschlossenRow, type VerschlussVersaeumtRow, type OrgasmusVersaeumtRow, type FalschesGeraetRow, type AdminPasswortRow } from "./StrafbuchClient";

export default async function StrafbuchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  await assertKeyholderOrAdmin(id);
  const [t, tCommon, dl] = [await getTranslations("admin"), await getTranslations("common"), toDateLocale(await getLocale())];
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return <div className="p-8 text-foreground-faint">{t("userNotFound")}</div>;
  const tz = user.timezone;
  // Betrachter-Zeitzone (Keyholder): Zeiten primär in dieser tz, Sub-Lokalzeit als Zusatz bei Abweichung.
  const viewerTz = session?.user?.timezone ?? APP_TZ;
  const subLabel = t("subTimePrefix");
  const fmtDual = (d: Date) => formatDateTimeDual(d, dl, viewerTz, tz, subLabel);

  logAccess(session?.user.name ?? "?", `/admin/users/${user.username}/strafbuch`);

  const sb = await buildStrafbuch(id, now);

  const reinigungLimitVergehen: ReinigungLimitRow[] = sb.reinigungLimitViolations.map((v) => ({
    entryId: v.entryId,
    startTimeStr: v.startTime ? fmtDual(v.startTime) : "–",
    note: v.note,
  }));

  const unerlaubteOeffnungen: UnerlaubteOeffnungRow[] = sb.unauthorizedOpenings.map((o) => ({
    id: o.id,
    startTimeStr: fmtDual(o.startTime),
    note: o.note,
    sperrzetEndetAtStr: o.sperrzeitEndetAt ? fmtDual(o.sperrzeitEndetAt) : null,
    sperrzetUnbefristet: o.sperrzeitIndefinite,
  }));

  const toKontrollRow = (k: StrafbuchControlOffense, backdated: boolean): KontrollRow => ({
    id: k.id,
    code: k.code,
    deadlineStr: fmtDual(k.deadline),
    fulfilledAtStr: k.fulfilledAt ? fmtDual(k.fulfilledAt) : null,
    entryStartTimeStr: k.entryStartTime ? fmtDual(k.entryStartTime) : null,
    backdated,
    kommentar: k.kommentar,
    entryNote: k.entryNote,
  });
  const zuSpaet: KontrollRow[] = sb.lateControls.map((k) => toKontrollRow(k, k.backdated));
  const abgelehnt: KontrollRow[] = sb.rejectedControls.map((k) => toKontrollRow(k, false));
  const autoEntfernt: KontrollRow[] = sb.autoRemovedControls.map((k) => toKontrollRow(k, false));

  // Aufgaben-Vergehen: das Strafbuch leitet sie ab, der MCP kann sie beurteilen — nur diese Seite
  // zeigte sie nicht. Ein Vergehen, das der Keyholder in der Oberfläche nicht sieht, ist praktisch
  // keines.
  const aufgaben: AufgabeRow[] = sb.unfulfilledTasks.map((a) => ({
    id: a.id,
    title: a.title,
    holdUntilStr: fmtDual(a.holdUntil),
    state: a.state,
    failedAtStr: a.failedAt ? fmtDual(a.failedAt) : null,
    isPenaltyTask: a.penaltyForRef !== null,
    penaltyReason: a.penaltyReason,
  }));

  // Die fünf folgenden Arten fehlten hier bis v5.0.3 — dieselbe Lücke wie bei den Aufgaben oben.
  const nichtVerschlossen: NichtVerschlossenRow[] = sb.cleaningNotRelocked.map((c) => ({
    // Präfix-ref, weil sich dieses Vergehen seinen Eintrag mit REINIGUNG_LIMIT teilt.
    refId: cleaningNotRelockedRef(c.entryId),
    startTimeStr: fmtDual(c.startTime),
    deadlineStr: fmtDual(c.deadline),
    relockAtStr: c.relockAt ? fmtDual(c.relockAt) : null,
    note: c.note,
  }));

  const verschlussVersaeumt: VerschlussVersaeumtRow[] = sb.lateLocks.map((a) => ({
    id: a.id,
    endetAtStr: fmtDual(a.endetAt),
    fulfilledAtStr: a.fulfilledAt ? fmtDual(a.fulfilledAt) : null,
    nachricht: a.nachricht,
  }));

  const orgasmusVersaeumt: OrgasmusVersaeumtRow[] = sb.missedOrgasmInstructions.map((m) => ({
    id: m.id,
    endetAtStr: fmtDual(m.endetAt),
    nachricht: m.nachricht,
    requiredArt: m.requiredArt,
  }));

  const falschesGeraet: FalschesGeraetRow[] = sb.wrongDeviceViolations.map((v) => ({
    entryId: v.entryId,
    startTimeStr: v.startTime ? fmtDual(v.startTime) : "–",
    deviceName: v.deviceName,
    note: v.note,
  }));

  const adminPasswort: AdminPasswortRow[] = sb.adminPasswordChanges.map((p) => ({
    id: p.id,
    atStr: fmtDual(p.at),
    adminUsername: p.adminUsername,
    via: p.via,
    sperrzeitEndetAtStr: p.sperrzeitEndetAt ? fmtDual(p.sperrzeitEndetAt) : null,
  }));

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
    errorFallback: tCommon("error"),
    networkError: tCommon("networkError"),
    frist: t("frist"),
    instructionLabel: t("instructionLabel"),
    strafbuchUnerlaubteOeffnungen: t("strafbuchUnerlaubteOeffnungen"),
    strafbuchZuSpaet: t("strafbuchZuSpaet"),
    strafbuchAbgelehnt: t("strafbuchAbgelehnt"),
    strafbuchAutoEntfernt: t("strafbuchAutoEntfernt"),
    strafbuchAutoEntferntAm: t("strafbuchAutoEntferntAm"),
    strafbuchNoEntries: t("strafbuchNoEntries"),
    strafbuchWurdeBestraft: t("strafbuchWurdeBestraft"),
    strafbuchStrafaufgabe: t("strafbuchStrafaufgabe"),
    strafbuchAlleAnzeigen: t("strafbuchAlleAnzeigen"),
    strafbuchOffeneAnzeigen: t("strafbuchOffeneAnzeigen"),
    strafbuchAbbrechen: t("strafbuchAbbrechen"),
    strafbuchRueckgaengig: t("strafbuchRueckgaengig"),
    strafbuchGeoeffnetAm: t("strafbuchGeoeffnetAm"),
    strafbuchTrotzUnbefristet: t("strafbuchTrotzUnbefristet"),
    strafbuchSperreLiefBis: t("strafbuchSperreLiefBis"),
    strafbuchKontrollePrefix: t("strafbuchKontrollePrefix"),
    strafbuchEingereicht: t("strafbuchEingereicht"),
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
    strafbuchAufgaben: t("strafbuchAufgaben"),
    strafbuchAufgabeVersaeumt: t("strafbuchAufgabeVersaeumt"),
    strafbuchAufgabeAbgebrochen: t("strafbuchAufgabeAbgebrochen"),
    strafbuchAufgabeAbgelegtAm: t("strafbuchAufgabeAbgelegtAm"),
    strafbuchStrafaufgabeKette: t("strafbuchStrafaufgabeKette"),
    strafbuchNichtVerschlossen: t("strafbuchNichtVerschlossen"),
    strafbuchNichtVerschlossenNie: t("strafbuchNichtVerschlossenNie"),
    strafbuchWiederVerschlossen: t("strafbuchWiederVerschlossen"),
    strafbuchVerschlussFrist: t("strafbuchVerschlussFrist"),
    strafbuchVerschlussVersaeumt: t("strafbuchVerschlussVersaeumt"),
    strafbuchVerschlussNieErfuellt: t("strafbuchVerschlussNieErfuellt"),
    strafbuchVerschlussZuSpaet: t("strafbuchVerschlussZuSpaet"),
    strafbuchOrgasmusVersaeumt: t("strafbuchOrgasmusVersaeumt"),
    strafbuchOrgasmusAbgelaufen: t("strafbuchOrgasmusAbgelaufen"),
    strafbuchOrgasmusVorgegeben: t("strafbuchOrgasmusVorgegeben"),
    strafbuchFalschesGeraet: t("strafbuchFalschesGeraet"),
    strafbuchFalschesGeraetAm: t("strafbuchFalschesGeraetAm"),
    strafbuchAdminPasswort: t("strafbuchAdminPasswort"),
    strafbuchAdminPasswortAm: t("strafbuchAdminPasswortAm"),
    strafbuchAdminPasswortKonto: t("strafbuchAdminPasswortKonto"),
    deviceLabel: t("deviceLabel"),
  };

  return (
    <StrafbuchClient
      userId={id}
      unerlaubteOeffnungen={unerlaubteOeffnungen}
      zuSpaet={zuSpaet}
      abgelehnt={abgelehnt}
      autoEntfernt={autoEntfernt}
      reinigungLimitVergehen={reinigungLimitVergehen}
      unfulfilledTasks={aufgaben}
      nichtVerschlossen={nichtVerschlossen}
      verschlussVersaeumt={verschlussVersaeumt}
      orgasmusVersaeumt={orgasmusVersaeumt}
      falschesGeraet={falschesGeraet}
      adminPasswort={adminPasswort}
      strafeRecords={strafeRecords}
      labels={labels}
    />
  );
}
