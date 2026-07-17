import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { OeffnenGrund, EntrySource } from "@/lib/constants";
import { LOCK_ENDED_REASON } from "@/lib/constants";
import { aktivesReinigungsFenster, parseReinigungsFenster } from "@/lib/reinigungService";
import { APP_TZ } from "@/lib/utils";

/**
 * Where-Fragment: bereits AKTIVE Kontroll-Anforderungen — sofortige (wirksamAb null) und
 * zeitversetzte, die schon ausgelöst haben (wirksamAb <= jetzt). Noch nicht aktive (wirksamAb in
 * der Zukunft, z.B. geplante Auto-Kontrollen) bleiben verborgen — ÜBERALL: Sub-Sichten (Dashboard,
 * Stats, MCP) UND Admin/Strafbuch (sonst sähe die Keyholderin die geplanten Zufallszeiten).
 */
export function aktiveKontrolleWhere(now: Date = new Date()): Prisma.KontrollAnforderungWhereInput {
  return { OR: [{ wirksamAb: null }, { wirksamAb: { lte: now } }] };
}

/**
 * Where-Fragment: WIRKLICH zurückgezogene Kontrollen — ein Nicht-Ereignis (Keyholder-Rückzug,
 * Auto-Kontrolle bei offenem KG, Überschneidungs-Schutz), das gelöscht bzw. ausgeblendet werden darf.
 *
 * `withdrawnAt` allein REICHT NICHT: die Eskalation (Stufe 2) setzt es ebenfalls, wenn eine Frist
 * verstrichen ist und sie das Gerät auto-entfernt hat — das ist das GEGENTEIL eines Rückzugs, es ist
 * ein Versäumnis (Status "missed"), und es trägt das Vergehen im Strafbuch (`autoMarkedRemovedAt`,
 * siehe strafbuch.ts). Wer nur auf `withdrawnAt` filtert, löscht Vergehen mit weg. Dieselbe
 * Rangfolge macht `mapAnforderungStatus` auf der Anzeige-Seite.
 */
export const GENUINELY_WITHDRAWN_WHERE = {
  withdrawnAt: { not: null },
  autoMarkedRemovedAt: null,
} satisfies Prisma.KontrollAnforderungWhereInput;

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
 *  `startTime` (Zeit-Guards), `kontrollCode` (deriveSealCode), `deviceId` (Geräte-Check) und
 *  `keyInBox` (Schlüssel-Deklaration, siehe `getCurrentLockKeyInBox`). */
