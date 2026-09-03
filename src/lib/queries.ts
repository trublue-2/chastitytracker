import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { OeffnenGrund, EntrySource } from "@/lib/constants";
import { LOCK_ENDED_REASON, heimdallEnabled } from "@/lib/constants";
import { activeCleaningWindowIn, parseCleaningWindows } from "@/lib/cleaningService";
import { triggeredWhere } from "@/lib/delayedTrigger";
import { CONFIRMED_LOCK_FILTER, PENDING_LOCK_FILTER, effectiveEntryWhere } from "@/lib/lockPending";
import { APP_TZ } from "@/lib/utils";
import { isHealthHoldActive } from "@/lib/healthHold";

/**
 * Where-Fragment: bereits AKTIVE Kontroll-Anforderungen — sofortige (wirksamAb null) und
 * zeitversetzte, die schon ausgelöst haben (wirksamAb <= jetzt). Noch nicht aktive (wirksamAb in
 * der Zukunft, z.B. geplante Auto-Kontrollen) bleiben verborgen — ÜBERALL: Sub-Sichten (Dashboard,
 * Stats, MCP) UND Admin/Strafbuch (sonst sähe die Keyholderin die geplanten Zufallszeiten).
 */
/** Prisma-`include`, das die ZIEL-Namen einer Kontroll-Zeile mitlädt — Futter für
 *  `inspectionTargetLabel`. Als Konstante, weil sechs Sichten dieselben zwei Relationen brauchen
 *  und ein vergessenes `include` das Label still verschwinden lässt (kein Compile-Fehler, nur ein
 *  leeres Feld). Gleiches Muster wie `TASK_INCLUDE`. Steht hier statt in `inspectionTarget.ts`,
 *  weil das Modul von HIER importiert — andersherum wäre es ein Zyklus. */
export const KONTROLLE_TARGET_INCLUDE = {
  category: { select: { name: true } },
  device: { select: { name: true } },
} satisfies Prisma.KontrollAnforderungInclude;

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
 * Where-Fragment: die Zeilen des gewürfelten TAGESPLANS der Auto-Kontrollen — also automatische
 * Kontrollen OHNE die ereignisgetriebenen.
 *
 * `auto: true` allein reicht nicht mehr, seit eine Auto-Kontrolle auch aus einem Ereignis entstehen
 * kann (Wiederverschluss nach einer Reinigungspause, `cleaningRelock`). Für die Tagesplanung ist der
 * Unterschied load-bearing: zählte eine Ereignis-Zeile als Plan, verhinderte ein Wiederverschluss
 * kurz nach Mitternacht den Tagesplan des ganzen Tages — und der Neuwurf nach einer
 * Settings-Änderung räumte sie mit dem Tagesplan weg, obwohl sie zu einem Ereignis gehört.
 */
export const AUTO_PLAN_WHERE = {
  auto: true,
  // BEIDE Verschluss-Herkünfte ausschliessen. Eine Zeile aus einem Verschluss ist kein Tagesplan:
  // sie darf beim Neuwurf nicht gelöscht werden, sie zählt nicht gegen das Tages-Kontingent, und
  // sie darf einen noch ungeplanten Tag nicht als „schon geplant" erscheinen lassen. Fehlte hier
  // `postLock`, hätte ein Verschluss kurz nach Mitternacht den ganzen Tagesplan verschluckt.
  cleaningRelock: false,
  postLock: false,
} satisfies Prisma.KontrollAnforderungWhereInput;

/** Where-Fragment: die Tagesplan-Zeilen EINES Subs für den laufenden Tag. `day` ist die Sub-lokale
 *  Mitternacht (`midnightInTZ`) — die Tagesgrenze hängt an der Zeitzone der Sub, deshalb reicht der
 *  Aufrufer sie herein, statt sie hier zu erraten. */
export function todaysAutoPlanWhere(userId: string, day: Date): Prisma.KontrollAnforderungWhereInput {
  return { userId, ...AUTO_PLAN_WHERE, createdAt: { gte: day } };
}

/**
 * Where-Fragment für KEYHOLDER-Sichten (Admin-UI + MCP) — anders als `aktiveKontrolleWhere`
 * (Sub/Enforcement): zeigt zusätzlich MANUELL terminierte Kontrollen (`auto: false`), bevor sie
 * feuern, damit der Keyholder seine eigene geplante Kontrolle sehen und stornieren kann. Verborgen
 * bleiben nur ZUKÜNFTIGE Auto-/Zufalls-Kontrollen (`auto: true`, wirksamAb > now) — deren
 * Überraschungseffekt darf auch der Keyholder-UI nicht entgehen, sie sind ohnehin nicht
 * keyholder-gesetzt.
 *
 * Bindet damit auch den SCHREIBENDEN Keyholder-Pfad: ein Rückzug ohne id (`withdraw
 * target=inspection`) darf höchstens treffen, was dieses Fragment zeigt. Was der Aufrufer nicht
 * sehen kann, darf er nicht wegnehmen — er zöge sonst den Rest des Auto-Tagesplans mit, ohne dass
 * es in Anfrage oder Antwort vorkäme, und der Poller legt ihn nicht neu an (der Tages-Merker
 * `autoInspectionPlannedFor` hält den Tag für gewürfelt, egal was aus den Zeilen wurde — siehe
 * `ensureDailyAutoKontrollenForUser`). Vorfall 28.07.2026: ein Rückzug nahm zwei ungesehene Auto-Kontrollen mit, die
 * Automatik schwieg den Rest des Tages. Wer die Sichtbarkeitsregel hier ändert, ändert damit
 * bewusst auch den Umfang dieses Rückzugs.
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

/**
 * Der Schalter „Dateiauswahl auf Mobile" (`User.mobileDesktopUpload`) eines Subs — öffnet auf dem
 * Handy die Dateiauswahl statt der Kamera.
 *
 * Als eigene Ableitung, weil dieselbe Ein-Feld-Abfrage samt `?? false` in inzwischen sieben
 * Formular-Seiten stand — und die achte sie vergass: das Foto zum Tragen-Beginn folgte dem Schalter
 * nicht (Issue #51). Wer den Wert vergisst, bekommt keinen Fehler, sondern ein Formular, das die
 * Kamera erzwingt, obwohl die Keyholderin es anders eingestellt hat.
 *
 * Es gilt der Schalter des TRÄGERS, dem die Fotos gehören — nie der des Betrachters; dieselbe Regel
 * wie bei {@link getUserTimezone}.
 */
