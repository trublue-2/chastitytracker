import { prisma } from "@/lib/prisma";
import { mapAnforderungStatus, tzDateParts } from "@/lib/utils";
import { activeVerschlussAnforderungWhere } from "@/lib/queries";

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
  /** Judgment records — each marks an offense (by `refId`) as PUNISHED or DISMISSED. */
  strafeRecords: {
    refId: string;
    offenseType: string;
    status: string; // "PUNISHED" | "DISMISSED"
    bestraftDatum: Date;
    notiz: string | null;
    reason: string | null;
    judgedBy: string | null;
    erledigtAt: Date | null;
  }[];
}

/** Computes the Strafbuch for a user: unauthorized openings during Sperrzeiten, late and
 *  rejected Kontrollen, REINIGUNG-limit violations, plus the punished-marker records.
 *  Single source of truth shared by the admin Strafbuch page and the MCP tool. */
export async function buildStrafbuch(userId: string, now: Date = new Date()): Promise<StrafbuchData> {
  const [user, oeffnungen, sperrzeiten, kontrollAnforderungen, strafeRecordsRaw, orgasmusAnforderungen] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxProTag: true } }),
    prisma.entry.findMany({ where: { userId, type: "OEFFNEN" }, orderBy: { startTime: "desc" } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT", ...activeVerschlussAnforderungWhere(now) } }),
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
  const reinigungMaxProTag = user?.reinigungMaxProTag ?? 0;

  // Wrong-device: StrafeRecord.refId points at the offending VERSCHLUSS entry (für Geräte-Namen laden).
  const wrongDeviceRecords = strafeRecordsRaw.filter((r) => r.offenseType === "FALSCHES_GERAET");
  const offenseEntryIds = wrongDeviceRecords.map((r) => r.refId);
  const offenseEntries = offenseEntryIds.length > 0
    ? await prisma.entry.findMany({
        where: { id: { in: offenseEntryIds } },
        include: { device: { select: { name: true } } },
      })
    : [];
  const offenseEntryById = new Map(offenseEntries.map((e) => [e.id, e]));
  const wrongDeviceViolations = wrongDeviceRecords.map((r) => {
    const entry = offenseEntryById.get(r.refId);
    return { entryId: r.refId, startTime: entry?.startTime ?? null, note: entry?.note ?? null, deviceName: entry?.device?.name ?? null };
  });

  // REINIGUNG-Limit: NICHT mehr aus Auto-StrafeRecords, sondern LIVE abgeleitet — eine
  // REINIGUNG-Öffnung über dem Tageskontingent (CH-Tag) ist eine Erkennung; ob sie bestraft
  // wird, entscheidet die Keyholderin (punished = ein StrafeRecord referenziert den Eintrag).
  // 0 = unbegrenzt → keine Verstösse. Wechsel laufen über diesen Pfad und werden so nicht
  // mehr automatisch geahndet.
  const reinigungLimitViolations: { entryId: string; startTime: Date | null; note: string | null }[] = [];
  if (reinigungMaxProTag > 0) {
    const perDay = new Map<string, number>();
    const reinigungAsc = oeffnungen
      .filter((o) => o.oeffnenGrund === "REINIGUNG")
      .slice()
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (const o of reinigungAsc) {
      const { year, month, day } = tzDateParts(o.startTime);
      const key = `${year}-${month}-${day}`;
      const n = (perDay.get(key) ?? 0) + 1;
      perDay.set(key, n);
      if (n > reinigungMaxProTag) reinigungLimitViolations.push({ entryId: o.id, startTime: o.startTime, note: o.note });
    }
    reinigungLimitViolations.reverse(); // neueste zuerst (Anzeige)
  }

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
    strafeRecords: strafeRecordsRaw.map((r) => ({
      refId: r.refId,
      offenseType: r.offenseType,
      status: r.status,
      bestraftDatum: r.bestraftDatum,
      notiz: r.notiz,
      reason: r.reason,
      judgedBy: r.judgedBy,
      erledigtAt: r.erledigtAt,
    })),
  };
}
