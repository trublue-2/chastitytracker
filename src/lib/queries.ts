import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { OeffnenGrund } from "@/lib/constants";
import { aktivesReinigungsFenster } from "@/lib/reinigungService";

/**
 * Where-Fragment: bereits AKTIVE Kontroll-Anforderungen — sofortige (wirksamAb null) und
 * zeitversetzte, die schon ausgelöst haben (wirksamAb <= jetzt). Noch nicht aktive (wirksamAb in
 * der Zukunft, z.B. geplante Auto-Kontrollen) bleiben verborgen — ÜBERALL: Sub-Sichten (Dashboard,
 * Stats, get_overview) UND Admin/Strafbuch (sonst sähe die Keyholderin die geplanten Zufallszeiten).
 */
export function aktiveKontrolleWhere(now: Date = new Date()): Prisma.KontrollAnforderungWhereInput {
  return { OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }] };
}

/**
 * Where-Fragment: bereits AKTIVE VerschlussAnforderungen (ANFORDERUNG/SPERRZEIT) — sofortige
 * (wirksamAb null) und zeitversetzte, die schon ausgelöst haben (wirksamAb <= jetzt). Eine
 * ZUKÜNFTIG geplante (wirksamAb in der Zukunft) gilt NICHT als aktiv: eine geplante SPERRZEIT
 * darf vor ihrem Versand nicht durchsetzen/Öffnen blockieren, eine geplante ANFORDERUNG nicht
 * vorzeitig als erfüllt gelten.
 */
export function activeVerschlussAnforderungWhere(now: Date = new Date()): Prisma.VerschlussAnforderungWhereInput {
  return { OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }] };
}

/**
 * Where-Fragment für KEYHOLDER-Sichten (Admin-UI + MCP) — anders als `aktiveKontrolleWhere`
 * (Sub/Enforcement): zeigt zusätzlich MANUELL terminierte Kontrollen (`auto: false`), bevor sie
 * feuern, damit der Keyholder seine eigene geplante Kontrolle sehen und stornieren kann. Verborgen
 * bleiben nur ZUKÜNFTIGE Auto-/Zufalls-Kontrollen (`auto: true`, wirksamAb > now) — deren
 * Überraschungseffekt darf auch der Keyholder-UI nicht entgehen, sie sind ohnehin nicht
 * keyholder-gesetzt.
 */
export function keyholderVisibleKontrolleWhere(now: Date = new Date()): Prisma.KontrollAnforderungWhereInput {
  return { OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }, { auto: false }] };
}

// ── Shared types ────────────────────────────────────────────────────────────

/** Prisma transaction client — parameter type passed to callbacks of `$transaction`. */
export type PrismaTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export interface DeviceOption {
  id: string;
  name: string;
  imageUrl: string | null;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** Returns active (non-archived) KG devices for a user, ordered by creation date.
 *  KG-specific filter: includes only devices in the built-in KG category — Plug, Collar
 *  etc. are excluded because Verschluss/Öffnen-Flows operate on KG only. Devices without
 *  a category are also included for legacy data (pre-DeviceCategory migration safety). */
export async function getUserDeviceOptions(userId: string): Promise<DeviceOption[]> {
  return prisma.device.findMany({
    where: {
      userId,
      archivedAt: null,
      OR: [
        { category: { isBuiltIn: true } },
        { categoryId: null },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  });
}

/** Returns true if the user is currently locked (latest VERSCHLUSS/OEFFNEN entry is VERSCHLUSS).
 *
 *  KG-only by design: Sperrzeiten, VerschlussAnforderung, Strafen, Kontroll-Anforderungen and
 *  the "Verschlossen seit X" banner all rely on this single global lock state. Per-category
 *  wear status (Plug, Collar, ...) is determined separately from `buildPairs` results in the
 *  pages that need it — never via this function. */
export async function getIsLocked(userId: string): Promise<boolean> {
  const latest = await prisma.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true },
  });
  return latest?.type === "VERSCHLUSS";
}

/** Result row for a currently-active wear session in a non-KG DeviceCategory. */
export interface ActiveWearSession {
  categoryId: string;
  categoryName: string;
  deviceId: string;
  deviceName: string;
  since: Date;
}

/** Result of `prepareWearEntry` — never thrown, returned for the route to inspect. */
export type WearPrepareResult =
  | { ok: true; categoryId: string }
  | { ok: false; code:
      | "WEAR_DEVICE_REQUIRED"
      | "WEAR_DEVICE_NO_CATEGORY"
      | "WEAR_DEVICE_KG"
      | "WEAR_PHOTO_REQUIRED"
      | "ALREADY_WEARING"
      | "NOT_WEARING"
      | "TIME_BEFORE";
    };