export async function getMobileDesktopMode(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { mobileDesktopUpload: true } });
  return u?.mobileDesktopUpload ?? false;
}

/** „Hat dieser Sub eine Heimdall-Box?" (+ deren Name fürs Formular). EINE Ableitung für alle
 *  Formulare, die den Box-Block zeigen — Verschluss und Kontrolle. Stünde sie je Seite einzeln da,
 *  zeigte nach der nächsten Änderung die eine Seite den Block und die andere nicht.
 *  Ohne Heimdall gar keine Abfrage: `boxConfirm=false` ist dann bereits die ganze Antwort.
 *
 *  `requiresBolt` gehört mit hierher, weil es dieselbe Frage weiterführt: der Riegel-Schalter der
 *  Keyholderin wirkt NUR, wo es eine Box gibt. Zwei getrennte Ableitungen liessen den Fall
 *  „Schalter an, Box abgemeldet" an einer Stelle als gültig durchgehen. */
export async function getBoxFormContext(userId: string): Promise<{ boxConfirm: boolean; boxName: string; requiresBolt: boolean }> {
  if (!heimdallEnabled()) return { boxConfirm: false, boxName: "", requiresBolt: false };
  const boxes = await prisma.boxStatus.findMany({ where: { userId }, select: { name: true } });
  const boxName = boxes.map((b) => b.name).filter(Boolean).join(", ");
  // Ohne Box ist `requiresBolt` schon beantwortet — die zweite Abfrage entfällt. Sie träfe sonst
  // auch die drei Aufrufer, die das Feld gar nicht lesen (Kontroll-Formular, Freigabe, Einstellungen).
  if (boxes.length === 0) return { boxConfirm: false, boxName, requiresBolt: false };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lockRequiresBolt: true } });
  return { boxConfirm: true, boxName, requiresBolt: user?.lockRequiresBolt ?? false };
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
 *  Das schmale `select` trägt genau die Felder, die die Aufrufer brauchen: `id` (die Bildersafe-
 *  Route schreibt auf diese Zeile), `type` (Lock-Zustand), `startTime` (Zeit-Guards),
 *  `kontrollCode` (deriveSealCode), `deviceId` (Geräte-Check) und `keyInBox` (Schlüssel-
 *  Deklaration, siehe `getCurrentLockKeyInBox`). */
export function getLatestKgEntry(
  userId: string,
  tx: PrismaTx | typeof prisma = prisma,
  { at, excludeId }: { at?: Date; excludeId?: string } = {},
) {
  return tx.entry.findFirst({
    // Ein Verschluss, dessen Riegel noch aussteht, ist ein AUFRUF und kein Zustand — er darf hier
    // nicht auftauchen, sonst gälte der Träger als verschlossen, bevor die Box es meldet
    // (`lockPending.ts`).
    where: effectiveEntryWhere({
      userId,
      type: { in: ["VERSCHLUSS", "OEFFNEN"] },
      // `at`: „was galt ZU DIESEM ZEITPUNKT" statt „was gilt jetzt" — nötig auf dem Keyholder-Pfad,
      // der rückdatieren darf; für einen nachgetragenen Eintrag ist der global jüngste Lock-Eintrag
      // der falsche Bezug. `excludeId` lässt einen bereits geschriebenen Eintrag aus, der sonst bei
      // `at = seine eigene startTime` sein eigener Vorgänger wäre (gleiches Motiv wie bei
      // `getEntryNeighbors`; die Alternative wäre ein als Rundungsfehler getarntes `at - 1ms`).
      ...(at ? { startTime: { lte: at } } : {}),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    }),
    orderBy: { startTime: "desc" },
    // `oeffnenGrund` gehört dazu, weil der Lock-Zustand allein nicht sagt, WARUM zuletzt geöffnet
    // wurde — die Kontrolle nach einer Reinigungspause hängt genau daran (entries-Route).
    select: { id: true, type: true, startTime: true, kontrollCode: true, deviceId: true, keyInBox: true, oeffnenGrund: true },
  });
}

