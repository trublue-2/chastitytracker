"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addToQueue, getQueue, clearQueueItem, getQueueCount, updateQueueItemBody,
  getBlob, deleteBlob, isOfflineBlobUrl, parseOfflineBlobToken,
  type QueuedMutation,
} from "@/lib/idb";
import { fetchWithTimeout, uploadPhoto } from "@/lib/apiClient";
import { registerBackgroundSync } from "@/lib/swMessages";
import useToast from "@/app/hooks/useToast";
import { useTranslations } from "next-intl";

/**
 * useOfflineQueue — queues mutations when offline and syncs on reconnect.
 *
 * **Regel: was hier durchgeht, MUSS mehrfach zustellbar sein.** Eine eingereihte Anfrage kann den
 * Server zweimal erreichen — einmal vor dem Zeitlimit, einmal beim Abarbeiten —, und die
 * Warteschlange kann das nicht wissen. Heute erfüllen das beide Ziele auf verschiedene Weise:
 * `POST /api/entries` über den Stempel aus `entryRequest()`, `PATCH /api/tasks/[id]` von Natur aus
 * (`completeTask` ist idempotent, siehe Docblock der Route). Ein drittes Ziel muss sich für einen
 * der beiden Wege entscheiden, bevor es hier landet.
 *
 * Usage:
 *   const { offlineFetch, pendingCount, isSyncing } = useOfflineQueue();
 *   // Use offlineFetch instead of fetch for mutations
 *   const res = await offlineFetch("/api/entries", { method: "POST", body: JSON.stringify(data) });
 */
/**
 * Stempelt einen JSON-Rumpf als offline erfasst: `capturedOffline: true` + `capturedAt` (jetzt).
 * Der Server übernimmt `capturedAt` für einen offline erfassten Eintrag als Eintrags- und
 * Fristen-Stichtag (`offlineCapture.ts`). Kein gültiges JSON → unverändert zurück (dann fehlt das
 * Flag und es zählt die Server-Uhr, der sichere Rückfall).
 */
function withOfflineCapture(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    return JSON.stringify({ ...parsed, capturedOffline: true, capturedAt: new Date().toISOString() });
  } catch {
    return rawBody;
  }
}

/** Trägt der (JSON-)Rumpf einen Offline-Foto-Marker in irgendeinem Feld? */
function bodyHasOfflinePhoto(rawBody: string | null): boolean {
  if (!rawBody) return false;
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    return Object.values(parsed).some(isOfflineBlobUrl);
  } catch {
    return false;
  }
}

/**
 * Lädt ein offline zwischengespeichertes Foto hoch und gibt die echte `imageUrl` zurück.
 * Wirft bei Netz-/Server-Fehler (der Aufrufer bricht das Abarbeiten dann ab und versucht es später)
 * und bei fehlendem Blob (kein stiller Datenverlust — der Eintrag darf nicht ohne Bild entstehen).
 */
async function uploadOfflinePhoto(blobId: string): Promise<string> {
  const rec = await getBlob(blobId);
  if (!rec) throw new Error(`offline photo blob missing: ${blobId}`);
  const file = new File([rec.blob], rec.filename, { type: rec.blob.type || "image/jpeg" });
  // Über den geteilten Upload-Vertrag (`uploadPhoto`): wirft bei Netz/Zeitlimit, `null` bei
  // Server-Ablehnung. Beides bricht hier ab und lässt die Zeile für einen späteren Versuch stehen.
  const result = await uploadPhoto(file, rec.clientExifTime);
  if (!result) throw new Error("offline photo upload rejected");
  return result.url;
}

/**
 * Ersetzt in einer eingereihten Mutation alle Foto-Marker durch echte URLs — die Idempotenz-Schranke
 * des Nachreichens. Für JEDES Marker-Feld: Blob hochladen, die URL in den Rumpf schreiben und die
 * Zeile SOFORT persistieren (Marker weg), DANN den Blob löschen. Diese Reihenfolge garantiert:
 *   - kein Eintrag ohne Bild: die URL steht im gespeicherten Rumpf, bevor der Eintrag gesendet wird;
 *   - kein Doppel-Upload: ein späterer Versuch findet den Marker nicht mehr;
 *   - kein Speicherleck: der Blob wird nach erfolgreichem Upload entfernt.
 * Gibt den zu sendenden Rumpf zurück (unverändert, wenn keine Marker vorkamen). Wirft der Upload,
 * bleibt die Zeile mit allen bereits aufgelösten URLs erhalten.
 */
