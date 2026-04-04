"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addToQueue, getQueue, clearQueueItem, getQueueCount } from "@/lib/idb";
import useToast from "@/app/hooks/useToast";
import { useTranslations } from "next-intl";

/**
 * useOfflineQueue — queues mutations when offline and syncs on reconnect.
 *
 * Usage:
 *   const { offlineFetch, pendingCount, isSyncing } = useOfflineQueue();
 *   // Use offlineFetch instead of fetch for mutations
 *   const res = await offlineFetch("/api/entries", { method: "POST", body: JSON.stringify(data) });
 */
export default function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);
  const toast = useToast();
  const t = useTranslations("offline");

  // ── Load initial queue count ──
  useEffect(() => {
    getQueueCount()
      .then(setPendingCount)
      .catch(() => {});
  }, []);

  // ── Drain queue (FIFO) ──
  const drainQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const queue = await getQueue();
      if (queue.length === 0) return;

      toast.info(t("syncing"));

      let synced = 0;
      let failed = 0;

      for (const item of queue) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: item.body,
          });

          if (res.ok || res.status === 400 || res.status === 409) {
            // Success or client error (don't retry bad data)
            await clearQueueItem(item.id!);
            synced++;
          } else if (res.status >= 500) {
            // Server error — stop draining, retry later
            failed++;
            break;
          }
        } catch {
          // Network error — stop draining
          failed++;
          break;
        }
      }

      const remaining = await getQueueCount();
      setPendingCount(remaining);

      if (synced > 0) {
        toast.success(t("synced"));
      }
      if (failed > 0) {
        toast.warning(t("syncFailed"));
      }
    } catch {
      toast.error(t("syncFailed"));
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [toast, t]);

  // ── Listen for online event → drain queue ──
  useEffect(() => {
    const onOnline = () => {
      drainQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [drainQueue]);

  // ── Try to drain on mount (in case app was restarted while online) ──
  useEffect(() => {
    if (navigator.onLine) {
      getQueueCount().then((count) => {
        if (count > 0) drainQueue();
      }).catch(() => {});
    }
  // Only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Offline-aware fetch ──
  const offlineFetch = useCallback(
    async (url: string, init: RequestInit): Promise<Response | null> => {
      // Online: try normal fetch
      if (navigator.onLine) {
        try {
          const res = await fetch(url, init);
          return res;
        } catch {
          // Network error despite onLine — fall through to queue
        }
      }

      // Offline or network error: queue the mutation
      const method = init.method ?? "POST";
      const body = typeof init.body === "string" ? init.body : null;

      await addToQueue({
        method,
        url,
        body,
        createdAt: new Date().toISOString(),
      });

      const count = await getQueueCount();
      setPendingCount(count);

      toast.info(t("savedOffline"));

      // Return null to indicate queued (caller should handle this)
      return null;
    },
    [toast, t]
  );

  return { offlineFetch, pendingCount, isSyncing, drainQueue };
}
