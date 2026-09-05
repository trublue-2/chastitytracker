"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Hält eine server-gerenderte Seite frisch, ohne dass jemand neu lädt: ruft im Takt `router.refresh()`
 * und holt damit die RSC-Daten neu. Nötig, weil die zeit-abgeleiteten Zustände der Keyholder- und
 * Träger-Sichten (überfällig/abgelaufen, „verschlossen seit X", Sortierung, Alarm-Zähler) beim
 * Rendern gegen EINEN `now` entstehen und danach vergammeln — der globale {@link Heartbeat} löst nur
 * bei DATEN-Änderungen der eigenen Person aus, nicht beim blossen Verstreichen von Zeit und nicht für
 * die Subs einer Keyholderin.
 *
 * Rendert nichts. Bewusst OHNE `aria-live`: eine Ansage im Takt liesse den Screenreader sich endlos
 * unterbrechen (dieselbe Regel wie {@link TimerDisplay}/{@link LiveStatus}); `router.refresh()` ist
 * ohnehin lautlos und erhält Fokus und Client-Zustand.
 *
 * Kein Sofort-Tick beim Mounten (die Seite ist gerade frisch gerendert). Im Hintergrund-Tab
 * (`document.hidden`) wird der Takt übersprungen; beim Sichtbarwerden holt ein Sofort-Refresh den
 * verpassten Stand nach — dasselbe Muster wie {@link useBoxStatus}.
 */
export default function AutoRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const iv = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);

  return null;
}
