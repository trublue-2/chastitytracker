import { NextResponse } from "next/server";
import crypto from "crypto";
import pkg from "../../../../package.json";

const GITHUB_RAW =
  "https://raw.githubusercontent.com/trublue-2/chastitytracker/main/src/data/changelog.json";
const DEFAULT_COLLECTOR = "https://update.chastitytracker.ch/api/changelog";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Module-level in-memory cache — shared across requests, survives hot-reload in prod.
// It also bounds the census to at most one ping per instance per hour.
let cached: { data: unknown; fetchedAt: number } | null = null;

/**
 * Chooses where to fetch the changelog from, and whether this fetch doubles as a census.
 * - Default: the project collector (`update.chastitytracker.ch/api/changelog`). It returns the same
 *   changelog AND counts the ping — an anonymous deployment census that also covers self-hosted
 *   instances (see docs/update-check.md).
 * - `DISABLE_UPDATE_CENSUS=true` → fetch GitHub raw directly, send nothing. Update check keeps working.
 * - `UPSTREAM_CHANGELOG_URL=<url>` → fetch from there (advanced/self-mirror), no census headers.
 */
function resolveSource(): { url: string; census: boolean } {
  const override = process.env.UPSTREAM_CHANGELOG_URL;
  if (override) return { url: override, census: false };
  if (process.env.DISABLE_UPDATE_CENSUS === "true") return { url: GITHUB_RAW, census: false };
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

  const { url, census } = resolveSource();

  // Primary source first; on any failure fall back to GitHub raw so the update check never breaks.
  let data = await fetchChangelog(url, census ? censusHeaders(pkg.version) : {});
  if (!data && url !== GITHUB_RAW) {
    data = await fetchChangelog(GITHUB_RAW, {});
  }
  if (!data) {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }

  cached = { data, fetchedAt: now };
  return NextResponse.json(data);
}
