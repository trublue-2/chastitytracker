import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { bildersafeEnabled } from "@/lib/constants";
import { isPortalInstance } from "@/lib/auth/portalInstance";
import { telegramLinkAvailable } from "@/lib/messages/telegram";
import { buildKgWearPairs, groupByUser, wearingHoursFromPairs } from "@/lib/utils";
import { currentVisionConfig, visionSpec } from "@/lib/vision/config";

/**
 * Die Deployment-Zählung (Census, docs/update-check.md): was eine Instanz beim stündlichen
 * Update-Check an den Projekt-Collector meldet.
 *
 * Seit Issue #15 mehr als Version + Instanz-ID: woher das Image stammt, wie die Instanz genutzt
 * wird (exakte Zahlen) und welche Funktionen eingeschaltet sind. Bewusst NICHT dabei: Hostname,
 * Benutzernamen, E-Mails, Inhalte. Abschaltbar mit `DISABLE_UPDATE_CENSUS=true`.
 */

/** Das Repo, dessen Workflow das offizielle Image baut. */
export const OFFICIAL_IMAGE_REPO = "trublue-2/chastitytracker";

/** Schema der Census-Nutzlast. Wer ein Feld umdeutet oder streicht, zählt hoch — der Collector
 *  liest alte und neue Instanzen nebeneinander. */
export const CENSUS_STATS_VERSION = 1;

export type ImageOrigin =
  | { origin: "official"; revision: string | null }
  | { origin: "fork"; repo: string; revision: string | null }
  | { origin: "custom" };

const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

/**
 * Woher das laufende Image stammt — aus den Build-Argumenten, die `docker.yml` setzt
 * (`IMAGE_SOURCE_REPO` = `github.repository`, `IMAGE_REVISION` = `github.sha`). Gebaut vom eigenen
 * Repo: `official`; von einem anderen Repo per GitHub Actions: `fork` samt Repo-Name (auf GitHub
 * ohnehin öffentlich); ohne die Werte (lokales `docker build`, `npm start`): `custom`.
 *
 * Ein Hinweis, kein Nachweis — wer will, setzt die Werte von Hand.
 */
export function imageOrigin(env: Record<string, string | undefined> = process.env): ImageOrigin {
  const repo = env.IMAGE_SOURCE_REPO?.trim();
  const rev = env.IMAGE_REVISION?.trim();
  const revision = rev && /^[0-9a-f]{7,40}$/i.test(rev) ? rev.slice(0, 12).toLowerCase() : null;
  if (!repo || !REPO_RE.test(repo)) return { origin: "custom" };
  if (repo.toLowerCase() === OFFICIAL_IMAGE_REPO) return { origin: "official", revision };
  return { origin: "fork", repo, revision };
}

/** Die Herkunft als eine Zeile: `official`, `fork:<owner/repo>` oder `custom` — für Feedback und
 *  das vorausgefüllte GitHub-Formular, wo ein Objekt nicht hinpasst. */
export function imageOriginLabel(o: ImageOrigin): string {
  return o.origin === "fork" ? `fork:${o.repo}` : o.origin;
}

/** Ist der Census an? Aus mit `DISABLE_UPDATE_CENSUS=true` oder einer eigenen Changelog-Quelle
 *  (`UPSTREAM_CHANGELOG_URL`) — dieselbe Regel, nach der `/api/upstream-changelog` seine Quelle wählt. */
export function censusEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !env.UPSTREAM_CHANGELOG_URL && env.DISABLE_UPDATE_CENSUS !== "true";
}

const PUBLIC_ID_KEY = "censusPublicId";
let publicIdMemo: Promise<string> | null = null;

