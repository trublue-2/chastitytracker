import { prisma } from "@/lib/prisma";
import { mapAnforderungStatus } from "@/lib/utils";

/** A Kontroll-based offense (late or rejected) — raw data, formatting left to consumers. */
export interface StrafbuchControlOffense {
  id: string;
  code: string;
  deadline: Date;
  fulfilledAt: Date | null;
  entryStartTime: Date | null;
  /** True if the entry was backdated before the deadline but submitted after it. */
  backdated: boolean;
  kommentar: string | null;
  entryNote: string | null;
}

/** Raw Strafbuch data for a user — system-detected offenses + the punished-marker records.
 *  Pure data (Date objects); display formatting is the consumer's job. */
export interface StrafbuchData {
  unauthorizedOpenings: {
    id: string;
    startTime: Date;
    note: string | null;
    sperrzeitEndetAt: Date | null;
    sperrzeitIndefinite: boolean;
  }[];
  lateControls: StrafbuchControlOffense[];
  rejectedControls: StrafbuchControlOffense[];
  reinigungLimitViolations: {
    entryId: string;
    startTime: Date | null;
    note: string | null;
  }[];
  /** StrafeRecord rows — each marks an offense (by `refId`) as punished. */
  strafeRecords: { refId: string; bestraftDatum: Date; notiz: string | null }[];
}

/** Computes the Strafbuch for a user: unauthorized openings during Sperrzeiten, late and
 *  rejected Kontrollen, REINIGUNG-limit violations, plus the punished-marker records.
 *  Single source of truth shared by the admin Strafbuch page and the MCP tool. */
export async function buildStrafbuch(userId: string, now: Date = new Date()): Promise<StrafbuchData> {
  const [user, oeffnungen, sperrzeiten, kontrollAnforderungen, strafeRecordsRaw] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true } }),
    prisma.entry.findMany({ where: { userId, type: "OEFFNEN" }, orderBy: { startTime: "desc" } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT" } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: { not: null } },
      include: { entry: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.strafeRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const userReinigungErlaubt = user?.reinigungErlaubt ?? false;

  // REINIGUNG-limit offenses: their StrafeRecords are a subset of strafeRecordsRaw.
  const reinigungLimitRecords = strafeRecordsRaw.filter((r) => r.offenseType === "REINIGUNG_LIMIT");
  const reinigungEntryIds = reinigungLimitRecords.map((r) => r.refId);
  const reinigungEntries = reinigungEntryIds.length > 0
    ? await prisma.entry.findMany({ where: { id: { in: reinigungEntryIds } } })
    : [];
  const reinigungLimitViolations = reinigungLimitRecords.map((r) => {
    const entry = reinigungEntries.find((e) => e.id === r.refId);
    return { entryId: r.refId, startTime: entry?.startTime ?? null, note: entry?.note ?? null };
  });

  // Unauthorized openings — an OEFFNEN inside an active Sperrzeit. A REINIGUNG opening is
  // permitted when both the user flag and the Sperrzeit allow cleaning.
  const unauthorizedOpenings = oeffnungen
    .map((o) => ({
      o,
      sperre: sperrzeiten.find((s) =>
        o.startTime >= s.createdAt &&
        (s.endetAt === null || o.startTime < s.endetAt) &&
        (s.withdrawnAt === null || s.withdrawnAt > o.startTime),
      ),
    }))
    .filter(({ o, sperre }) => {
      if (!sperre) return false;
      const allowedReinigung = o.oeffnenGrund === "REINIGUNG" && userReinigungErlaubt && sperre.reinigungErlaubt;
      return !allowedReinigung;
    })
    .map(({ o, sperre }) => ({
      id: o.id,
      startTime: o.startTime,
      note: o.note,
      sperrzeitEndetAt: sperre!.endetAt,
      sperrzeitIndefinite: sperre!.endetAt === null,
    }));

  const toControl = (k: typeof kontrollAnforderungen[number]): StrafbuchControlOffense => ({
    id: k.id,
    code: k.code,
    deadline: k.deadline,
    fulfilledAt: k.fulfilledAt ?? null,
    entryStartTime: k.entry?.startTime ?? null,
    backdated: !!(k.fulfilledAt && k.entry?.startTime &&
      k.entry.startTime.getTime() < k.deadline.getTime() &&
      k.fulfilledAt.getTime() > k.deadline.getTime()),
    kommentar: k.kommentar,
    entryNote: k.entry?.note ?? null,
  });

  return {
    unauthorizedOpenings,
    lateControls: kontrollAnforderungen
      .filter((k) => mapAnforderungStatus(k, k.entry?.startTime ?? null, now) === "late")
      .map(toControl),
    rejectedControls: kontrollAnforderungen
      .filter((k) => k.entry?.verifikationStatus === "rejected")
      .map(toControl),
    reinigungLimitViolations,
    strafeRecords: strafeRecordsRaw.map((r) => ({ refId: r.refId, bestraftDatum: r.bestraftDatum, notiz: r.notiz })),
  };
}
