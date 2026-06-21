import { mapAnforderungStatus, mapVerifikationStatus, isTimeCorrected, formatDateTime } from "@/lib/utils";
import type { AnforderungStatus, VerifikationStatus } from "@/lib/utils";
import { ANFORDERUNG_PILLS, getKombinierterPill } from "@/lib/kontrollePills";
import type { AdminKontrolleRowData } from "@/app/admin/kontrollen/AdminKontrolleListClient";

/** Raw row built from PRUEFUNG entries + KontrollAnforderungen, ready for display mapping. */
export interface KontrolleRow {
  sortTime: Date;
  imageUrl: string | null;
  username: string | null;
  anforderungStatus: AnforderungStatus | null;
  verifikationStatus: VerifikationStatus | null;
  deviceCheck: string | null;
  deviceCheckNote: string | null;
  deviceCheckExpected: string | null;
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
}

type PruefungEntry = {
  id: string;
  startTime: Date;
  imageUrl: string | null;
  note: string | null;
  kontrollCode: string | null;
  verifikationStatus: string | null;
  deviceCheck?: string | null;
  deviceCheckNote?: string | null;
  deviceCheckExpected?: string | null;
  user?: { username: string };
};

type KontrollAnforderung = {
  id: string;
  code: string;
  deadline: Date;
  createdAt: Date;
  fulfilledAt: Date | null;
  withdrawnAt: Date | null;
  kommentar: string | null;
  entryId: string | null;
  user?: { username: string };
};

/**
 * Builds Kontrolle rows from PRUEFUNG entries and KontrollAnforderungen.
 * Returns { pruefungRows, offeneRows } — caller sorts/filters/merges as needed.
 */
export function buildKontrolleRows(
  pruefungen: PruefungEntry[],
  alleAnforderungen: KontrollAnforderung[],
  now: Date,
): { pruefungRows: KontrolleRow[]; offeneRows: KontrolleRow[] } {
  const kaByEntryId = new Map(
    alleAnforderungen.filter((k) => k.entryId).map((k) => [k.entryId!, k]),
  );

  const pruefungRows: KontrolleRow[] = pruefungen.map((e) => {
    const ka = kaByEntryId.get(e.id) ?? null;
    return {
      sortTime: e.startTime,
      imageUrl: e.imageUrl,
      username: e.user?.username ?? null,
      anforderungStatus: ka ? mapAnforderungStatus(ka, e.startTime, now) : null,
      verifikationStatus: mapVerifikationStatus(e.verifikationStatus),
      deviceCheck: e.deviceCheck ?? null,
      deviceCheckNote: e.deviceCheckNote ?? null,
      deviceCheckExpected: e.deviceCheckExpected ?? null,
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

  const offeneRows: KontrolleRow[] = alleAnforderungen
    .filter((k) => !k.entryId)
    .map((k) => ({
      sortTime: k.createdAt,
      imageUrl: null,
      username: k.user?.username ?? null,
      anforderungStatus: mapAnforderungStatus(k, null, now),
      verifikationStatus: null,
      deviceCheck: null,
      deviceCheckNote: null,
      deviceCheckExpected: null,
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

  return { pruefungRows, offeneRows };
}

/** Returns true if the row should count as "alarming" (unresolved, overdue, or unverified). */
export function isKontrolleAlarm(row: KontrolleRow): boolean {
  if (row.anforderungStatus === "withdrawn") return false;
  if (!row.entryId) return true;
  if (row.verifikationStatus === "unverified") return true;
  if (row.anforderungStatus === "open" || row.anforderungStatus === "overdue") return true;
  return false;
}

/** Maps a KontrolleRow to the display-ready shape expected by AdminKontrolleListClient. */
export function mapKontrolleRow(
  row: KontrolleRow,
  opts: {
    t: (key: string, values?: Record<string, string | number | Date>) => string;
    dl: string;
    includeUsername: boolean;
  },
): AdminKontrolleRowData {
  const { t, dl, includeUsername } = opts;
  const anfPill = !row.entryId && row.anforderungStatus ? ANFORDERUNG_PILLS[row.anforderungStatus] : null;
  const kPill = row.entryId
    ? getKombinierterPill(row.anforderungStatus, row.verifikationStatus, t)
    : anfPill ? { label: t(anfPill.labelKey), cls: anfPill.cls } : null;
  const timeCorrected = row.fulfilledAt && isTimeCorrected(row.fulfilledAt, row.submittedAt);
  return {
    imageUrl: row.imageUrl,
    kommentar: row.kommentar,
    pillLabel: kPill?.label ?? null,
    pillCls: kPill?.cls ?? null,
    username: includeUsername ? row.username : null,
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
    deviceCheck: (row.deviceCheck as AdminKontrolleRowData["deviceCheck"]) ?? null,
    deviceCheckNote: row.deviceCheckNote,
    deviceCheckExpected: row.deviceCheckExpected,
  };
}
