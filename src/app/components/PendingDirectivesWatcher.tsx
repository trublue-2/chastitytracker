"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 30_000;

/**
 * Hält das Dashboard ohne manuellen Reload aktuell: pollt eine leichte Signatur der offenen
 * keyholder-initiierten Anforderungen (Kontrollen, Verschluss-/Orgasmus-Anforderung, Sperrzeit)
 * und löst bei Änderung ein router.refresh() aus. So erscheint z.B. eine neu angeforderte Kontrolle
 * automatisch — periodisch (alle 30 s) und sofort, sobald der Tab wieder Fokus bekommt (typisch nach
 * der Push-Benachrichtigung). Refresht nur bei echter Änderung, nicht auf jeden Tick.
 */
export default function PendingDirectivesWatcher() {
  const router = useRouter();
  const lastSigRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    async function check() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/dashboard/pending", { cache: "no-store" });
        if (!res.ok) return;
        const { sig } = (await res.json()) as { sig: string };
        if (lastSigRef.current === null) {
          lastSigRef.current = sig; // Baseline beim ersten Lauf — kein Refresh
        } else if (sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          router.refresh();
        }
      } catch {
        // transiente Netzfehler ignorieren
      } finally {
        inFlightRef.current = false;
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);
    function onVisible() { if (document.visibilityState === "visible") check(); }
    function onFocus() { check(); }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);

  return null;
}