export function getLatestKgEntry(userId: string, tx: PrismaTx | typeof prisma = prisma) {
  return tx.entry.findFirst({
    where: { userId, type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
    orderBy: { startTime: "desc" },
    select: { type: true, startTime: true, kontrollCode: true, deviceId: true, keyInBox: true },
  });
}

export interface EntryNeighbors {
  prev: { type: string } | null;
  next: { type: string } | null;
}

/** Die Nachbarn (vorheriger/nächster Eintrag desselben Paar-Typs) UNMITTELBAR vor und nach
 *  `startTime` in chronologischer Reihenfolge — nicht die zeitlich jüngsten Einträge insgesamt.
 *  Die eine Quelle für den "würde dieser Eintrag zwei gleichartige Einträge hintereinander
 *  erzeugen?"-Guard (INVALID_ORDER), von `getKgNeighbors` (KG, global) UND der Edit-Route
 *  (KG global ODER WEAR-Paare gescoped auf `categoryId`) genutzt.
 *
 *  `getLatestKgEntry` beantwortet "was ist der aktuelle Lock-Zustand" korrekt, aber beim
 *  Backdating (Admin-Route, TIME_BEFORE-Guard bewusst deaktiviert) reicht das nicht: ein neuer
 *  Eintrag kann zeitlich ZWISCHEN ein bestehendes Paar rutschen, ohne der global-jüngste zu sein.
 *  Ohne diesen Nachbar-Check können so zwei gleichartige Einträge (VERSCHLUSS/VERSCHLUSS oder
 *  OEFFNEN/OEFFNEN) chronologisch aufeinanderfolgen — die Anomalie, die `buildPairs` als
 *  verwaistes Pair abfängt (siehe utils.ts). Diese Funktion verhindert sie an der Quelle.
 *
 *  Zwei `findFirst`-Queries statt `findMany`+Scan: liest nur die zwei Zeilen, die der Guard
 *  tatsächlich braucht, statt aller Einträge dieses Paar-Typs. `excludeId` lässt den gerade
 *  bearbeiteten Eintrag selbst aus dem Vergleich raus (sonst wäre er sein eigener Nachbar).
 *
 *  `prev` ist bewusst INKLUSIVE eines exakten `startTime`-Gleichstands (`lte`, nicht `lt`): zwei
 *  gleichartige Einträge mit identischer `startTime` sind chronologisch nicht unterscheidbar und
 *  damit ebenso eine verwaiste Anomalie wie zwei unmittelbar aufeinanderfolgende — ein reines `lt`
 *  liesse einen exakten Gleichstand für BEIDE Seiten unsichtbar werden (weder `< startTime` noch
 *  `> startTime`), und genau dieser Fall wurde vom `next: { gt }` allein nicht abgedeckt. */
export async function getEntryNeighbors(
  userId: string,
  startTime: Date,
  pairTypes: readonly string[],
  tx: PrismaTx | typeof prisma = prisma,
  { categoryId, excludeId }: { categoryId?: string; excludeId?: string } = {},
): Promise<EntryNeighbors> {
  const categoryFilter = categoryId ? { device: { categoryId } } : {};
  const excludeFilter = excludeId ? { id: { not: excludeId } } : {};
  const [prev, next] = await Promise.all([
    tx.entry.findFirst({
      where: { userId, type: { in: [...pairTypes] }, startTime: { lte: startTime }, ...categoryFilter, ...excludeFilter },
      orderBy: { startTime: "desc" },
      select: { type: true },
    }),
    tx.entry.findFirst({
      where: { userId, type: { in: [...pairTypes] }, startTime: { gt: startTime }, ...categoryFilter, ...excludeFilter },
      orderBy: { startTime: "asc" },
      select: { type: true },
    }),
  ]);
  return { prev, next };
}

/** KG-Nachbarn (VERSCHLUSS/OEFFNEN, global) — dünner Wrapper um {@link getEntryNeighbors}. */
export function getKgNeighbors(
  userId: string,
  startTime: Date,
  tx: PrismaTx | typeof prisma = prisma,
): Promise<EntryNeighbors> {
  return getEntryNeighbors(userId, startTime, ["VERSCHLUSS", "OEFFNEN"], tx);
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

/** Schlüssel-Deklaration des LAUFENDEN Verschlusses (siehe `Entry.keyInBox`); null, wenn gerade nicht
 *  verschlossen ist — dann gibt es keinen Verschluss, über den etwas erklärt worden wäre.
 *
 *  Wohnt hier bei `getIsLocked`, weil es dieselbe Regel anwendet: der jüngste KG-Eintrag IST der
 *  Lock-Zustand. Solange verschlossen ist, ist dieser Eintrag zugleich der Verschluss, den
 *  `buildLockState` (MCP) aus den Paaren zieht — beide Wege beantworten die Frage identisch. */
export async function getCurrentLockKeyInBox(userId: string, tx: PrismaTx | typeof prisma = prisma): Promise<boolean | null> {
  const latest = await getLatestKgEntry(userId, tx);
  return latest?.type === "VERSCHLUSS" ? latest.keyInBox : null;
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

/** Ist diese Direktive TERMINIERT und noch nicht ausgelöst (wirksamAb in der Zukunft)? Die
 *  Zeit-Seite von `activeVerschlussAnforderungWhere`, für bereits geladene Zeilen. */
export function isScheduledDirective(wirksamAb: Date | null, now: Date = new Date()): boolean {
  return wirksamAb !== null && wirksamAb > now;
}

/** Ein User oder eine User-Menge → Prisma-Filter. Geteilt von den Sperrzeit-Listen-Queries. */
function sperrzeitUserFilter(userId: string | { userIds: string[] }) {
  return typeof userId === "string" ? userId : { in: userId.userIds };
}

/** Returns all currently-active Sperrzeiten for a user (or all users if `userIds` given). */
export async function getActiveSperrzeiten(
  userId: string | { userIds: string[] },
  tx?: PrismaTx,
) {
  const client = tx ?? prisma;
  return client.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(sperrzeitUserFilter(userId), new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Faltet mehrere gleichzeitig AKTIVE Sperrzeiten zur EFFEKTIVEN Sperre zusammen — der einen, die
 * durchsetzt. Denn mehrere können koexistieren: eine für später geplante Sperrzeit überlebt eine
 * Öffnung (sie ist noch nicht aktiv, `releaseSperrzeitenOnOpen` greift nur aktive), und schliesst
 * der Sub sich danach über eine Verschluss-Anforderung wieder ein, legt `entries/route.ts` eine
 * zweite an. Löst die geplante dann aus, laufen zwei gleichzeitig.
 *
 * Zusammengefaltet wird nach der STRENGSTEN Regel, nicht nach der neuesten Zeile:
 * - `endetAt`: unbefristet schlägt alles, sonst das SPÄTESTE Ende. Nähme man die zuletzt angelegte
 *   (das tat `findFirst` + `orderBy createdAt desc`), liefe die Box beim frühesten Ende auf — die
 *   längere Sperre der Keyholderin wäre stillschweigend verkürzt, physisch.
 * - `reinigungErlaubt`: nur wenn JEDE aktive Sperre es erlaubt (dieselbe UND-Regel wie
 *   {@link cleaningBlockReason}, das deshalb eine Liste nimmt).
 * Die übrigen Felder (Nachricht, Gerät, id) stammen aus der durchsetzenden Zeile.
 */
export function foldActiveSperrzeiten<T extends { endetAt: Date | null; reinigungErlaubt: boolean }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  const enforcing = rows.reduce((a, b) => {
    if (a.endetAt === null) return a;          // unbefristet gewinnt
    if (b.endetAt === null) return b;
    return b.endetAt > a.endetAt ? b : a;      // sonst das spätere Ende
  });
  return { ...enforcing, reinigungErlaubt: rows.every((r) => r.reinigungErlaubt) };
}

/** Die aktuell OFFENE (noch nicht eingereichte) Kontroll-Anforderung, oder null. Geplante, noch
 *  nicht ausgelöste Kontrollen bleiben unsichtbar (`aktiveKontrolleWhere`).
 *  Genutzt von `keyholder_dashboard`. */
export async function getOpenKontrolle(userId: string, now: Date = new Date()) {
  return prisma.kontrollAnforderung.findFirst({
    where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Die offene Verschluss-ANFORDERUNG („schliess dich bis X ein"), oder null.
 *
 * Nur die bereits AUSGELÖSTE: eine erst geplante steht schon in `scheduledDirectives` des
 * Dashboards und stünde sonst doppelt — und der Sub weiss von ihr ohnehin noch nichts.
 *
 * Ohne diese Sicht ist `request_lock` ein Schreib-ohne-Lesen: die Keyholderin kann eine Anforderung
 * stellen, aber nirgends sehen, ob sie noch offen oder schon überfällig ist. Bis zum Wegfall der
 * V1-Schicht beantwortete das ausschliesslich `get_overview.openVerschlussAnforderung`.
 */
export async function getOpenLockRequest(userId: string, now: Date = new Date()) {
  return prisma.verschlussAnforderung.findFirst({
    where: {
      userId, art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null,
      ...activeVerschlussAnforderungWhere(now),
    },
    orderBy: { createdAt: "desc" },
    include: { device: { select: { name: true } } },
  });
}

/** Die EFFEKTIVE aktive Sperre eines Users, oder null — mehrere gleichzeitig aktive werden über
 *  {@link foldActiveSperrzeiten} zur strengsten zusammengefaltet (spätestes Ende, Reinigung nur wenn
 *  alle sie erlauben). Jeder Aufrufer, der „die Sperrzeit" meint — Box-Durchsetzung, Öffnen-Gate,
 *  Dashboard —, bekommt so dieselbe Antwort. */
export async function getActiveSperrzeit(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  const rows = await client.verschlussAnforderung.findMany({
    where: activeSperrzeitWhere(userId, new Date()),
    orderBy: { createdAt: "desc" },
    // device additiv mitladen — für den deviceName der Sperrzeit genutzt, für alle
    // anderen Aufrufer harmlos (lesen nur Skalarfelder).
    include: { device: { select: { name: true } } },
  });
  return foldActiveSperrzeiten(rows);
}

/** Die EINE Sperrzeit für eine KEYHOLDER-Sicht (aktiv ODER geplant), oder null. Anders als
 *  {@link getActiveSperrzeit} zeigt sie auch eine erst geplante (wirksamAb > now), damit der
 *  Keyholder sie sehen und stornieren kann.
 *
 *  Läuft eine, gewinnt die AKTIVE — und zwar dieselbe EFFEKTIVE, die die Box durchsetzt
 *  ({@link foldActiveSperrzeiten}). Sonst zeigte die Admin-Oberfläche ein anderes Ende an als das,
 *  gegen das der Sub tatsächlich verschlossen ist. Nur wenn KEINE aktiv ist, kommt die neueste
 *  geplante. */
export async function getKeyholderSperrzeit(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  const now = new Date();
  const rows = await client.verschlussAnforderung.findMany({
    where: keyholderSperrzeitWhere(userId, now),
    orderBy: { createdAt: "desc" },
    include: { device: { select: { name: true } } },
  });
  return foldActiveSperrzeiten(rows.filter((s) => !isScheduledDirective(s.wirksamAb, now)))
    ?? rows[0] ?? null;
}

/** Returns all OFFENEN Sperrzeiten (aktiv ODER geplant) für eine KEYHOLDER-Sicht — für EINEN User
 *  oder über mehrere. Bewusst eine LISTE, nicht „die" Sperrzeit: mehrere offene sind normal (siehe
 *  {@link foldActiveSperrzeiten}), und der MCP muss die Mehrdeutigkeit sehen können, um sie dem
 *  Keyholder zu melden. Neueste zuerst. */
export async function getKeyholderSperrzeiten(userId: string | { userIds: string[] }) {
  return prisma.verschlussAnforderung.findMany({
    where: keyholderSperrzeitWhere(sperrzeitUserFilter(userId), new Date()),
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

/** Warum die Reinigungs-Zeitfenster (`windows`) GERADE NICHT einschränken (A-02 aus der MCP-
 *  Befundliste 2026-07-17): sie binden nur während einer aktiven Sperrzeit, die sowohl der User
 *  als auch die Sperrzeit selbst erlaubt, UND nur wenn überhaupt Fenster konfiguriert sind (eine
 *  leere Liste ist nicht zeitgebunden — nichts, das binden könnte, siehe {@link cleaningWindowOpen}).
 *  Außerhalb dieses Kontexts ist eine Reinigungsöffnung immer erlaubt, egal was `windows` sagt.
 *  `null` = die Fenster binden gerade (der übliche, nicht erklärungsbedürftige Fall). */
export type WindowsBindingReason = "no-active-lock-period" | "user-not-allowed" | "lock-period-forbids" | "no-windows-configured" | null;

/**
 * Bindet `windows` gerade tatsächlich, und darf JETZT eine Reinigungsöffnung stattfinden?
 *
 * Für get_context (A-02): sortiert das Ergebnis von {@link cleaningBlockReason} nur in die Antwort
 * ein, die tatsächlich gestellt wird — beurteilt nichts neu. `cleaningBlockReason` selbst prüft das
 * Fenster nur, wenn eine aktive Sperrzeit übergeben wird; die vorgelagerte "keine aktive Sperrzeit"-
 * Frage kennt es nicht (dieselbe Lücke, die {@link isOpeningPermittedNow} und
 * {@link releaseSperrzeitenOnOpen} mit einem eigenen `if (!sperre)`/`if (activeSperrzeiten.length
 * === 0)`-Guard vor jedem Aufruf schließen) — hier also genauso, statt sie ein drittes Mal woanders
 * zu wiederholen. Ebenso unterscheidet `cleaningBlockReason`s `null`-Rückgabe NICHT zwischen "im
 * konfigurierten Fenster" und "gar keine Fenster konfiguriert" (beides macht `cleaningWindowOpen`
 * zu `true`) — für `windowsBinding` ist das aber ein Unterschied: ohne konfigurierte Fenster gibt es
 * nichts, das binden könnte, das wird hier zusätzlich unterschieden.
 */
export function cleaningWindowBindingStatus(
  user: CleaningPermissionUser,
  sperre: { reinigungErlaubt: boolean } | null,
  at: Date,
): { windowsBinding: boolean; windowsBindingReason: WindowsBindingReason; openingAllowedNow: boolean } {
  if (!sperre) {
    return { windowsBinding: false, windowsBindingReason: "no-active-lock-period", openingAllowedNow: true };
  }
  const reason = cleaningBlockReason(user, [sperre], at);
  if (reason === "userNotAllowed") return { windowsBinding: false, windowsBindingReason: "user-not-allowed", openingAllowedNow: false };
  if (reason === "lockPeriodForbids") return { windowsBinding: false, windowsBindingReason: "lock-period-forbids", openingAllowedNow: false };
  if (parseReinigungsFenster(user.reinigungsFenster).length === 0) {
    // Keine Fenster konfiguriert: cleaningWindowOpen liest das als "immer offen" — korrekt für
    // openingAllowedNow, aber windows binden hier nichts, unabhängig vom Ergebnis.
    return { windowsBinding: false, windowsBindingReason: "no-windows-configured", openingAllowedNow: true };
  }
  // reason ist hier "outsideWindow" oder null — in beiden Fällen wurde ein KONFIGURIERTES Fenster
  // tatsächlich befragt.
  return { windowsBinding: true, windowsBindingReason: null, openingAllowedNow: reason === null };
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
 *
 * `source` unterscheidet die WILLENTLICHE Öffnung von der VERMUTETEN: die Eskalation bucht eine
 * unbeantwortete Kontrolle als „Gerät vermutlich abgenommen" und legt dafür einen OEFFNEN-Eintrag an
 * — ohne dass der Sub etwas getan hätte, und ohne dass die Box überhaupt aufgeht. Eine solche
 * Buchung darf keine Sperrzeit aufheben: sonst räumte ausgerechnet ein Versäumnis die Konsequenz aus
 * dem Weg, die es nach sich ziehen soll (gemeldet 11.07.2026 — eine 14-Tage-Sperre verschwand).
 */
export async function releaseSperrzeitenOnOpen(
  userId: string,
  oeffnenGrund: OeffnenGrund | string | null | undefined,
  tx: PrismaTx,
  // Bewusst PFLICHT und vor dem optionalen `user`: ein Default „user" liesse einen künftigen
  // System-Pfad, der das Argument vergisst, still in genau den Bug zurückfallen, den er behebt.
  source: EntrySource,
  user?: CleaningPermissionUser,
): Promise<boolean> {
  if (source === "system") return false;

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
    data: { withdrawnAt: now, endedReason: LOCK_ENDED_REASON.opening },
  });
  return true;
}

/**
 * Die jüngste Sperrzeit, die der Sub durch eine Öffnung aufgebrochen hat und deren ursprüngliches
 * Ende noch nicht verstrichen ist.
 *
 * Sie ist NICHT aktiv — sie wird gerade nicht vollstreckt. Aber sie ist auch nicht verschwunden:
 * ohne sie bedeutete `activeLockPeriod: null` gleichermassen „abgelaufen", „zurückgezogen" und „es
 * gab nie eine". Genau diese Ununterscheidbarkeit war der Bug.
 */
export async function getInterruptedSperrzeit(userId: string, now: Date) {
  // Dieselbe „SPERRZEIT, deren Ende noch nicht verstrichen ist"-Definition wie die aktive Sicht —
  // nur eben zurückgezogen statt laufend. `withdrawnAt: null` fällt weg, `endedReason` tritt hinzu.
  const { withdrawnAt: _stillRunning, ...notYetElapsed } = keyholderSperrzeitWhere(userId, now);
  return prisma.verschlussAnforderung.findFirst({
    where: { ...notYetElapsed, endedReason: LOCK_ENDED_REASON.opening },
    orderBy: { withdrawnAt: "desc" },
    select: { endetAt: true, withdrawnAt: true, nachricht: true },
  });
}

/** Select-Shape jedes Eintrags, den das Session-Modell paart (`buildWearSessions`, `buildPairs`).
 *  `device.id` ist PFLICHT: Trage-Sessions werden je GERÄT gepaart — fehlt die id, fällt jeder
 *  WEAR-Eintrag als gerätelos heraus und die Kategorie zeigt lautlos 0 Stunden. */
export const SESSION_ENTRY_SELECT = {
  id: true,
  type: true,
  startTime: true,
  device: { select: { id: true, categoryId: true } },
} satisfies Prisma.EntrySelect;

/** Alle WEAR_BEGIN/WEAR_END-Einträge eines Users, aufsteigend — die Quelle der Trage-Sessions. */
export async function getWearEntries(userId: string) {
  return prisma.entry.findMany({
    where: { userId, type: { in: ["WEAR_BEGIN", "WEAR_END"] } },
    orderBy: { startTime: "asc" },
    select: SESSION_ENTRY_SELECT,
  });
}