/**
 * Die ÖFFENTLICHE Kennung der Instanz: zufällig, einmal erzeugt und in `AppMeta` gespeichert. Sie
 * steht im vorausgefüllten GitHub-Issue und in den Einstellungen und reist in der Census-Nutzlast mit,
 * damit der Collector ein Issue seiner Instanz zuordnen kann.
 *
 * **Bewusst NICHT die Census-ID.** Die folgt aus dem `NEXTAUTH_SECRET`; öffentlich in einem Issue
 * liesse sie sich bei einem schwachen Secret offline durchprobieren — und mit dem Secret signiert man
 * Sitzungen. Die Census-ID geht deshalb nur an den Collector und das Feedback-Postfach, nie in eine
 * öffentliche URL.
 */
export function censusPublicId(): Promise<string> {
  publicIdMemo ??= (async () => {
    const existing = await prisma.appMeta.findUnique({ where: { key: PUBLIC_ID_KEY } });
    if (existing) return existing.value;
    // `upsert` mit leerem Update: zwei gleichzeitige erste Aufrufe einigen sich auf EINE Zeile.
    const row = await prisma.appMeta.upsert({
      where: { key: PUBLIC_ID_KEY },
      create: { key: PUBLIC_ID_KEY, value: crypto.randomBytes(8).toString("hex") },
      update: {},
    });
    return row.value;
  })().catch((e) => {
    publicIdMemo = null;
    throw e;
  });
  return publicIdMemo;
}

/** Nur für Tests. */
export function clearCensusPublicIdMemo(): void {
  publicIdMemo = null;
}

/** Was eine Instanz ÖFFENTLICH von sich zeigt (GitHub-Link, Einstellungen): die zufällige Kennung und
 *  die Herkunft als Zeile. Bei abgeschaltetem Census ohne Kennung — wer die Zählung abschaltet, soll
 *  über ein Issue nicht mehr zuzuordnen sein. */
export async function publicIdentity(env: Record<string, string | undefined> = process.env): Promise<{ publicId: string | null; image: string }> {
  return {
    publicId: censusEnabled(env) ? await censusPublicId().catch(() => null) : null,
    image: imageOriginLabel(imageOrigin(env)),
  };
}

/** Die Instanz-ID: die ersten 16 Zeichen eines SHA-256 des eigenen `NEXTAUTH_SECRET` — stabil je
 *  Instanz, nicht umkehrbar. `null` ohne Secret. */
export function censusInstanceId(secret: string | undefined = process.env.NEXTAUTH_SECRET): string | null {
  return secret ? crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16) : null;
}

export interface CensusStats {
  v: number;
  /** Die öffentliche Kennung (`censusPublicId`) — verbindet ein GitHub-Issue mit dieser Zeile. */
  publicId: string;
  /** Wie die Instanz betrieben wird: über das Portal (auf trublues Server) oder selbst gehostet. */
  portal: boolean;
  image: ImageOrigin;
  /** `process.arch` — `arm64` sind meist Raspberry Pis. */
  arch: string;
  /** Konten insgesamt. */
  users: number;
  /** Konten mit mindestens einem Eintrag — auf einer Ein-Personen-Instanz ist der Träger oft Admin. */
  wearers: number;
  /** Konten mit einem neuen Eintrag in den letzten 7 Tagen. */
  active7d: number;
  /** Gerade verschlossen (KG). */
  lockedNow: number;
  /** Konten, die mindestens einem Sub als Keyholder zugeordnet sind. */
  keyholders: number;
  /** Gesammelte KG-Tragestunden aller Konten, gerundet. */
  wearHours: number;
  /** Konten je Sprache. */
  locales: Record<string, number>;
  features: {
    /** Gekoppelte Boxen je Art (`heimdall`, `lockmebox`). */
    boxes: Record<string, number>;
    /** Foto-Prüfung: aus, auf eigenem Server, oder bei einem externen Anbieter. */
    vision: "off" | "local" | "external";
    mcp: boolean;
    bildersafe: boolean;
    telegram: boolean;
    /** Konten mit freigeschaltetem Gewichtstracking. */
    weight: number;
  };
}

const DAY_MS = 86_400_000;