/** Validates a WEAR_BEGIN/WEAR_END create-payload against the device's category and the
 *  user's session state. Runs inside the caller's transaction so reads are consistent.
 *  Both /api/entries and /api/admin/entries call this — single source of truth for the
 *  WEAR-pair invariants. */
export async function prepareWearEntry(
  tx: PrismaTx,
  userId: string,
  type: "WEAR_BEGIN" | "WEAR_END",
  deviceId: string | undefined,
  startTime: string | Date,
  imageUrl: string | null | undefined,
): Promise<WearPrepareResult> {
  if (!deviceId) return { ok: false, code: "WEAR_DEVICE_REQUIRED" };
  const dev = await tx.device.findUnique({
    where: { id: deviceId },
    select: { categoryId: true, category: { select: { isBuiltIn: true, requirePhoto: true } } },
  });
  if (!dev?.categoryId) return { ok: false, code: "WEAR_DEVICE_NO_CATEGORY" };
  if (dev.category?.isBuiltIn) return { ok: false, code: "WEAR_DEVICE_KG" };
  if (type === "WEAR_BEGIN" && dev.category?.requirePhoto && !imageUrl) {
    return { ok: false, code: "WEAR_PHOTO_REQUIRED" };
  }

  const latestWear = await tx.entry.findFirst({
    where: {
      userId,
      type: { in: ["WEAR_BEGIN", "WEAR_END"] },
      device: { categoryId: dev.categoryId },
    },
    orderBy: { startTime: "desc" },
    select: { type: true, startTime: true },
  });
  if (type === "WEAR_BEGIN" && latestWear?.type === "WEAR_BEGIN") {
    return { ok: false, code: "ALREADY_WEARING" };
  }
  if (type === "WEAR_END" && (!latestWear || latestWear.type !== "WEAR_BEGIN")) {
    return { ok: false, code: "NOT_WEARING" };
  }
  if (latestWear && new Date(startTime) <= latestWear.startTime) {
    return { ok: false, code: "TIME_BEFORE" };
  }
  return { ok: true, categoryId: dev.categoryId };
}

/** Returns all currently active wear sessions across non-KG categories.
 *  Used by the dashboard to render parallel session cards. */
export async function getActiveWearSessions(userId: string): Promise<(ActiveWearSession & {
  categoryColor: string;
  categoryIcon: string;
})[]> {
  // One query: latest WEAR-entry per device, joined with device + category.
  // For typical usage (≤10 categories per user) this is acceptable; index on (userId, type, startTime DESC).
  const latestPerDevice = await prisma.entry.findMany({
    where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] }, deviceId: { not: null } },
    orderBy: { startTime: "desc" },
    select: {
      type: true,
      startTime: true,
      deviceId: true,
      device: { select: { id: true, name: true, category: { select: { id: true, name: true, color: true, icon: true, isBuiltIn: true } } } },
    },
  });
  // Group by deviceId, keep only the latest per device.
  const seenDevices = new Set<string>();
  const sessions: (ActiveWearSession & { categoryColor: string; categoryIcon: string })[] = [];
  for (const e of latestPerDevice) {
    if (!e.deviceId || seenDevices.has(e.deviceId)) continue;
    seenDevices.add(e.deviceId);
    if (e.type !== "WEAR_BEGIN" || !e.device?.category || e.device.category.isBuiltIn) continue;
    sessions.push({
      categoryId: e.device.category.id,
      categoryName: e.device.category.name,
      categoryColor: e.device.category.color,
      categoryIcon: e.device.category.icon,
      deviceId: e.device.id,
      deviceName: e.device.name,
      since: e.startTime,
    });
  }
  return sessions;
}

/** Returns the active wear session in a category, or null if none.
 *  An "active session" = latest WEAR_BEGIN/WEAR_END entry on a device of this category is WEAR_BEGIN. */
export async function getActiveWearSessionForCategory(
  userId: string,
  categoryId: string,
): Promise<ActiveWearSession | null> {
  const latest = await prisma.entry.findFirst({
    where: {
      userId,
      type: { in: ["WEAR_BEGIN", "WEAR_END"] },
      device: { categoryId },
    },
    orderBy: { startTime: "desc" },
    select: {
      type: true,
      startTime: true,
      device: { select: { id: true, name: true, category: { select: { id: true, name: true } } } },
    },
  });
  if (latest?.type !== "WEAR_BEGIN" || !latest.device || !latest.device.category) return null;
  return {
    categoryId: latest.device.category.id,
    categoryName: latest.device.category.name,
    deviceId: latest.device.id,
    deviceName: latest.device.name,
    since: latest.startTime,
  };
}