async function resolveOfflinePhotos(item: QueuedMutation): Promise<string | null> {
  if (!item.body) return item.body;
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(item.body); } catch { return item.body; }

  const fields = Object.keys(parsed).filter((k) => isOfflineBlobUrl(parsed[k]));
  if (fields.length === 0) return item.body;

  let body = item.body;
  for (const field of fields) {
    const blobId = parseOfflineBlobToken(parsed[field]);
    if (!blobId) continue;
    const url = await uploadOfflinePhoto(blobId);
    parsed[field] = url;
    body = JSON.stringify(parsed);
    if (item.id != null) await updateQueueItemBody(item.id, body);
    await deleteBlob(blobId);
  }
  return body;
}

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
          // Zuerst etwaige offline zwischengespeicherte Fotos hochladen und die Marker im Rumpf durch
          // echte URLs ersetzen (persistiert die Zeile, bevor der Eintrag gesendet wird). Wirft der
          // Upload (Netz/Server), bricht das Abarbeiten hier mit `catch` unten ab — später erneut.
          const body = await resolveOfflinePhotos(item);

          // Mit Zeitlimit, sonst wedgt eine einzige hängende Anfrage die ganze Warteschlange: das
          // `await` käme nie zurück, `finally` liefe nie, `syncingRef` bliebe für die Lebensdauer
          // der Seite auf `true` — und jeder weitere Versuch stiege oben sofort wieder aus.
          const res = await fetchWithTimeout(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body,
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
    async (
      url: string,
      init: RequestInit,
      // `offlineCapture`: wird diese Übermittlung eingereiht, ist sie ein OFFLINE ERFASSTER Eintrag.
      // Dann bekommt der Rumpf `capturedOffline: true` und `capturedAt` (die Uhr im Moment der
      // Handlung, nicht der u.U. Tage späteren Zustellung) — der Server übernimmt diese Zeit dann als
      // Stichtag (siehe `offlineCapture.ts`). Nur die Erfassungs-Formulare setzen es; eine
      // Aufgaben-Quittung (`/api/tasks`) reiht ohne das Flag ein.
      opts?: { offlineCapture?: boolean },
    ): Promise<Response | null> => {
      const method = init.method ?? "POST";
      const rawBody = typeof init.body === "string" ? init.body : null;
      // Trägt der Rumpf ein offline zwischengespeichertes Foto, MUSS er in die Warteschlange: der Marker
      // ist keine echte Bild-URL, ein Direktversand würde vom Server mit 400 abgelehnt — und die
      // Warteschlange verwürfe das als „schlechte Daten" (stiller Verlust). Erst der Flush löst den
      // Marker auf (`resolveOfflinePhotos`). Das kann auch bei `onLine === true` passieren, wenn der
      // Foto-Upload beim Erfassen am Netz scheiterte.
      const hasOfflinePhoto = bodyHasOfflinePhoto(rawBody);

      // `onLine === false` heisst zuverlässig „kein Netz" — dann gar nicht erst acht Sekunden
      // warten. Unzuverlässig ist nur das `true`: bei einem Balken Empfang steht es, während nichts
      // durchkommt. Deshalb entscheidet es hier nur noch über die Abkürzung, nicht mehr darüber, ob
      // eingereiht wird — genau diese Verwechslung liess die Warteschlange unterwegs schlafen.
      if (navigator.onLine && !hasOfflinePhoto) {
        try {
          return await fetchWithTimeout(url, init);
        } catch {
          // Zeitlimit abgelaufen oder Netzwerkfehler trotz `onLine` — einreihen statt verlieren.
        }
      }

      // Offline or network error: queue the mutation
      // Beim Einreihen den REALEN Erfassungsmoment festhalten: Was jetzt passiert, wird evtl. erst
      // Tage später gesendet — ohne diese Zeit trüge der Eintrag den Zustell-, nicht den Aktions-
      // Zeitpunkt. Schlägt das Parsen fehl (kein JSON-Rumpf), bleibt der Rumpf unangetastet.
      const body = opts?.offlineCapture && rawBody
        ? withOfflineCapture(rawBody)
        : rawBody;

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

      // Netz da, nur der Foto-Upload beim Erfassen war geflappt? Dann jetzt sofort abarbeiten (Blob
      // hochladen + Eintrag senden), statt auf das nächste `online`-Ereignis zu warten, das bei
      // stehender Verbindung nie kommt. Bewusst NICHT erwartet — die Erfolgsmeldung hängt nicht daran.
      if (navigator.onLine) void drainQueue();

      // Return null to indicate queued (caller should handle this)
      return null;
    },
    [toast, t, drainQueue]
  );

  return { offlineFetch, pendingCount, isSyncing, drainQueue };
}
