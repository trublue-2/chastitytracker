import { NextResponse } from "next/server";
import crypto from "crypto";
import pkg from "../../../../package.json";

// Gelesen wird der Git-Tag `release`, NICHT main: `release` wandert nur, wenn ein Image als
// :latest freigegeben wird. Von main gelesen würde der Update-Hinweis Versionen ankündigen,
// für die es noch kein Image gibt (main läuft dem Release voraus — die Portal-Instanzen
// fahren :portal, Self-Hoster :latest).
// Die `refs/tags/`-Form ist bewusst ausgeschrieben: die Kurzform wäre mehrdeutig, sobald es
// einmal einen Branch namens `release` gibt.
const RELEASE_RAW =
  "https://raw.githubusercontent.com/trublue-2/chastitytracker/refs/tags/release/src/data/changelog.json";
const DEFAULT_COLLECTOR = "https://update.chastitytracker.ch/api/changelog";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Failures are cached too, for a much shorter window. Without this, an unreachable source means
// two outbound fetches with a 10 s timeout each — on EVERY request, since the update indicator
// mounts on every page load. Bounds the retry to once per window instead.
const FAILURE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level in-memory cache — shared across requests, survives hot-reload in prod.
// While the source is reachable it also bounds the census to one ping per instance per hour;
// during an outage the retry window is FAILURE_TTL_MS, so a failing source is contacted at most
// once per 5 min (no ping is recorded then — the request never reaches the collector).
let cached: { data: unknown; fetchedAt: number } | null = null;
let failedAt = 0;

/**
 * Chooses where to fetch the changelog from, and whether this fetch doubles as a census.
 * - Default: the project collector (`update.chastitytracker.ch/api/changelog`). It returns the same
 *   changelog AND counts the ping — an anonymous deployment census that also covers self-hosted
 *   instances (see docs/update-check.md).
 * - `DISABLE_UPDATE_CENSUS=true` → fetch the release ref on GitHub raw directly, send nothing.
 *   Update check keeps working.
 * - `UPSTREAM_CHANGELOG_URL=<url>` → fetch from there (advanced/self-mirror), no census headers.
 */
function resolveSource(): { url: string; census: boolean } {
  const override = process.env.UPSTREAM_CHANGELOG_URL;
  if (override) return { url: override, census: false };
  if (process.env.DISABLE_UPDATE_CENSUS === "true") return { url: RELEASE_RAW, census: false };
  return { url: DEFAULT_COLLECTOR, census: true };
}

/**
 * Census headers: the app version plus a truncated SHA-256 of this instance's own NEXTAUTH_SECRET.
 * The hash is stable per instance but non-reversible and non-identifying — it lets the collector
 * dedupe distinct instances without learning anything about them. No user data, no hostname.
 */
function censusHeaders(version: string): Record<string, string> {
  const headers: Record<string, string> = { "X-Instance-Version": version };
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    headers["X-Instance-Id"] = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 16);
  }
  return headers;
}

async function fetchChangelog(url: string, headers: Record<string, string>): Promise<unknown[] | null> {
  try {
    const res = await fetch(url, { cache: "no-store", headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/upstream-changelog
 * Server-side proxy for the changelog (fetching from the browser violates connect-src CSP).
 * Caches the response for 1 h. Public route — changelog data is public anyway.
 */
export async function GET() {
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }
  if (now - failedAt < FAILURE_TTL_MS) {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  const { url, census } = resolveSource();

  // Primary source first; on any failure fall back to the release ref on GitHub raw so the update
  // check never breaks when the collector is down.
  let data = await fetchChangelog(url, census ? censusHeaders(pkg.version) : {});
  if (!data && url !== RELEASE_RAW) {
    data = await fetchChangelog(RELEASE_RAW, {});
  }
  if (!data) {
    failedAt = now;
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  cached = { data, fetchedAt: now };
  return NextResponse.json(data);
}
