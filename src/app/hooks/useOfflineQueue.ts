"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addToQueue, getQueue, clearQueueItem, getQueueCount } from "@/lib/idb";
import { fetchWithTimeout } from "@/lib/apiClient";
import { registerBackgroundSync } from "@/lib/swMessages";
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
    // Der Wächter wird SYNCHRON gesetzt, unmittelbar nach der Prüfung. Stünde zwischen beiden ein
    // `await` (etwa das Nachsehen in der Warteschlange), kämen zwei dicht aufeinanderfolgende
    // `online`-Ereignisse beide durch — und schickten dieselben Einträge zweimal an den Server.
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      // Nachsehen vor dem Anzeige-Zustand: jedes `online`-Ereignis ruft das hier — im Zug beliebig
      // oft —, und bei leerer Warteschlange kostete es zwei Renders für nichts.
      const queue = await getQueue();
      if (queue.length === 0) return;

      setIsSyncing(true);
      toast.info(t("syncing"));

      let synced = 0;
      let failed = 0;

      for (const item of queue) {
        try {
          // Mit Zeitlimit, sonst wedgt eine einzige hängende Anfrage die ganze Warteschlange: das
          // `await` käme nie zurück, `finally` liefe nie, `syncingRef` bliebe für die Lebensdauer
          // der Seite auf `true` — und jeder weitere Versuch stiege oben sofort wieder aus.
          const res = await fetchWithTimeout(item.url, {
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

      // Frisch aus der Datenbank, NICHT `queue.length - synced`: während des Abarbeitens kann der
      // Nutzer weiter erfassen. Die Rechnung übersähe das Neue und könnte auf 0 fallen, während
      // noch etwas wartet — der Hinweis verschwände über wartenden Einträgen.
      setPendingCount(await getQueueCount());

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
      // `onLine === false` heisst zuverlässig „kein Netz" — dann gar nicht erst acht Sekunden
      // warten. Unzuverlässig ist nur das `true`: bei einem Balken Empfang steht es, während nichts
      // durchkommt. Deshalb entscheidet es hier nur noch über die Abkürzung, nicht mehr darüber, ob
      // eingereiht wird — genau diese Verwechslung liess die Warteschlange unterwegs schlafen.
      if (navigator.onLine) {
        try {
          return await fetchWithTimeout(url, init);
        } catch {
          // Zeitlimit abgelaufen oder Netzwerkfehler trotz `onLine` — einreihen statt verlieren.
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

      // Anmelden und weitergehen — die Erfolgsmeldung darf nicht daran hängen. Warum das eine harte
      // Regel ist und nicht nur eine Vorliebe, steht bei `registerBackgroundSync`.
      registerBackgroundSync("offline-queue");

      toast.info(t("savedOffline"));

      // Return null to indicate queued (caller should handle this)
      return null;
    },
    [toast, t]
  );

  return { offlineFetch, pendingCount, isSyncing, drainQueue };
}