/** Returns non-KG device categories with tracking enabled, ordered by sortOrder then createdAt. */
export async function getNonKgTrackingCategories(userId: string) {
  return prisma.deviceCategory.findMany({
    where: { userId, isBuiltIn: false, trackingEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, icon: true },
  });
}

/** Returns the currently active KG TrainingVorgabe for a user, or null.
 *  Filters explicitly to the KG category — legacy rows with categoryId=null
 *  (pre-device-categories) OR rows linked to the built-in KG category.
 *  Other categories (Plug, etc.) are handled by CategoryGoalsToday. */
export async function getActiveVorgabe(userId: string, now: Date) {
  return prisma.trainingVorgabe.findFirst({
    where: {
      userId,
      gueltigAb: { lte: now },
      AND: [
        { OR: [{ gueltigBis: null }, { gueltigBis: { gte: now } }] },
        { OR: [{ categoryId: null }, { category: { isBuiltIn: true } }] },
      ],
    },
    orderBy: { gueltigAb: "desc" },
  });
}

/**
 * Validates that a device belongs to a user and is active (not archived).
 * Accepts an optional Prisma transaction client — falls back to the default client.
 * Returns the device if valid, or null if invalid/missing.
 */
export async function validateDeviceOwnership(
  deviceId: string,
  userId: string,
  tx?: PrismaTx,
) {
  const client = tx ?? prisma;
  const device = await client.device.findUnique({ where: { id: deviceId } });
  if (!device || device.userId !== userId || device.archivedAt) return null;
  return device;
}

/** Shared base `where` for KEYHOLDER Sperrzeit-Sichten: nicht zurückgezogen, noch nicht beendet —
 *  ABER OHNE wirksamAb-Gate, damit GEPLANTE Sperrzeiten dem Keyholder sichtbar/stornierbar sind.
 *  `activeSperrzeitWhere` baut darauf auf und ergänzt das wirksamAb-Gate für Sub/Enforcement. */
function keyholderSperrzeitWhere(userIdFilter: string | { in: string[] }, now: Date) {
  return {
    userId: userIdFilter,
    art: "SPERRZEIT" as const,
    withdrawnAt: null,
    OR: [{ endetAt: { gt: now } }, { endetAt: null }],
  };
}

/** Shared `where` for currently-active Sperrzeiten (not withdrawn, already triggered, not ended).
 *  Erweitert `keyholderSperrzeitWhere` um das `wirksamAb`-Gate: schliesst geplante (zukünftige)
 *  Sperrzeiten aus — sie dürfen vor ihrem Versand das Öffnen nicht blockieren. */
function activeSperrzeitWhere(userIdFilter: string | { in: string[] }, now: Date) {
  const { OR, ...base } = keyholderSperrzeitWhere(userIdFilter, now);
  return {
    ...base,
    AND: [
      activeVerschlussAnforderungWhere(now),
      { OR },
    ],
  };
}

