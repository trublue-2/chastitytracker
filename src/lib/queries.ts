import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { OeffnenGrund } from "@/lib/constants";
import { aktivesReinigungsFenster, parseReinigungsFenster } from "@/lib/reinigungService";
import { APP_TZ } from "@/lib/utils";

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

/** Resolves a user's governing IANA timezone (falls back to APP_TZ default if the row is missing).
 *  Used by admin/keyholder pages, the upload route and MCP tools that render/interpret a specific
 *  sub's data — the SUB's timezone always governs, never the viewer's. Self/dashboard paths should
 *  prefer `session.user.timezone` (on the JWT) to avoid this extra query. */
export async function getUserTimezone(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return u?.timezone ?? APP_TZ;
}

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

/** Letzter KG-Entry (VERSCHLUSS/OEFFNEN) eines Users — die EINE Quelle für den Lock-Zustand.
 *  Optionaler tx-Client für Transaktionen; in einer Transaktion IMMER `tx` durchreichen, sonst
 *  liest der Aufruf ausserhalb der Transaktion (TOCTOU).
 *
 *  Das schmale `select` trägt genau die Felder, die die Aufrufer brauchen: `type` (Lock-Zustand),
 *  `startTime` (Zeit-Guards), `kontrollCode` (deriveSealCode) und `deviceId` (Geräte-Check). */
export function getLatestKgEntry(userId: string, tx: PrismaTx | typeof prisma = prisma) {
  return tx.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true, startTime: true, kontrollCode: true, deviceId: true },
  });
}

/** Returns true if the user is currently locked (latest VERSCHLUSS/OEFFNEN entry is VERSCHLUSS).
 *
 *  KG-only by design: Sperrzeiten, VerschlussAnforderung, Strafen, Kontroll-Anforderungen and
 *  the "Verschlossen seit X" banner all rely on this single global lock state. Per-category
 *  wear status (Plug, Collar, ...) is determined separately from `buildPairs` results in the
 *  pages that need it — never via this function. */
