/** Client-side fetcher for the upstream changelog.json from the main branch.
 *  Used to detect available updates and show release notes the local instance
 *  hasn't deployed yet. */

const RAW_URL = "https://raw.githubusercontent.com/trublue-2/chastitytracker/main/src/data/changelog.json";
const CACHE_KEY = "upstream-changelog-v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

export interface UpstreamRelease {
  version: string;
  date: string;
  changes: { type: string; text: string }[];
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
    const res = await fetch(RAW_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json() as UpstreamRelease[];
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() } satisfies CachedPayload));
    } catch { /* quota / private mode — ignore */ }
    return data;
  } catch {
    return null;
  }
}
