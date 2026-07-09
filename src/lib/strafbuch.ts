import { prisma } from "@/lib/prisma";
import { mapAnforderungStatus, tzDateParts, isPastDeadlineUnfulfilled, dateAtLocalMinutes, APP_TZ } from "@/lib/utils";
import { activeVerschlussAnforderungWhere } from "@/lib/queries";
import { aktivesReinigungsFenster } from "@/lib/reinigungService";
import { hhmmToMinutes } from "@/lib/autoKontrolleService";

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
  /** Verschluss-Anforderungen (lock requests) whose deadline (`endetAt`) passed without a timely VERSCHLUSS. */
  lateLocks: {
    id: string;
    endetAt: Date;
    fulfilledAt: Date | null;
    nachricht: string | null;
  }[];
  /** REINIGUNG-Öffnungen during an active, cleaning-permitted Sperrzeit whose re-lock deadline
   *  (active daily cleaning window's end, or open time + reinigungMaxMinuten as fallback) passed
   *  without (or with a late) following VERSCHLUSS. */
  cleaningNotRelocked: {
    entryId: string;
    startTime: Date;
    deadline: Date;
    relockAt: Date | null;
    note: string | null;
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

/** True if a Verschluss-Anforderung (lock request) deadline has passed without a timely
 *  VERSCHLUSS — still open past `endetAt`, or fulfilled after `endetAt`. */
export function isLateLock(a: { endetAt: Date; fulfilledAt: Date | null }, now: Date): boolean {
  return isPastDeadlineUnfulfilled(a.endetAt, a.fulfilledAt, now);
}

/** Re-lock deadline for a REINIGUNG-Öffnung: the end of the active daily cleaning window (`fenster`)
 *  if one was open at `openStartTime`, else open time + the user's max minutes per pause. A window
 *  configured but not covering `openStartTime` also falls back to `maxMinuten` — never silently
 *  skipped, since that case isn't otherwise detected as an offense. Windows never span midnight
 *  (`parseReinigungsFenster` requires start < end), so the window end is always the same calendar
 *  day as `openStartTime`. `dateAtLocalMinutes` resolves the window-end wall-clock time DST-safely
 *  (a flat millisecond offset from midnight would be wrong on the ~2 days/year a DST transition
 *  falls between midnight and the window end). */
export function reinigungRelockDeadline(openStartTime: Date, maxMinuten: number, fenster: unknown, tz: string): Date {
  const windowEnd = aktivesReinigungsFenster(fenster, openStartTime, tz);
  if (windowEnd) return dateAtLocalMinutes(openStartTime, hhmmToMinutes(windowEnd), tz);
  return new Date(openStartTime.getTime() + maxMinuten * 60 * 1000);
}

/** True if a REINIGUNG-Öffnung was not (or too late) followed by a VERSCHLUSS within `deadline`. */
export function isCleaningNotRelocked(deadline: Date, relockAt: Date | null, now: Date): boolean {
  return isPastDeadlineUnfulfilled(deadline, relockAt, now);
}

/** Finds the Sperrzeit active at `openTime` (if any) — shared by unauthorizedOpenings and
 *  cleaningNotRelocked, which both need to know whether an OEFFNEN fell inside an active lock period. */
function findActiveSperrzeit<S extends { createdAt: Date; endetAt: Date | null; withdrawnAt: Date | null }>(
  openTime: Date, sperrzeiten: S[],
): S | undefined {
  return sperrzeiten.find((s) =>
    openTime >= s.createdAt &&
    (s.endetAt === null || openTime < s.endetAt) &&
    (s.withdrawnAt === null || s.withdrawnAt > openTime),
  );
}

/** True if a REINIGUNG opening inside `sperre` doesn't break the Sperrzeit — both the user flag
 *  and the Sperrzeit itself must allow cleaning. Shared by unauthorizedOpenings (inverted: an
 *  opening that ISN'T allowed is unauthorized) and cleaningNotRelocked (only allowed openings can
 *  incur a missed-re-lock offense). */
function isAllowedReinigungOpening(
  o: { oeffnenGrund: string | null }, sperre: { reinigungErlaubt: boolean } | undefined, userReinigungErlaubt: boolean,
): boolean {
  return !!sperre && o.oeffnenGrund === "REINIGUNG" && userReinigungErlaubt && sperre.reinigungErlaubt;
}

/** Computes the Strafbuch for a user: unauthorized openings during Sperrzeiten, late and
 *  rejected Kontrollen, REINIGUNG-limit violations, late locks, missed cleaning re-locks, plus
 *  the punished-marker records. Single source of truth shared by the admin Strafbuch page and the MCP tool. */
export async function buildStrafbuch(userId: string, now: Date = new Date()): Promise<StrafbuchData> {
  const [user, oeffnungen, verschluesse, sperrzeiten, lockRequests, kontrollAnforderungen, strafeRecordsRaw, orgasmusAnforderungen] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true, reinigungMaxProTag: true, reinigungMaxMinuten: true, reinigungsFenster: true, timezone: true } }),
    prisma.entry.findMany({ where: { userId, type: "OEFFNEN" }, orderBy: { startTime: "desc" } }),
    prisma.entry.findMany({ where: { userId, type: "VERSCHLUSS" }, orderBy: { startTime: "asc" } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "SPERRZEIT", ...activeVerschlussAnforderungWhere(now) } }),
    prisma.verschlussAnforderung.findMany({ where: { userId, art: "ANFORDERUNG", withdrawnAt: null, ...activeVerschlussAnforderungWhere(now) } }),
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
  const reinigungMaxMinuten = user?.reinigungMaxMinuten ?? 15;
  const reinigungsFenster = user?.reinigungsFenster ?? null;
  const subTz = user?.timezone ?? APP_TZ;

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

  // Each OEFFNEN paired with the Sperrzeit active at its startTime (if any) — computed once,
  // shared by unauthorizedOpenings and cleaningNotRelocked below.
  const oeffnungenMitSperre = oeffnungen.map((o) => ({ o, sperre: findActiveSperrzeit(o.startTime, sperrzeiten) }));

  // Unauthorized openings — an OEFFNEN inside an active Sperrzeit. A REINIGUNG opening is
  // permitted when both the user flag and the Sperrzeit allow cleaning.
  const unauthorizedOpenings = oeffnungenMitSperre
    .filter(({ o, sperre }) =>
      !!sperre && !isAllowedReinigungOpening(o, sperre, userReinigungErlaubt) && !isOrgasmusOpenAllowed(o.startTime),
    )
    .map(({ o, sperre }) => ({
      id: o.id,
      startTime: o.startTime,
      note: o.note,
      sperrzeitEndetAt: sperre!.endetAt,
      sperrzeitIndefinite: sperre!.endetAt === null,
    }));

  // Late locks — an ANFORDERUNG (lock request) whose deadline passed without a timely VERSCHLUSS.
  const lateLocks = lockRequests
    .filter((a): a is typeof a & { endetAt: Date } => a.endetAt !== null)
    .filter((a) => isLateLock(a, now))
    .map((a) => ({ id: a.id, endetAt: a.endetAt, fulfilledAt: a.fulfilledAt, nachricht: a.nachricht }));

  // Cleaning not relocked — a REINIGUNG opening during an active, cleaning-permitted Sperrzeit
  // whose re-lock deadline passed without a timely VERSCHLUSS. No offense if the Sperrzeit itself
  // already ended before the deadline: once the Sperrzeit is over there's no further re-lock
  // obligation left to violate, whether or not (or how late) the user eventually re-locks.
  const cleaningNotRelocked = oeffnungenMitSperre
    .filter(({ o, sperre }) => isAllowedReinigungOpening(o, sperre, userReinigungErlaubt))
    .flatMap(({ o, sperre }) => {
      const deadline = reinigungRelockDeadline(o.startTime, reinigungMaxMinuten, reinigungsFenster, subTz);
      const sperrzeitCoversDeadline = sperre!.endetAt === null || sperre!.endetAt >= deadline;
      const relockAt = verschluesse.find((v) => v.startTime > o.startTime)?.startTime ?? null;
      return sperrzeitCoversDeadline && isCleaningNotRelocked(deadline, relockAt, now)
        ? [{ entryId: o.id, startTime: o.startTime, deadline, relockAt, note: o.note }]
        : [];
    });

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
    lateLocks,
    cleaningNotRelocked,
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