export async function getIsLocked(userId: string, tx: PrismaTx | typeof prisma = prisma): Promise<boolean> {
  const latest = await getLatestKgEntry(userId, tx);
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

/** Die aktuell OFFENE (noch nicht eingereichte) Kontroll-Anforderung, oder null. Geplante, noch
 *  nicht ausgelöste Kontrollen bleiben unsichtbar (`aktiveKontrolleWhere`).
 *  Geteilt von `get_overview` (V1) und `keyholder_dashboard` (V2). */
export async function getOpenKontrolle(userId: string, now: Date = new Date()) {
  return prisma.kontrollAnforderung.findFirst({
    where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
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

/** Shared base `where` for KEYHOLDER OrgasmusAnforderung-Sichten: offen (nicht erfüllt, nicht
 *  zurückgezogen) — ABER OHNE endetAt-Gate, damit ein bereits abgelaufenes, noch nicht aufgeräumtes
 *  Fenster dem Keyholder weiterhin sichtbar/stornierbar ist. `getActiveOrgasmusAnforderung` (Sub/
 *  Enforcement-Sicht, z.B. Öffnen-Gate) filtert bewusst `endetAt: { gte: now }` — dasselbe Muster wie
 *  `keyholderSperrzeitWhere` vs. `activeSperrzeitWhere`. */
function keyholderOrgasmusAnforderungWhere(userIdFilter: string | { in: string[] }) {
  return { userId: userIdFilter, fulfilledAt: null, withdrawnAt: null } as const;
}

/** Returns the single open OrgasmusAnforderung for a KEYHOLDER view (active OR already expired but
 *  not yet fulfilled/withdrawn), or null. */
export async function getKeyholderOrgasmusAnforderung(userId: string) {
  return prisma.orgasmusAnforderung.findFirst({
    where: keyholderOrgasmusAnforderungWhere(userId),
    orderBy: { createdAt: "desc" },
  });
}

/** Returns all open OrgasmusAnforderungen (active OR expired-but-open) for a KEYHOLDER view across users. */
export async function getKeyholderOrgasmusAnforderungen(userIds: string[]) {
  if (userIds.length === 0) return [];
  return prisma.orgasmusAnforderung.findMany({
    where: keyholderOrgasmusAnforderungWhere({ in: userIds }),
    orderBy: { createdAt: "desc" },
  });
}

/** Liegt `at` in einem erlaubten Reinigungs-Zeitfenster des Subs? **Keine Fenster konfiguriert =
 *  nicht zeitgebunden** → immer offen (so liest `/api/integration/box/config` die leere Liste
 *  ebenfalls). Sind Fenster gesetzt, sind sie eine echte Schranke: ausserhalb ist eine
 *  Reinigungsöffnung ein Verstoss. Einzige Quelle für diese Frage — von `isAllowedCleaningOpen`
 *  (Öffnen bricht die Sperrzeit?) und `isOpeningPermittedNow` (Bildersafe-Gate) geteilt, die sonst
 *  auseinanderliefen. `tz` ist die Zone des SUBS: die Fenster sind seine Wanduhrzeit. */
export function cleaningWindowOpen(reinigungsFenster: unknown, at: Date, tz: string): boolean {
  const fenster = parseReinigungsFenster(reinigungsFenster);
  return fenster.length === 0 || aktivesReinigungsFenster(fenster, at, tz) !== null;
}

/**
 * Live-Antwort auf „darf der Sub JETZT öffnen?" — spiegelt die Regel aus strafbuch.ts/oeffnen:
 * keine aktive Sperrzeit ODER ein aktives, erlaubtes Reinigungsfenster ODER ein Orgasmus-
 * Öffnungsfenster. Genutzt fürs Bildersafe-Foto-Freigabe-Gate.
 */
export async function isOpeningPermittedNow(userId: string, now: Date = new Date()): Promise<boolean> {
  const sperre = await getActiveSperrzeit(userId);
  if (!sperre) return true;

  // Erlaubte Reinigungsöffnung — dieselbe Quelle wie Durchsetzung und Strafbuch. Der äussere Guard
  // spart nur die User-Abfrage, wenn die Sperrzeit Reinigung ohnehin verbietet.
  if (sperre.reinigungErlaubt) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungsFenster: true, timezone: true },
    });
    if (user && cleaningBlockReason(user, [sperre], now) === null) return true;
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

/** Der Teil des Users, den die Reinigungs-Erlaubnis braucht. Aufrufer, die ihn ohnehin geladen
 *  haben, reichen ihn durch (spart den Refetch); sonst lädt {@link releaseSperrzeitenOnOpen} ihn. */
export interface CleaningPermissionUser {
  reinigungErlaubt: boolean;
  /** JSON-String ODER Array — `parseReinigungsFenster` ist tolerant. Leer = nicht zeitgebunden. */
  reinigungsFenster: unknown;
  /** IANA-Zone des SUBS: die Fenster sind seine Wanduhrzeit, nicht die des Betrachters. */
  timezone: string;
}

/** Warum eine Reinigungsöffnung gerade NICHT erlaubt ist. Reihenfolge = Spezifität: das Speziellere
 *  gewinnt, damit die Texte den nützlichsten Grund nennen (wer gar nicht reinigen darf, braucht
 *  keinen Fenster-Hinweis). */
export type CleaningBlockReason = "userNotAllowed" | "lockPeriodForbids" | "outsideWindow";

/**
 * Darf zu `at` eine Reinigungsöffnung stattfinden, ohne die Sperrzeit zu brechen? `null` = ja.
 *
 * DIE eine Quelle dieser Frage. Sie beantwortet nicht nur „ob", sondern „warum nicht" — denn die
 * Anzeigen (Box-Karte, Öffnen-Dialog) müssen dem Sub den Grund nennen und würden ihn sonst selbst
 * ausrechnen. Genau diese Nachrechnung war die Fehlerquelle: dieselbe Regel stand in
 * `strafbuch.ts` (ohne Fenster-Prüfung) und in `OeffnenFormCore.tsx` (nur User-Flag) noch einmal.
 *
 * Drei Bedingungen, alle nötig: der User darf reinigen, JEDE aktive Sperrzeit erlaubt es, und —
 * sofern Fenster konfiguriert sind — `at` liegt in einem. **Keine Fenster = nicht zeitgebunden**,
 * jederzeit erlaubt. Ausserhalb eines konfigurierten Fensters ist die Öffnung ein Verstoss: die
 * Sperrzeit fällt, das Strafbuch bucht, und die Box bekommt kein Kommando.
 *
 * `at` ist NICHT dasselbe für alle Aufrufer: die Durchsetzung
 * ({@link releaseSperrzeitenOnOpen}) prüft `now`, weil der Riegel in DIESEM Moment auffährt und eine
 * rückdatierte `startTime` die Schranke sonst aushebelte. Das Strafbuch prüft `startTime`, weil es
 * Buch über die Vergangenheit führt.
 *
 * Das Tageskontingent (`reinigungMaxProTag`) gehört bewusst NICHT hierher: es wird nur erkannt, nicht
 * durchgesetzt — die Keyholderin entscheidet über die Ahndung.
 */
export function cleaningBlockReason(
  user: CleaningPermissionUser,
  activeSperrzeiten: { reinigungErlaubt: boolean }[],
  at: Date,
): CleaningBlockReason | null {
  if (!user.reinigungErlaubt) return "userNotAllowed";
  if (!activeSperrzeiten.every((s) => s.reinigungErlaubt)) return "lockPeriodForbids";
  if (!cleaningWindowOpen(user.reinigungsFenster, at, user.timezone)) return "outsideWindow";
  return null;
}

/** Ist DIESE Öffnung eine erlaubte Reinigungsöffnung? Grund + {@link cleaningBlockReason}. */
function isAllowedCleaningOpen(
  oeffnenGrund: OeffnenGrund | string | null | undefined,
  now: Date,
  user: CleaningPermissionUser,
  activeSperrzeiten: { reinigungErlaubt: boolean }[],
): boolean {
  return oeffnenGrund === "REINIGUNG" && cleaningBlockReason(user, activeSperrzeiten, now) === null;
}

/**
 * Releases active SPERRZEIT periods when a user opens their device.
 * The release is skipped (Sperrzeit kept active) only for a permitted cleaning opening — see
 * {@link isAllowedCleaningOpen}. Must be called inside a transaction.
 *
 * `user` may be passed by callers that already loaded it to avoid a redundant fetch.
 *
 * Returns true if at least one Sperrzeit was withdrawn (for notification routing). The caller uses
 * that to decide whether the box may follow the entry: a withdrawn Sperrzeit means the opening was
 * FORBIDDEN, and the box must stay shut — otherwise documenting the offense would execute it.
 */
export async function releaseSperrzeitenOnOpen(
  userId: string,
  oeffnenGrund: OeffnenGrund | string | null | undefined,
  tx: PrismaTx,
  user?: CleaningPermissionUser,
): Promise<boolean> {
  // EINE Uhr für beide Fragen: welche Sperrzeiten laufen, und ist ein Fenster offen.
  const now = new Date();
  const activeSperrzeiten = await tx.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(userId, now),
    select: { id: true, reinigungErlaubt: true },
  });
  if (activeSperrzeiten.length === 0) return false;

  const effectiveUser = user ?? await tx.user.findUnique({
    where: { id: userId },
    select: { reinigungErlaubt: true, reinigungsFenster: true, timezone: true },
  }) ?? { reinigungErlaubt: false, reinigungsFenster: null, timezone: APP_TZ };

  if (isAllowedCleaningOpen(oeffnenGrund, now, effectiveUser, activeSperrzeiten)) return false;

  await tx.verschlussAnforderung.updateMany({
    where: { id: { in: activeSperrzeiten.map((s) => s.id) } },
    data: { withdrawnAt: now },
  });
  return true;
}
