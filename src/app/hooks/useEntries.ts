"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllEntries, putEntries, type CachedEntry } from "@/lib/idb";

/**
 * useEntries — offline-first entry cache hook.
 *
 * On mount: reads IDB for instant render, then fetches from network.
 * Listens for SW_ENTRIES_UPDATED messages from the service worker
 * (stale-while-revalidate background updates).
 *
 * @param initialEntries - Server-rendered entries (SSR hydration seed).
 *   If provided, seeds IDB on first mount and is used as initial state.
 */
export default function useEntries(initialEntries?: CachedEntry[]) {
  const [entries, setEntries] = useState<CachedEntry[]>(initialEntries ?? []);
  const [isStale, setIsStale] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const seededRef = useRef(false);

  // ── Seed IDB from SSR data on first mount ──
  useEffect(() => {
    if (initialEntries && initialEntries.length > 0 && !seededRef.current) {
      seededRef.current = true;
      putEntries(initialEntries).catch(() => {});
    }
  }, [initialEntries]);

  // ── Load from IDB (instant) → then network (fresh) ──
  useEffect(() => {
    let cancelled = false;

    async function load() {
      // 1. Try IDB first (instant render)
      if (!initialEntries || initialEntries.length === 0) {
        try {
          const cached = await getAllEntries();
          if (!cancelled && cached.length > 0) {
            setEntries(cached);
            setIsStale(true);
          }
        } catch {
          // IDB unavailable — continue to network
        }
      }

      // 2. Fetch from network
      try {
        const res = await fetch("/api/entries", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const fresh: CachedEntry[] = await res.json();
          setEntries(fresh);
          setIsStale(false);
          putEntries(fresh).catch(() => {});
        }
      } catch {
        // Network unavailable — IDB data remains (stale)
        if (!cancelled) setIsStale(true);
      }
    }

    load();
    return () => { cancelled = true; };
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen for SW background updates (stale-while-revalidate) ──
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type === "SW_ENTRIES_UPDATED" && Array.isArray(event.data.entries)) {
        setEntries(event.data.entries);
        setIsStale(false);
        putEntries(event.data.entries).catch(() => {});
      }
    }

    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  // ── Online/offline tracking ──
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Manual refresh (for pull-to-refresh, etc.) ──
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/entries", { cache: "no-store" });
      if (res.ok) {
        const fresh: CachedEntry[] = await res.json();
        setEntries(fresh);
        setIsStale(false);
        putEntries(fresh).catch(() => {});
      }
    } catch {
      // Refresh failed — keep current data
    }
  }, []);

  return { entries, isStale, isOnline, refresh };
}
