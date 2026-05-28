import { NextResponse } from "next/server";

const RAW_URL =
  "https://raw.githubusercontent.com/trublue-2/chastitytracker/main/src/data/changelog.json";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Module-level in-memory cache — shared across requests, survives hot-reload in prod.
let cached: { data: unknown; fetchedAt: number } | null = null;

/**
 * GET /api/upstream-changelog
 * Server-side proxy for the upstream changelog.json.
 * Fetching from the browser violates connect-src 'self' CSP — the server is exempt.
 * Caches the GitHub response for 1 h to avoid hammering the API.
 * Public route (no session required) — changelog data is public on GitHub anyway.
 */
export async function GET() {
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(RAW_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
    }
    cached = { data, fetchedAt: now };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
