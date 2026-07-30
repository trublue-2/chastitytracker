"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import useToast from "@/app/hooks/useToast";
import { activateWaitingSw } from "@/lib/swMessages";

const POLL_INTERVAL_MS = 30_000;
/** Takt, solange der Server eine laufende Erkennung meldet (`settling`). Die KI-Urteile fallen in
 *  Sekunden — mit dem ruhigen 30-s-Takt stünde der Nutzer bis zu eine halbe Minute vor einer
 *  Zeile, deren Ergebnis längst in der DB liegt. Gilt nur, solange wirklich etwas läuft; danach
 *  fällt der Takt von selbst zurück (der Server begrenzt „läuft" zeitlich, siehe heartbeat-Route). */
const SETTLING_POLL_MS = 3_000;

/**
 * Ein einziger Client-Heartbeat statt drei separater Polls (Version/Session/Pending). Pollt
 * /api/heartbeat periodisch und sofort bei Tab-Fokus/visibilitychange/pageshow, und reagiert auf:
 *  - neue Version  → Reload-Banner (wie zuvor VersionChecker)
 *  - Account-Wechsel → Hard-Reload (wie zuvor SessionGuard)
 *  - geänderte offene Anforderungen → router.refresh (wie zuvor PendingDirectivesWatcher)
 *
 * Der Takt richtet sich nach `settling`: läuft server-seitig gerade eine KI-Erkennung
 * (Kontroll-Verifikation oder Schlüssel im Box-Foto), wird dichter gepollt, damit das Ergebnis
 * ohne manuellen Reload erscheint. Sonst der ruhige 30-s-Takt.
 */
export default function Heartbeat({ buildDate, initialUserId }: { buildDate: string; initialUserId: string | null }) {
  const router = useRouter();
  const tv = useTranslations("versionChecker");
  const ts = useTranslations("sessionGuard");
  const toast = useToast();
  const [outdated, setOutdated] = useState(false);
  const [reloading, setReloading] = useState(false);

  const buildRef = useRef(buildDate);
  const userRef = useRef(initialUserId);
  const sigRef = useRef<string | null>(null);
  const settlingRef = useRef(false);
  const reloadingRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    // Genau EINE Timer-Kette pro Effekt-Lauf. `cancelled` ist Pflicht, nicht Vorsicht: der erste
    // Check läuft asynchron, ein Cleanup KANN also fallen, bevor `timer` überhaupt gesetzt ist —
    // ohne die Flagge bewaffnete sich diese Kette danach weiter und wäre von keinem Cleanup mehr
    // erreichbar. Die Effekt-Deps enthalten instabile Werte (`toast`), das passiert also real.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      clearTimeout(timer);
      if (cancelled) return;
      timer = setTimeout(tick, settlingRef.current ? SETTLING_POLL_MS : POLL_INTERVAL_MS);
    }

    // Der Timer-Rumpf ist die EINZIGE Stelle, die neu plant — und er tut es IMMER, auch wenn der
    // Check übersprungen wurde. Läge das Planen in `check`, stünde es hinter dessen Vorab-Return
    // („läuft schon einer"): beim Start prallt der zweite Effekt-Durchlauf (React StrictMode, oder
    // eine instabile Effekt-Dependency) genau darauf, und die einzige überlebende Kette würde nie
    // bewaffnet — der Poll lief dann gar nicht.
    // Im Hintergrund-Tab wird nur der Check übersprungen (wie in `useBoxStatus`), nicht die Kette;
    // beim Zurückkommen holt der visibilitychange-Handler den frischen Stand sofort.
    async function tick() {
      if (!document.hidden) await check();
      schedule();
    }

    async function check() {
      if (reloadingRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/heartbeat", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildDate?: string; sessionUserId?: string | null; pendingSig?: string; settling?: boolean };
        settlingRef.current = !!data.settling;

        // 1) Neue App-Version
        if (data.buildDate && data.buildDate !== buildRef.current) setOutdated(true);

        // 2) Account-Wechsel (nur wenn wir eingeloggt gestartet sind) → Hard-Reload
        if (userRef.current && data.sessionUserId && data.sessionUserId !== userRef.current) {
          reloadingRef.current = true;
          toast.warning(ts("switched"), { duration: 1500 });
          setTimeout(() => window.location.reload(), 1500);
          return;
        }

        // 3) Offene Anforderungen geändert → Server-Komponenten neu laden
        const sig = data.pendingSig ?? "";
        if (sigRef.current === null) {
          sigRef.current = sig; // Baseline beim ersten Lauf — kein Refresh
        } else if (sig !== sigRef.current) {
          sigRef.current = sig;
          router.refresh();
        }
      } catch {
        // transiente Netzfehler ignorieren
      } finally {
        inFlightRef.current = false;
      }
    }

    // SOFORT einmal prüfen, nicht erst nach dem ersten Intervall: der erste Lauf legt die
    // Baseline-Signatur fest. Kommt er zu spät, ist ein inzwischen fertiges Urteil schon Teil der
    // Baseline und löst nie ein Refresh aus — genau so blieb das Schlüssel-Urteil bis zum
    // manuellen Reload unsichtbar. `tick` statt `check`, damit dabei auch die Kette startet.
    void tick();

    // Ereignis-Pfade laufen ebenfalls über `tick`, nicht über `check`: nur so wird der Takt danach
    // neu gesetzt. Sonst lernt ein Fokus-Check zwar „es läuft gerade etwas", der bereits gestartete
    // 30-s-Timer bliebe aber stehen — der dichte Takt begänne erst nach dessen Ablauf.
    function onVisible() { if (document.visibilityState === "visible") void tick(); }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted || document.visibilityState === "visible") void tick(); }
    function onFocus() { void tick(); }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [router, toast, ts]);

  if (!outdated) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-50">
      <div className="bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl">
        <RefreshCw size={18} className="flex-shrink-0 text-gray-300 animate-spin" style={{ animationDuration: "2s" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{tv("title")}</p>
          <p className="text-xs text-gray-400">{tv("subtitle")}</p>
        </div>
        <button
          onClick={async () => {
            // reloadingRef stoppt zusätzlich den Poll, damit er nicht in den Reload hineinläuft.
            reloadingRef.current = true;
            setReloading(true);
            await activateWaitingSw();
            window.location.reload();
          }}
          disabled={reloading}
          className="flex-shrink-0 bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-gray-100 transition disabled:opacity-60"
        >
          {tv("reload")}
        </button>
      </div>
    </div>
  );
}
