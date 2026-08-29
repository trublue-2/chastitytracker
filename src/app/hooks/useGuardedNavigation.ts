"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CLIENT_TIMEOUT_MS } from "@/lib/apiClient";
import { reportReachable, reportStalled } from "@/lib/connectionHealth";

/**
 * Nach wie vielen ms ohne Seitenwechsel die Navigation als steckengeblieben gilt.
 *
 * Die Hälfte des Anfrage-Zeitlimits, und ABGELEITET statt danebengeschrieben: hier geht es nicht
 * ums Abbrechen, sondern ums Bescheidsagen — die Anfrage darf weiterlaufen und doch noch ankommen.
 * Die Meldung muss also VOR dem Abbruch kommen. Als zweite freistehende Zahl wäre diese Ordnung
 * beim ersten Ändern eines der beiden Werte lautlos gekippt.
 */
export const NAV_STALL_MS = CLIENT_TIMEOUT_MS / 2;

/**
 * Eine Navigation, die nicht stumm scheitern kann.
 *
 * **Das Problem.** `router.push()` auf eine Server-Route holt eine RSC-Nutzlast. Bei schlechter
 * Abdeckung hängt dieser `fetch` — ohne Zeitlimit, ohne Rückmeldung. Next.js wechselt die Seite
 * erst, wenn die Nutzlast da ist, also passiert bis dahin GAR NICHTS: kein Skelett, kein Spinner,
 * keine Meldung. Ein `loading.tsx` hilft dabei nicht, denn das Skelett steckt in derselben
 * Nutzlast; und der Router-Cache auch nicht, weil `staleTimes.dynamic` bewusst auf `0` steht
 * (`next.config.ts` — sonst zeigte die App nach einem Verschluss veraltete Zustände).
 *
 * Gemeldet am 28.08.2026: Aufschluss unterwegs erfassen, (+) tippen, „Öffnen" tippen — das Blatt
 * klappt zu, und dann nichts. Nachgestellt und gemessen: 17 Sekunden lang keine einzige sichtbare
 * Änderung.
 *
 * **Was dieser Hook tut.** Er merkt sich, wohin gesprungen werden soll, und beobachtet
 * `usePathname()`: wechselt der Pfad, ist die Navigation angekommen. Tut er das nach
 * {@link NAV_STALL_MS} nicht, meldet `stalled` es dem Aufrufer, der daraus eine Auskunft und ein
 * `retry()` machen kann. Die laufende Anfrage wird dabei NICHT abgebrochen — kommt sie doch noch
 * an, wechselt die Seite wie gewollt.
 *
 * **Er meldet auch an `connectionHealth`.** Eine hängende RSC-Nutzlast ist dieselbe Aussage über
 * dieselbe Leitung wie eine hängende `fetch`-Anfrage — der Store kannte sie nur bisher nicht. Damit
 * zeigt die vorhandene Zustandszeile über dem Dashboard „Verbindung stockt", ohne dass irgendein
 * Aufrufer dafür etwas anzeigen müsste. Das ist der Grund, warum hier KEIN Toast steht: den Satz
 * gestaltet `PoorConnectionNote`, und zwar an einer Stelle.
 *
 * **Wer ihn benutzt.** Direkt das (+)-Blatt, das zusätzlich seine eigene Zeile zeigt (Ladezeichen an
 * der getippten Zeile, „Erneut versuchen"). Und `useViewTransition`, durch das jeder
 * `ViewTransitionLink` läuft.
 *
 * Der Sprung selbst ist hier `router.push` ohne Übergang: den legt `useViewTransition` darum,
 * statt dass dieser Hook eine Animation erzwingt, die das (+)-Blatt nie hatte.
 */
export default function useGuardedNavigation(onArrive?: () => void) {
  const router = useRouter();
  const pathname = usePathname();
  /** Über einen Ref, damit ein bei jedem Render neu gebauter Callback die Frist nicht zurücksetzt. */
  const arrived = useRef(onArrive);
  arrived.current = onArrive;
  const [target, setTarget] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  /** Der Pfad beim Start; sein Wechsel IST das Ankommen. */
  const from = useRef<string | null>(null);

  const reset = useCallback(() => {
    setTarget(null);
    setStalled(false);
    from.current = null;
  }, []);

  const go = useCallback(
    (href: string) => {
      // Ein Ziel auf demselben Pfad wechselt `pathname` nie — dann gäbe es kein Signal fürs
      // Ankommen und die Frist liefe garantiert ab. Solche Sprünge laufen ungewacht.
      const samePath = href.split("?")[0].split("#")[0] === pathname;
      if (samePath) {
        router.push(href);
        return;
      }
      from.current = pathname;
      setStalled(false);
      setTarget(href);
      router.push(href);
    },
    [router, pathname],
  );

  // Einfach nochmal losschicken: `go` setzt `stalled` zurück und startet damit die Frist neu — der
  // Effekt unten hängt an `stalled`. Ein eigener Rumpf wäre eine zweite Kopie derselben drei
  // Schritte gewesen.
  const retry = useCallback(() => {
    if (target) go(target);
  }, [go, target]);

  useEffect(() => {
    if (!target) return;
    // Das Ankommen wird ZUERST geprüft, vor jeder anderen Bedingung. Stünde die `stalled`-Schranke
    // davor, käme die Seite nach der Meldung zwar an, aber niemand merkte es mehr: das Blatt bliebe
    // mit „Verbindung stockt" über der bereits gewechselten Seite stehen.
    if (pathname !== from.current) {
      // Angekommen heisst: die Nutzlast kam durch. Das ist eine Aussage über die Leitung, und der
      // Store lebt davon, dass auch das Aufhören gemeldet wird.
      reportReachable();
      reset();
      // Der Aufrufer erfährt das Ankommen — das (+)-Blatt schliesst sich erst JETZT. Vorher schloss
      // es sofort beim Tippen, und genau das liess ein hängendes Ziel wie „nichts passiert"
      // aussehen: das Blatt war weg, die Seite war die alte, und nichts erklärte den Unterschied.
      arrived.current?.();
      return;
    }
    // `stalled` ist zugleich der Auslöser der Frist: es wechselt an genau den zwei Momenten, an
    // denen sie neu laufen soll (Start und erneuter Versuch über `go`). Steht es schon, ist die
    // Meldung draussen und es gibt nichts mehr zu melden.
    if (stalled) return;
    const timer = setTimeout(() => {
      setStalled(true);
      reportStalled();
    }, NAV_STALL_MS);
    return () => clearTimeout(timer);
  }, [target, stalled, pathname, reset]);

  return { go, retry, reset, target, pending: target !== null && !stalled, stalled };
}
