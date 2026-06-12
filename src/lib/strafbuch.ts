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
  /** Lock entries where the user wore a different device than the Anforderung specified. */
  wrongDeviceViolations: {
    entryId: string;
    startTime: Date | null;
    note: string | null;
    deviceName: string | null;
  }[];
  /** Mandatory orgasm directives (ANWEISUNG) whose window ended without a matching orgasm. */
  missedOrgasmInstructions: {
    id: string;
    endetAt: Date;
    nachricht: string | null;
    requiredArt: string | null;
  }[];
  /** StrafeRecord rows — each marks an offense (by `refId`) as punished. */
  strafeRecords: { refId: string; bestraftDatum: Date; notiz: string | null }[];
}

/** Computes the Strafbuch for a user: unauthorized openings during Sperrzeiten, late and
 *  rejected Kontrollen, REINIGUNG-limit violations, plus the punished-marker records.
 *  Single source of truth shared by the admin Strafbuch page and the MCP tool. */
export async function buildStrafbuch(userId: string, now: Date = new Date()): Promise<StrafbuchData> {
  const [user, oeffnungen, sperrzeiten, kontrollAnforderungen, strafeRecordsRaw, orgasmusAnforderungen] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true } }),
    prisma.entry.findMany({ where: { userId, type: "OEFFNEN" }, orderBy: { startTime: "desc" } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT" } }),
    prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: { not: null } },
      include: { entry: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.strafeRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.orgasmusAnforderung.findMany({ where: { userId } }),
  ]);

  // Windows that explicitly permit opening to perform the directed orgasm — an OEFFNEN inside
  // such a window is not an unauthorized opening (like the REINIGUNG exception).
  const oeffnenErlaubtWindows = orgasmusAnforderungen.filter((a) => a.oeffnenErlaubt);
  const isOrgasmusOpenAllowed = (openTime: Date): boolean =>
    oeffnenErlaubtWindows.some((w) =>
      openTime >= w.beginntAt && openTime <= w.endetAt &&
      (w.withdrawnAt === null || w.withdrawnAt > openTime),
    );
  const userReinigungErlaubt = user?.reinigungErlaubt ?? false;

  // Offenses whose StrafeRecord.refId points at the offending entry (REINIGUNG-limit, wrong-device).
  // Both are subsets of strafeRecordsRaw; fetch the referenced entries once (with device for naming).
  const reinigungLimitRecords = strafeRecordsRaw.filter((r) => r.offenseType === "REINIGUNG_LIMIT");
  const wrongDeviceRecords = strafeRecordsRaw.filter((r) => r.offenseType === "FALSCHES_GERAET");
  const offenseEntryIds = [...reinigungLimitRecords, ...wrongDeviceRecords].map((r) => r.refId);
  const offenseEntries = offenseEntryIds.length > 0
    ? await prisma.entry.findMany({
        where: { id: { in: offenseEntryIds } },
        include: { device: { select: { name: true } } },
      })
    : [];
  const offenseEntryById = new Map(offenseEntries.map((e) => [e.id, e]));
  const reinigungLimitViolations = reinigungLimitRecords.map((r) => {
    const entry = offenseEntryById.get(r.refId);
    return { entryId: r.refId, startTime: entry?.startTime ?? null, note: entry?.note ?? null };
  });
  const wrongDeviceViolations = wrongDeviceRecords.map((r) => {
    const entry = offenseEntryById.get(r.refId);
    return { entryId: r.refId, startTime: entry?.startTime ?? null, note: entry?.note ?? null, deviceName: entry?.device?.name ?? null };
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
      return !allowedReinigung && !isOrgasmusOpenAllowed(o.startTime);
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
    wrongDeviceViolations,
    missedOrgasmInstructions: orgasmusAnforderungen
      .filter((a) => a.art === "ANWEISUNG" && a.withdrawnAt === null && a.fulfilledAt === null && a.endetAt < now)
      .sort((a, b) => b.endetAt.getTime() - a.endetAt.getTime())
      .map((a) => ({ id: a.id, endetAt: a.endetAt, nachricht: a.nachricht, requiredArt: a.vorgegebeneArt })),
    strafeRecords: strafeRecordsRaw.map((r) => ({ refId: r.refId, bestraftDatum: r.bestraftDatum, notiz: r.notiz })),
  };
}
