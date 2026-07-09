/** Client-side fetcher for the upstream changelog.
 *  Calls the local proxy endpoint /api/upstream-changelog which fetches from
 *  GitHub server-side — avoids a connect-src CSP violation when fetching
 *  raw.githubusercontent.com directly from the browser. */

import type { ChangelogText } from "@/lib/changelogText";

const PROXY_URL = "/api/upstream-changelog";
const CACHE_KEY = "upstream-changelog-v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export interface UpstreamRelease {
  version: string;
  date: string;
  changes: { type: string; text: ChangelogText }[];
}

interface CachedPayload {
  data: UpstreamRelease[];
  fetchedAt: number;
}

export async function fetchUpstreamChangelog(): Promise<UpstreamRelease[] | null> {
  if (typeof window === "undefined") return null;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, fetchedAt } = JSON.parse(cached) as CachedPayload;
      if (Date.now() - fetchedAt < CACHE_TTL_MS) return data;
    }
  } catch { /* fallthrough on parse error */ }

  try {
    const res = await fetch(PROXY_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw)) return null;
    const data = raw as UpstreamRelease[];
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() } satisfies CachedPayload));
    } catch { /* quota / private mode — ignore */ }
    return data;
  } catch {
    return null;
  }
}