/** Sammelt die Census-Nutzlast. Wirft bei Datenbankfehlern — der Aufrufer schickt dann ohne. */
export async function collectCensusStats(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<CensusStats> {
  const [publicId, users, wearerRows, activeRows, keyholderRows, localeRows, boxRows, weight, kgEntries, vision] = await Promise.all([
    censusPublicId(),
    prisma.user.count(),
    prisma.entry.groupBy({ by: ["userId"] }),
    prisma.entry.groupBy({ by: ["userId"], where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    prisma.adminUserRelationship.groupBy({ by: ["adminId"] }),
    prisma.user.groupBy({ by: ["locale"], _count: { _all: true } }),
    prisma.boxStatus.groupBy({ by: ["kind"], _count: { _all: true } }),
    prisma.user.count({ where: { weightTrackingEnabled: true } }),
    prisma.entry.findMany({
      where: { type: { in: ["VERSCHLUSS", "OEFFNEN"] } },
      select: { userId: true, type: true, startTime: true, boltConfirmedAt: true, openAwaitsBolt: true },
    }),
    currentVisionConfig(now),
  ]);

  let wearHours = 0;
  let lockedNow = 0;
  for (const entries of groupByUser(kgEntries).values()) {
    const pairs = buildKgWearPairs(entries, now);
    wearHours += wearingHoursFromPairs(pairs, new Date(0), now);
    // Ein offenes Paar endet bei `now` — das ist der laufende Verschluss.
    if (pairs.at(-1)?.end.getTime() === now.getTime()) lockedNow++;
  }

  return {
    v: CENSUS_STATS_VERSION,
    publicId,
    portal: isPortalInstance(env),
    image: imageOrigin(env),
    arch: process.arch,
    users,
    wearers: wearerRows.length,
    active7d: activeRows.length,
    lockedNow,
    keyholders: keyholderRows.length,
    wearHours: Math.round(wearHours),
    locales: Object.fromEntries(localeRows.map((r) => [r.locale, r._count._all])),
    features: {
      boxes: Object.fromEntries(boxRows.map((r) => [r.kind, r._count._all])),
      vision: vision.provider === "off" ? "off" : visionSpec(vision).external ? "external" : "local",
      mcp: env.ENABLE_MCP === "true",
      bildersafe: bildersafeEnabled(),
      // Dieselbe Frage wie die Einstellungen: lässt sich ein Konto verbinden?
      telegram: telegramLinkAvailable(),
      weight,
    },
  };
}

/**
 * Die Census-Header eines Update-Checks: Version, Instanz-ID und — soweit sie sich sammeln lässt —
 * die Nutzlast als kompaktes JSON. Scheitert das Sammeln, geht der Ping ohne sie: der Update-Check
 * darf daran nie hängen.
 */
export async function censusHeaders(version: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "X-Instance-Version": version };
  const id = censusInstanceId();
  if (id) headers["X-Instance-Id"] = id;
  const stats = await dailyStats();
  if (stats) headers["X-Instance-Stats"] = stats;
  return headers;
}

/**
 * Die Nutzlast höchstens einmal je UTC-Tag sammeln — der Collector hält ohnehin nur eine Zeile je
 * Instanz und Tag, und das Sammeln liest alle Verschlüsse aller Konten. Gleichzeitige Anfragen teilen
 * sich denselben Lauf. Ein Fehlschlag wird nicht gemerkt: der nächste Update-Check versucht es neu.
 */
let statsMemo: { day: string; json: Promise<string | null> } | null = null;

function dailyStats(): Promise<string | null> {
  const day = new Date().toISOString().slice(0, 10);
  if (statsMemo?.day === day) return statsMemo.json;
  const memo = {
    day,
    json: collectCensusStats().then(
      (s) => JSON.stringify(s),
      (e: Error) => {
        console.error("[census] stats", e.message);
        if (statsMemo === memo) statsMemo = null;
        return null;
      },
    ),
  };
  statsMemo = memo;
  return memo.json;
}

/** Nur für Tests: den Tages-Speicher leeren. */
export function clearCensusStatsMemo(): void {
  statsMemo = null;
}