/** Returns all currently-active Sperrzeiten for a user (or all users if `userIds` given). */
export async function getActiveSperrzeiten(
  userId: string | { userIds: string[] },
  tx?: PrismaTx,
) {
  const client = tx ?? prisma;
  const filter = typeof userId === "string" ? userId : { in: userId.userIds };
  return client.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(filter, new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the single active Sperrzeit for a user, or null. */
export async function getActiveSperrzeit(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  return client.verschlussAnforderung.findFirst({
    where: activeSperrzeitWhere(userId, new Date()),
    orderBy: { createdAt: "desc" },
    // device additiv mitladen — vom get_overview (deviceName) genutzt, für alle
    // anderen Aufrufer harmlos (lesen nur Skalarfelder).
    include: { device: { select: { name: true } } },
  });
}

/** Returns the single Sperrzeit (active OR scheduled) for a KEYHOLDER view, or null.
 *  Unlike getActiveSperrzeit it includes a future-scheduled Sperrzeit (wirksamAb > now). */
export async function getKeyholderSperrzeit(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  const now = new Date();
  return client.verschlussAnforderung.findFirst({
    where: keyholderSperrzeitWhere(userId, now),
    orderBy: { createdAt: "desc" },
    include: { device: { select: { name: true } } },
  });
}

/** Returns all Sperrzeiten (active OR scheduled) for a KEYHOLDER view across users. */
export async function getKeyholderSperrzeiten(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.verschlussAnforderung.findMany({
    where: keyholderSperrzeitWhere({ in: userIds }, new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the open OrgasmusAnforderung whose window has not yet ended (newest first), or null. */
export async function getActiveOrgasmusAnforderung(userId: string, now: Date = new Date(), tx?: PrismaTx) {
  const client = tx ?? prisma;
  return client.orgasmusAnforderung.findFirst({
    where: { userId, fulfilledAt: null, withdrawnAt: null, endetAt: { gte: now } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Live-Antwort auf „darf der Sub JETZT öffnen?" — spiegelt die Regel aus strafbuch.ts/oeffnen:
 * keine aktive Sperrzeit ODER ein aktives, erlaubtes Reinigungsfenster ODER ein Orgasmus-
 * Öffnungsfenster. Genutzt fürs Bildersafe-Foto-Freigabe-Gate.
 */
export async function isOpeningPermittedNow(userId: string, now: Date = new Date()): Promise<boolean> {
  const sperre = await getActiveSperrzeit(userId);
  if (!sperre) return true;

  // Erlaubtes, aktives Reinigungsfenster (User- UND Sperrzeit-Flag + im Zeitfenster)
  if (sperre.reinigungErlaubt) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungsFenster: true },
    });
    if (user?.reinigungErlaubt && aktivesReinigungsFenster(user.reinigungsFenster, now)) return true;
  }

  // Orgasmus-Öffnungsfenster (oeffnenErlaubt + im Zeitfenster)
  const orgasm = await getActiveOrgasmusAnforderung(userId, now);
  if (orgasm?.oeffnenErlaubt && orgasm.beginntAt <= now) return true;

  return false;
}

/**
 * Ist das versiegelte Code-Foto eines VERSCHLUSS-Eintrags aktuell freigegeben?
 * Freigegeben, wenn die Session vorbei ist (späteres OEFFNEN existiert) ODER Öffnen gerade erlaubt ist.
 * `hasLaterOpen` kann übergeben werden (z.B. aus bereits geladenen Einträgen), um die DB-Abfrage zu sparen.
 */
export async function isCodePhotoRevealed(
  entry: { userId: string; startTime: Date },
  now: Date = new Date(),
  hasLaterOpen?: boolean,
): Promise<boolean> {
  if (hasLaterOpen === undefined) {
    const later = await prisma.entry.findFirst({
      where: { userId: entry.userId, type: "OEFFNEN", startTime: { gt: entry.startTime } },
      select: { id: true },
    });
    hasLaterOpen = later !== null;
  }
  if (hasLaterOpen) return true;
  return isOpeningPermittedNow(entry.userId, now);
}

/**
 * Releases active SPERRZEIT periods when a user opens their device.
 * The release is skipped (Sperrzeit kept active) for cleaning openings where
 * both `user.reinigungErlaubt` and *every* active Sperrzeit's `reinigungErlaubt`
 * are true. Must be called inside a transaction.
 *
 * `userReinigungErlaubt` may be passed by callers that already loaded the user
 * to avoid a redundant fetch — otherwise the function loads it itself.
 *
 * Returns true if at least one Sperrzeit was withdrawn (for notification routing).
 */
export async function releaseSperrzeitenOnOpen(
  userId: string,
  oeffnenGrund: OeffnenGrund | string | null | undefined,
  tx: PrismaTx,
  userReinigungErlaubt?: boolean,
): Promise<boolean> {
  const activeSperrzeiten = await tx.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(userId, new Date()),
    select: { id: true, reinigungErlaubt: true },
  });
  if (activeSperrzeiten.length === 0) return false;

  const effectiveUserErlaubt = userReinigungErlaubt ?? (
    await tx.user.findUnique({ where: { id: userId }, select: { reinigungErlaubt: true } })
  )?.reinigungErlaubt ?? false;

  const allowedCleaning =
    oeffnenGrund === "REINIGUNG" &&
    effectiveUserErlaubt === true &&
    activeSperrzeiten.every((s) => s.reinigungErlaubt);
  if (allowedCleaning) return false;

  await tx.verschlussAnforderung.updateMany({
    where: { id: { in: activeSperrzeiten.map((s) => s.id) } },
    data: { withdrawnAt: new Date() },
  });
  return true;
}