export interface EntryNeighbors {
  prev: { id: string; type: string; startTime: Date } | null;
  next: { id: string; type: string; startTime: Date } | null;
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
  // `effectiveEntryWhere`: dieselbe Kette, die `getLatestKgEntry` sieht. Ohne sie widersprächen sich
  // zwei Guards DESSELBEN Handlers — der eine hielte den schwebenden Aufruf für nicht vorhanden, der
  // andere sähe ihn in der Reihenfolge und meldete `INVALID_ORDER` statt der zutreffenden Absage.
  const [prev, next] = await Promise.all([
    tx.entry.findFirst({
      where: effectiveEntryWhere({ userId, type: { in: [...pairTypes] }, startTime: { lte: startTime }, ...categoryFilter, ...excludeFilter }),
      orderBy: { startTime: "desc" },
      // `id`/`startTime` mit: der Lösch-Pfad braucht den NACHBARN selbst (er ist der Paar-Partner),
      // nicht bloss seine Art — und er soll ihn aus derselben Sicht bekommen wie jeder andere Guard.
      select: { id: true, type: true, startTime: true },
    }),
    tx.entry.findFirst({
      where: effectiveEntryWhere({ userId, type: { in: [...pairTypes] }, startTime: { gt: startTime }, ...categoryFilter, ...excludeFilter }),
      orderBy: { startTime: "asc" },
      select: { id: true, type: true, startTime: true },
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

/**
 * Der jüngste Verschluss- und der jüngste Öffnungs-Zeitpunkt je Träger — die Stapel-Fassung des
 * Lock-Zustands, für Listen (Keyholder-Übersicht, Kopfzeile der Detailseite, Benutzerliste).
 *
 * Drei Seiten hatten dieselben zwei `groupBy`-Abfragen wortgleich stehen, und mit dem Riegel-Gate
 * hätte jede von ihnen denselben Filter einzeln nachziehen müssen — genau die Sorte Änderung, die
 * an einer der drei Stellen vergessen wird. Was danach passiert, bleibt bei den Aufrufern: sie
 * lesen „noch nichts vorhanden" unterschiedlich (`undefined` vs. `false`), und das ist Absicht.
 *
 * Zwei `groupBy` statt `distinct`: Prisma schiebt DISTINCT auf SQLite nicht ins SQL (siehe die
 * ausführliche Begründung in `/admin/page.tsx`).
 */
export async function latestKgTimesByUser(userIds: string[]): Promise<{
  lockedAt: Map<string, Date | null>;
  openedAt: Map<string, Date | null>;
}> {
  const [locks, opens] = await Promise.all([
    // Ein Verschluss ohne Riegel ist noch nicht passiert — dieselbe Regel wie in
    // `getLatestKgEntry`, siehe `lockPending.ts`.
    prisma.entry.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, type: "VERSCHLUSS", ...CONFIRMED_LOCK_FILTER },
      _max: { startTime: true },
    }),
    prisma.entry.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, type: "OEFFNEN" },
      _max: { startTime: true },
    }),
  ]);
  return {
    lockedAt: new Map(locks.map((r) => [r.userId, r._max.startTime])),
    openedAt: new Map(opens.map((r) => [r.userId, r._max.startTime])),
  };
}

/**
 * Seit wann ein Verschluss-AUFRUF auf den Riegel wartet — `null`, wenn keiner wartet
 * (docs/riegel-konzept.md).
 *
 * Gemessen wird die ERFASSUNG (`createdAt`), nicht `startTime`: bei einem Riegel-Träger zeigt das
 * Formular gar kein Zeitfeld mehr, dort stünde ein Wert, den niemand gewählt hat.
 *
 * EINE Abfrage für drei Sichten (Keyholder-Dashboard, `get_box_state`, `get_context`) — die
 * Reihenfolge (`createdAt desc`) ist tragend und muss mit der von `commitPendingLock` übereinstimmen.
 *
 * BEWUSST ohne `heimdallEnabled()`-Kurzschluss, obwohl ohne Heimdall keiner entstehen KANN: wird
 * das Geheimnis rotiert, während einer wartet, ist der Zurücknehmen-Knopf des Trägers der einzige
 * Weg heraus (der Schalter der Keyholderin ist dann 404). Er erscheint nur, solange diese Frage
 * beantwortet wird. Die Abfrage ist indexiert (`Entry_userId_type_boltConfirmedAt_idx`).
 */
export async function pendingLockCallAt(userId: string): Promise<Date | null> {
  const pending = await prisma.entry.findFirst({
    where: { userId, ...PENDING_LOCK_FILTER },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return pending?.createdAt ?? null;
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
  /** Das beim Trage-BEGINN aufgenommene Foto, falls die Kategorie eines verlangt. `null` heisst
   *  „kein Foto", nicht „nicht geladen" — die laufende Karte fällt dann aufs Kategorie-Icon zurück.
   *  Bewusst nicht zusätzlich optional: beide Produzenten setzen das Feld, und ein `?` liesse einen
   *  dritten es stillschweigend weglassen. */
  imageUrl: string | null;
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
      imageUrl: true,
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
      imageUrl: e.imageUrl,
    });
  }
  return sessions;
}

/** Returns the active wear session in a category, or null if none.
 *  An "active session" = latest WEAR_BEGIN/WEAR_END entry on a device of this category is WEAR_BEGIN. */
export async function getActiveWearSessionForCategory(
  userId: string,
  categoryId: string,
  client: PrismaTx | typeof prisma = prisma,
): Promise<ActiveWearSession | null> {
  const latest = await client.entry.findFirst({
    where: {
      userId,
      type: { in: ["WEAR_BEGIN", "WEAR_END"] },
      device: { categoryId },
    },
    orderBy: { startTime: "desc" },
    select: {
      type: true,
      startTime: true,
      imageUrl: true,
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
    imageUrl: latest.imageUrl,
  };
}

/**
 * Zählbare Geräte einer Kategorie — ARCHIVIERTE nicht mitgezählt. Die Frage ist „lässt sich hier
 * erfassen?", nicht „gab es hier je ein Gerät?", und dasselbe zeigt die Geräte-Seite von sich aus.
 *
 * Als Fragment und nicht als zwei gleichlautende `where`-Klauseln, weil genau diese Zählung
 * zwischen Dashboard und Verwaltungsseite auseinanderlief: die eine wies eine Kategorie als
 * unfertig aus, während die andere daneben „1 Device" zählte (Issue #49). Ein Produktbegriff mit
 * einer Bearbeitungsstelle, analog `SESSION_ENTRY_SELECT`.
 */
export const COUNTABLE_DEVICES_SELECT = { devices: { where: { archivedAt: null } } } as const;

/**
 * Die Kategorie-Liste eines Kontos — Felder und Reihenfolge, wie sie ÜBERALL erscheint:
 * Kategorien-Seite, `GET /api/categories` und `get_devices` (MCP).
 *
 * Als Fragment aus demselben Grund wie `COUNTABLE_DEVICES_SELECT` direkt darüber: die drei Selects
 * standen Feld für Feld dreimal da, inklusive der Zählungen — und genau diese Zählung ist zwischen
 * zwei der drei schon einmal auseinandergelaufen (Issue #49). Eine neue Spalte oder eine neue Regel
 * an der Kategorie gehört jetzt an EINE Stelle.
 *
 * Die eingebaute Kategorie steht immer zuoberst, danach die eigene Sortierung.
 */
export const CATEGORY_LIST_SELECT = {
  id: true, name: true, slug: true, color: true, icon: true, isBuiltIn: true,
  trackingEnabled: true, requirePhoto: true, allowVorgaben: true, sortOrder: true, createdAt: true,
  _count: { select: { ...COUNTABLE_DEVICES_SELECT, vorgaben: true } },
} as const;

export const CATEGORY_LIST_ORDER = [
  { isBuiltIn: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" },
] as const;

/** Returns non-KG device categories with tracking enabled, ordered by sortOrder then createdAt. */
export async function getNonKgTrackingCategories(userId: string) {
  const rows = await prisma.deviceCategory.findMany({
    where: { userId, isBuiltIn: false, trackingEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    // `deviceCount` entscheidet, ob die Kategorie überhaupt bespielbar ist: ohne Gerät lässt sich
    // darin nichts erfassen, und das Dashboard weist sie als unfertig aus statt sie wie jede andere
    // zu behandeln (Issue #49). Im selben Select, also ohne zusätzliche Abfrage.
    //
    // `isBuiltIn`/`trackingEnabled` stehen hier nur, damit `categoryNeedsDevice()` die ganze Regel
    // beantworten kann statt die Hälfte davon dem Aufrufer zu überlassen. Das `where` oben hält sie
    // ohnehin konstant — die Redundanz kostet nichts und macht die Zeile für sich lesbar.
    select: {
      id: true, name: true, color: true, icon: true, isBuiltIn: true, trackingEnabled: true,
      _count: { select: COUNTABLE_DEVICES_SELECT },
    },
  });
  // Flach benannt wie überall sonst (`categoryRows.ts`, `GET /api/categories`) — `_count.devices`
  // wäre die dritte Schreibweise derselben Zahl.
  return rows.map(({ _count, ...c }) => ({ ...c, deviceCount: _count.devices }));
}

/** Returns the currently active KG TrainingVorgabe for a user, or null.
 *  Filters explicitly to the KG category — legacy rows with categoryId=null
 *  (pre-device-categories) OR rows linked to the built-in KG category.
 *  Other categories (Plug, etc.) are handled by CategoryGoalsToday. */
export async function getActiveVorgabe(userId: string, now: Date) {
  return prisma.trainingVorgabe.findFirst({
    where: {
      userId,
      deletedAt: null, // B-04: ein soft-gelöschtes Ziel ist nicht mehr "aktiv"
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
 *  `activeLockPeriodWhere` baut darauf auf und ergänzt das wirksamAb-Gate für Sub/Enforcement. */
function keyholderLockPeriodWhere(userIdFilter: string | { in: string[] } | undefined, now: Date) {
  return {
    // `undefined` = kein User-Filter, also über ALLE Subs. Prisma lässt ein undefined-Feld weg,
    // statt auf null zu prüfen — genau das ist hier gewollt (siehe `subsWithActiveLockPeriod`).
    userId: userIdFilter,
    art: "SPERRZEIT" as const,
    withdrawnAt: null,
    OR: [{ endsAt: { gt: now } }, { endsAt: null }],
  };
}

/** Shared `where` for currently-active Sperrzeiten (not withdrawn, already triggered, not ended).
 *  Erweitert `keyholderLockPeriodWhere` um das `wirksamAb`-Gate: schliesst geplante (zukünftige)
 *  Sperrzeiten aus — sie dürfen vor ihrem Versand das Öffnen nicht blockieren. */
function activeLockPeriodWhere(userIdFilter: string | { in: string[] } | undefined, now: Date) {
  const { OR, ...base } = keyholderLockPeriodWhere(userIdFilter, now);
  return {
    ...base,
    AND: [
      triggeredWhere(now),
      { OR },
    ],
  };
}

/** Alle Subs, für die JETZT eine Sperrzeit läuft, samt der laufenden Sperrzeit.
 *
 *  Ohne User-Filter, weil der Aufrufer den Sub noch nicht kennt: Das Passwort-Audit hängt an einem
 *  ADMIN-Konto, das Vergehen aber am Sub (`AdminPasswordChange.subUserId`). Bewusst über
 *  `activeLockPeriodWhere`, damit „läuft gerade" hier dieselbe Bedeutung hat wie überall sonst —
 *  inklusive `wirksamAb`-Gate, damit eine erst geplante Sperrzeit kein Vergehen auslöst. */
export async function subsWithActiveLockPeriod(now: Date = new Date()) {
  return prisma.verschlussAnforderung.findMany({
    where: activeLockPeriodWhere(undefined, now),
    select: { id: true, userId: true, endsAt: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Ist diese Direktive TERMINIERT und noch nicht ausgelöst (wirksamAb in der Zukunft)? Die
 *  Zeit-Seite von `activeVerschlussAnforderungWhere`, für bereits geladene Zeilen. */
export function isScheduledDirective(wirksamAb: Date | null, now: Date = new Date()): boolean {
  return wirksamAb !== null && wirksamAb > now;
}

/** Ein User oder eine User-Menge → Prisma-Filter. Geteilt von den Sperrzeit-Listen-Queries. */
function lockPeriodUserFilter(userId: string | { userIds: string[] }) {
  return typeof userId === "string" ? userId : { in: userId.userIds };
}

/**
 * Faltet mehrere gleichzeitig AKTIVE Sperrzeiten zur EFFEKTIVEN Sperre zusammen — der einen, die
 * durchsetzt. Denn mehrere können koexistieren: eine für später geplante Sperrzeit überlebt eine
 * Öffnung (sie ist noch nicht aktiv, `releaseLockPeriodsOnOpen` greift nur aktive), und schliesst
 * der Sub sich danach über eine Verschluss-Anforderung wieder ein, legt `entries/route.ts` eine
 * zweite an. Löst die geplante dann aus, laufen zwei gleichzeitig.
 *
 * Zusammengefaltet wird nach der STRENGSTEN Regel, nicht nach der neuesten Zeile:
 * - `endsAt`: unbefristet schlägt alles, sonst das SPÄTESTE Ende. Nähme man die zuletzt angelegte
 *   (das tat `findFirst` + `orderBy createdAt desc`), liefe die Box beim frühesten Ende auf — die
 *   längere Sperre der Keyholderin wäre stillschweigend verkürzt, physisch.
 * - `cleaningAllowed`: nur wenn JEDE aktive Sperre es erlaubt (dieselbe UND-Regel wie
 *   {@link cleaningBlockReason}, das deshalb eine Liste nimmt).
 * Die übrigen Felder (Nachricht, Gerät, id) stammen aus der durchsetzenden Zeile.
 */
export function foldActiveLockPeriods<T extends { endsAt: Date | null; cleaningAllowed: boolean }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  const enforcing = rows.reduce((a, b) => {
    if (a.endsAt === null) return a;          // indefinite gewinnt
    if (b.endsAt === null) return b;
    return b.endsAt > a.endsAt ? b : a;      // sonst das spätere Ende
  });
  return { ...enforcing, cleaningAllowed: rows.every((r) => r.cleaningAllowed) };
}

/** ALLE aktuell OFFENEN (noch nicht eingereichten) Kontroll-Anforderungen, dringendste Frist zuerst.
 *  Geplante, noch nicht ausgelöste bleiben unsichtbar (`aktiveKontrolleWhere`).
 *
 *  Mehrzahl seit v5.0.1: je ZIEL darf eine laufen (KG und Plug parallel, siehe
 *  `hasActiveKontrolle`). Eine einzelne zurückzugeben hiesse, dem Keyholder-Agenten eine Frist zu
 *  verschweigen, die der Sub gerade hat. Genutzt von `keyholder_dashboard`. */
export async function getOpenKontrollen(userId: string, now: Date = new Date()) {
  return prisma.kontrollAnforderung.findMany({
    where: { userId, entryId: null, withdrawnAt: null, ...aktiveKontrolleWhere(now) },
    orderBy: { deadline: "asc" },
    include: KONTROLLE_TARGET_INCLUDE,
  });
}

/** Offen = weder erfüllt noch zurückgezogen. Ohne Zeit-Gate — wer nur die bereits ausgelösten
 *  will, ergänzt `activeVerschlussAnforderungWhere`. Nimmt einen User ODER eine User-Menge (wie
 *  `getKeyholderLockPeriods`), damit die Admin-Übersicht dasselbe Fragment teilt. */
export function openLockRequestWhere(userId: string | { userIds: string[] }): Prisma.VerschlussAnforderungWhereInput {
  return { userId: lockPeriodUserFilter(userId), art: "ANFORDERUNG", fulfilledAt: null, withdrawnAt: null };
}

/** Dringendste zuerst: frühste Frist gewinnt, bei gleicher Frist die neuere. Seit mehrere
 *  Anforderungen koexistieren dürfen, ist „die eine" immer die dringendste — nicht mehr die
 *  zuletzt angelegte. */
export const LOCK_REQUEST_ORDER: Prisma.VerschlussAnforderungOrderByWithRelationInput[] = [
  { endsAt: "asc" },
  { createdAt: "desc" },
];

/**
 * Die offenen Verschluss-ANFORDERUNGen („schliess dich bis X ein"), dringendste zuerst.
 *
 * Nur die bereits AUSGELÖSTEN: eine erst geplante steht schon in `scheduledDirectives` des
 * Dashboards und stünde sonst doppelt — und der Sub weiss von ihr ohnehin noch nichts.
 *
 * Ohne diese Sicht ist `request_lock` ein Schreib-ohne-Lesen: die Keyholderin kann eine Anforderung
 * stellen, aber nirgends sehen, ob sie noch offen oder schon überfällig ist. Bis zum Wegfall der
 * V1-Schicht beantwortete das ausschliesslich `get_overview.openVerschlussAnforderung`.
 */
/** Die offenen Anforderungen, dringendste zuerst. `now` gesetzt = nur bereits AUSGELÖSTE (Sub-/
 *  Enforcement-Sicht: eine geplante steht schon in `scheduledDirectives` und der Sub weiss noch
 *  nichts von ihr); `now = null` = auch die terminierten (KEYHOLDER-Sicht, damit sie sich gezielt
 *  ändern/zurückziehen lassen — Gegenstück zu {@link getKeyholderLockPeriods}). Dieselbe Query,
 *  ein Zeit-Gate Unterschied. */
export async function getOpenLockRequests(userId: string, now: Date | null = new Date()) {
  return prisma.verschlussAnforderung.findMany({
    where: { ...openLockRequestWhere(userId), ...(now ? triggeredWhere(now) : {}) },
    orderBy: LOCK_REQUEST_ORDER,
    include: { device: { select: { name: true } } },
  });
}

/** Die DRINGENDSTE offene, bereits ausgelöste Anforderung, oder null — für jede Sicht, die eine
 *  einzelne zeigt (Sub-Banner, Admin-Kachel, `keyholder_dashboard.openLockRequest`). */
export async function getOpenLockRequest(userId: string, now: Date = new Date()) {
  return (await getOpenLockRequests(userId, now))[0] ?? null;
}

/** Alle offenen Anforderungen für eine KEYHOLDER-Sicht — inklusive der noch nicht ausgelösten. */
export function getKeyholderLockRequests(userId: string) {
  return getOpenLockRequests(userId, null);
}

/** Die EFFEKTIVE aktive Sperre eines Users, oder null — mehrere gleichzeitig aktive werden über
 *  {@link foldActiveLockPeriods} zur strengsten zusammengefaltet (spätestes Ende, Reinigung nur wenn
 *  alle sie erlauben). Jeder Aufrufer, der „die Sperrzeit" meint — Box-Durchsetzung, Öffnen-Gate,
 *  Dashboard —, bekommt so dieselbe Antwort. */
export async function getActiveLockPeriod(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  const rows = await client.verschlussAnforderung.findMany({
    where: activeLockPeriodWhere(userId, new Date()),
    orderBy: { createdAt: "desc" },
    // device additiv mitladen — für den deviceName der Sperrzeit genutzt, für alle
    // anderen Aufrufer harmlos (lesen nur Skalarfelder).
    include: { device: { select: { name: true } } },
  });
  return foldActiveLockPeriods(rows);
}

/** Die EINE Sperrzeit für eine KEYHOLDER-Sicht (aktiv ODER geplant), oder null. Anders als
 *  {@link getActiveLockPeriod} zeigt sie auch eine erst geplante (wirksamAb > now), damit der
 *  Keyholder sie sehen und stornieren kann.
 *
 *  Läuft eine, gewinnt die AKTIVE — und zwar dieselbe EFFEKTIVE, die die Box durchsetzt
 *  ({@link foldActiveLockPeriods}). Sonst zeigte die Admin-Oberfläche ein anderes Ende an als das,
 *  gegen das der Sub tatsächlich verschlossen ist. Nur wenn KEINE aktiv ist, kommt die neueste
 *  geplante. */
export async function getKeyholderLockPeriod(userId: string, tx?: PrismaTx) {
  const client = tx ?? prisma;
  const now = new Date();
  const rows = await client.verschlussAnforderung.findMany({
    where: keyholderLockPeriodWhere(userId, now),
    orderBy: { createdAt: "desc" },
    include: { device: { select: { name: true } } },
  });
  return foldActiveLockPeriods(rows.filter((s) => !isScheduledDirective(s.wirksamAb, now)))
    ?? rows[0] ?? null;
}

/** Returns all OFFENEN Sperrzeiten (aktiv ODER geplant) für eine KEYHOLDER-Sicht — für EINEN User
 *  oder über mehrere. Bewusst eine LISTE, nicht „die" Sperrzeit: mehrere offene sind normal (siehe
 *  {@link foldActiveLockPeriods}), und der MCP muss die Mehrdeutigkeit sehen können, um sie dem
 *  Keyholder zu melden. Neueste zuerst. */
export async function getKeyholderLockPeriods(userId: string | { userIds: string[] }) {
  return prisma.verschlussAnforderung.findMany({
    where: keyholderLockPeriodWhere(lockPeriodUserFilter(userId), new Date()),
    orderBy: { createdAt: "desc" },
  });
}

/** Returns the open OrgasmusAnforderung whose window has not yet ended (newest first), or null.
 *
 *  Mit `wirksamAb`-Gate ({@link triggeredWhere}), wie bei der Sperrzeit: eine erst geplante Anweisung
 *  ist für den Sub nicht da — sie darf weder im Dashboard stehen noch das Öffnen erlauben, und ein
 *  Orgasmus vor ihrer Auslösung erfüllt sie nicht. */
export async function getActiveOrgasmusAnforderung(userId: string, now: Date = new Date(), tx?: PrismaTx) {
  const client = tx ?? prisma;
  return client.orgasmusAnforderung.findFirst({
    where: { userId, fulfilledAt: null, withdrawnAt: null, endsAt: { gte: now }, ...triggeredWhere(now) },
    orderBy: { createdAt: "desc" },
  });
}

/** Shared base `where` for KEYHOLDER OrgasmusAnforderung-Sichten: offen (nicht erfüllt, nicht
 *  zurückgezogen) — ABER OHNE endsAt-Gate, damit ein bereits abgelaufenes, noch nicht aufgeräumtes
 *  Fenster dem Keyholder weiterhin sichtbar/stornierbar ist. `getActiveOrgasmusAnforderung` (Sub/
 *  Enforcement-Sicht, z.B. Öffnen-Gate) filtert bewusst `endsAt: { gte: now }` — dasselbe Muster wie
 *  `keyholderLockPeriodWhere` vs. `activeLockPeriodWhere`. */
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
 *  auseinanderliefen. `tz` ist die Zone des SUBS: die Fenster sind seine Wanduhrzeit.
 *
 *  **„Leer" meint die GANZE Liste, nicht den heutigen Tag.** Seit die Fenster Wochentage tragen,
 *  gibt es Tage, an denen keines gilt — dort ist die Reinigung VERBOTEN, nicht unbeschränkt.
 *  Andernfalls höbe ausgerechnet das Setzen von Wochentagen die Regel an allen übrigen Tagen auf,
 *  also das Gegenteil dessen, was der Keyholder gerade eingestellt hat. Der Unterschied ist genau
 *  diese `length`-Prüfung; ein Test nagelt ihn fest. */
export function cleaningWindowOpen(cleaningWindows: unknown, at: Date, tz: string): boolean {
  const fenster = parseCleaningWindows(cleaningWindows);
  return fenster.length === 0 || activeCleaningWindowIn(fenster, at, tz) !== null;
}

/**
 * Live-Antwort auf „darf der Sub JETZT öffnen?" — spiegelt die Regel aus strafbuch.ts/oeffnen:
 * keine aktive Sperrzeit ODER ein aktives, erlaubtes Reinigungsfenster ODER ein Orgasmus-
 * Öffnungsfenster. Genutzt fürs Bildersafe-Foto-Freigabe-Gate.
 */
export async function isOpeningPermittedNow(userId: string, now: Date = new Date()): Promise<boolean> {
  const lockPeriod = await getActiveLockPeriod(userId);
  if (!lockPeriod) return true;

  // Erlaubte Reinigungsöffnung — dieselbe Quelle wie Durchsetzung und Strafbuch. Der äussere Guard
  // spart nur die User-Abfrage, wenn die Sperrzeit Reinigung ohnehin verbietet.
  if (lockPeriod.cleaningAllowed) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { cleaningAllowed: true, cleaningWindows: true, timezone: true },
    });
    if (user && cleaningBlockReason(user, [lockPeriod], now) === null) return true;
  }

  // Orgasmus-Öffnungsfenster (oeffnenErlaubt + im Zeitfenster)
  const orgasm = await getActiveOrgasmusAnforderung(userId, now);
  if (orgasm?.openingAllowed && orgasm.beginsAt <= now) return true;

  return false;
}

/**
 * Der Code, der JETZT gilt — die Antwort auf „wo ist mein Schlüsselbox-Code".
 *
 * Zwei Fälle, und beide sind nötig:
 * - **Verschlossen** → nur der Code des LAUFENDEN Verschlusses. Ein älterer gehört zu einer Box,
 *   die längst neu eingestellt ist; ihn hier auszugeben hiesse, dem Träger während einer frischen
 *   Sperrzeit „Öffnen erlaubt" zu melden, weil das Gate für den ALTEN Eintrag längst freigibt.
 * - **Nicht verschlossen** → der jüngste Verschluss mit Code. Der Code wird gebraucht, solange die
 *   Box noch zu ist, und der Aufschluss wird oft erfasst, BEVOR sie offen ist. Wer auch hier nur
 *   den laufenden Verschluss sucht, sperrt den Träger von seinem eigenen Code aus (issue #53).
 *
 * Ob das Foto dann auch ausgeliefert wird, entscheidet allein {@link isCodePhotoRevealed}.
 */
export async function getCurrentSealedCode(userId: string) {
  const [current, sealed] = await Promise.all([
    getLatestKgEntry(userId),
    prisma.entry.findFirst({
      where: { userId, type: "VERSCHLUSS", codeImageUrl: { not: null } },
      orderBy: { startTime: "desc" },
      select: { startTime: true, codeImageUrl: true },
    }),
  ]);
  if (!sealed) return null;
  // Verschlossen, aber der jüngste Code ist ÄLTER als dieser Verschluss → er gehört nicht dazu.
  if (current?.type === "VERSCHLUSS" && sealed.startTime < current.startTime) return null;
  return sealed;
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
 *  haben, reichen ihn durch (spart den Refetch); sonst lädt {@link releaseLockPeriodsOnOpen} ihn. */
export interface CleaningPermissionUser {
  cleaningAllowed: boolean;
  /** JSON-String ODER Array — `parseCleaningWindows` ist tolerant. Leer = nicht zeitgebunden. */
  cleaningWindows: unknown;
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
 * ({@link releaseLockPeriodsOnOpen}) prüft `now`, weil der Riegel in DIESEM Moment auffährt und eine
 * rückdatierte `startTime` die Schranke sonst aushebelte. Das Strafbuch prüft `startTime`, weil es
 * Buch über die Vergangenheit führt.
 *
 * Das Tageskontingent (`cleaningMaxPerDay`) gehört bewusst NICHT hierher: es wird nur erkannt, nicht
 * durchgesetzt — die Keyholderin entscheidet über die Ahndung.
 */
export function cleaningBlockReason(
  user: CleaningPermissionUser,
  activeLockPeriods: { cleaningAllowed: boolean }[],
  at: Date,
): CleaningBlockReason | null {
  if (!user.cleaningAllowed) return "userNotAllowed";
  if (!activeLockPeriods.every((s) => s.cleaningAllowed)) return "lockPeriodForbids";
  if (!cleaningWindowOpen(user.cleaningWindows, at, user.timezone)) return "outsideWindow";
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
 * {@link releaseLockPeriodsOnOpen} mit einem eigenen `if (!lockPeriod)`/`if (activeLockPeriods.length
 * === 0)`-Guard vor jedem Aufruf schließen) — hier also genauso, statt sie ein drittes Mal woanders
 * zu wiederholen. Ebenso unterscheidet `cleaningBlockReason`s `null`-Rückgabe NICHT zwischen "im
 * konfigurierten Fenster" und "gar keine Fenster konfiguriert" (beides macht `cleaningWindowOpen`
 * zu `true`) — für `windowsBinding` ist das aber ein Unterschied: ohne konfigurierte Fenster gibt es
 * nichts, das binden könnte, das wird hier zusätzlich unterschieden.
 */
export function cleaningWindowBindingStatus(
  user: CleaningPermissionUser,
  lockPeriod: { cleaningAllowed: boolean } | null,
  at: Date,
): { windowsBinding: boolean; windowsBindingReason: WindowsBindingReason; openingAllowedNow: boolean } {
  if (!lockPeriod) {
    return { windowsBinding: false, windowsBindingReason: "no-active-lock-period", openingAllowedNow: true };
  }
  const reason = cleaningBlockReason(user, [lockPeriod], at);
  if (reason === "userNotAllowed") return { windowsBinding: false, windowsBindingReason: "user-not-allowed", openingAllowedNow: false };
  if (reason === "lockPeriodForbids") return { windowsBinding: false, windowsBindingReason: "lock-period-forbids", openingAllowedNow: false };
  if (parseCleaningWindows(user.cleaningWindows).length === 0) {
    // Keine Fenster konfiguriert: cleaningWindowOpen liest das als "immer offen" — korrekt für
    // openingAllowedNow, aber windows binden hier nichts, unabhängig vom Ergebnis.
    //
    // Bewusst die GANZE Liste und nicht „gilt heute eines": ein Tag, an dem kein Fenster gilt, ist
    // ein geschlossener Tag — die Fenster binden dort also gerade besonders (siehe
    // `cleaningWindowOpen`). Auf „heute" umgestellt meldete diese Zeile für den freien Tag
    // „keine Fenster konfiguriert" und damit `openingAllowedNow: true`.
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
  activeLockPeriods: { cleaningAllowed: boolean }[],
): boolean {
  return oeffnenGrund === "REINIGUNG" && cleaningBlockReason(user, activeLockPeriods, now) === null;
}

/**
 * Releases active SPERRZEIT periods when a user opens their device.
 * The release is skipped (Sperrzeit kept active) for a permitted cleaning opening — see
 * {@link isAllowedCleaningOpen} — and während eines laufenden Gesundheits-Halts. Must be called
 * inside a transaction.
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
export async function releaseLockPeriodsOnOpen(
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
  const activeLockPeriods = await tx.verschlussAnforderung.findMany({
    where: activeLockPeriodWhere(userId, now),
    select: { id: true, cleaningAllowed: true },
  });
  if (activeLockPeriods.length === 0) return false;

  const effectiveUser = user ?? await tx.user.findUnique({
    where: { id: userId },
    select: { cleaningAllowed: true, cleaningWindows: true, timezone: true },
  }) ?? { cleaningAllowed: false, cleaningWindows: null, timezone: APP_TZ };

  if (isAllowedCleaningOpen(oeffnenGrund, now, effectiveUser, activeLockPeriods)) return false;

  // Gesundheits-Halt: die Öffnung ist gedeckt, die Sperrzeit bleibt stehen — und weil der Rückgabewert
  // zugleich das Box-Kommando steuert (`boxCommandForEntry`), geht der Riegel dabei auf. Genau das
  // unterscheidet den Halt vom blossen Verzicht auf eine Strafe: dem Träger nur nachzusehen, dass er
  // öffnet, während der Riegel zubleibt, hilft ihm im Spital nichts.
  //
  // Die Sperre wird ausgesetzt, nicht aufgehoben: nach der Pause läuft sie weiter, statt still
  // verschwunden zu sein. Dieselbe Bauform wie bei der erlaubten Reinigungsöffnung.
  //
  // Gefragt wird nach JETZT, während das Strafbuch nach der TATZEIT fragt (`applyHealthHoldPause`).
  // Die Asymmetrie ist gewollt und folgt aus dem Rückgabewert: er steuert den Riegel, und der öffnet
  // in der Gegenwart. Eine von der Keyholderin nachgetragene Öffnung, die in eine vergangene Pause
  // fällt, bricht die Sperrzeit also — bleibt aber straffrei.
  if (await isHealthHoldActive(userId, tx)) return false;

  await tx.verschlussAnforderung.updateMany({
    where: { id: { in: activeLockPeriods.map((s) => s.id) } },
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
export async function getInterruptedLockPeriod(userId: string, now: Date) {
  // Dieselbe „SPERRZEIT, deren Ende noch nicht verstrichen ist"-Definition wie die aktive Sicht —
  // nur eben zurückgezogen statt laufend. `withdrawnAt: null` fällt weg, `endedReason` tritt hinzu.
  const { withdrawnAt: _stillRunning, ...notYetElapsed } = keyholderLockPeriodWhere(userId, now);
  return prisma.verschlussAnforderung.findFirst({
    where: { ...notYetElapsed, endedReason: LOCK_ENDED_REASON.opening },
    orderBy: { withdrawnAt: "desc" },
    select: { endsAt: true, withdrawnAt: true, message: true },
  });
}

/** Select-Shape jedes Eintrags, den das Session-Modell paart (`buildWearSessions`, `buildPairs`).
 *  `device.id` ist PFLICHT: Trage-Sessions werden je GERÄT gepaart — fehlt die id, fällt jeder
 *  WEAR-Eintrag als gerätelos heraus und die Kategorie zeigt lautlos 0 Stunden. */
export const SESSION_ENTRY_SELECT = {
  id: true,
  type: true,
  startTime: true,
  // Pflicht, weil `filterAndSortPairEntries` daran den schwebenden Verschluss aussortiert — ohne
  // die Spalte kompiliert das Paaren gar nicht erst (siehe `lockPending.ts`).
  boltConfirmedAt: true,
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
