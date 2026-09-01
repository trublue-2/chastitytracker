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

  /**
   * Der zweite Versuch ist ein VOLLER Seitenaufruf, kein zweites `router.push`.
   *
   * Ein `push` kann den ersten nicht zurücknehmen. Next.js bietet keinen Weg, eine laufende
   * RSC-Anfrage abzubrechen, und dieser Hook bricht bewusst nichts ab — die Seite darf ja doch noch
   * kommen. Ein zweiter `push` legte deshalb nur einen zweiten Aufbau DERSELBEN Route auf dieselbe
   * SQLite-Instanz, ein dritter einen dritten: jeder Versuch machte die Lage schlechter, die er
   * beheben sollte.
   *
   * Genau so ist es am 30./31.08.2026 gelaufen (fünf bzw. drei Anfragen auf
   * `/dashboard/new/oeffnen` innerhalb von Sekunden, im Zugriffslog nachlesbar): „Erneut versuchen"
   * half nie, geholfen hat erst das Beenden der App. Der Dokument-Wechsel tut dasselbe wie das
   * Beenden, nur billiger — der Browser wirft das alte Dokument samt ALLER offenen Anfragen weg —
   * und nimmt zugleich den kürzeren Weg: als Navigation braucht er keine RSC-Nutzlast, also nicht
   * das, woran es gerade klemmt.
   */
  const retry = useCallback(() => {
    if (target) window.location.href = target;
  }, [target]);

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
    // `stalled` ist zugleich der Auslöser der Frist: sein Zurücksetzen in `go` startet sie. Steht es
    // schon, ist die Meldung draussen und es gibt nichts mehr zu melden. Ein erneuter Versuch
    // erscheint hier NICHT mehr — der verlässt das Dokument (siehe `retry`), statt die Frist im
    // selben Dokument neu zu starten.
    if (stalled) return;
    const timer = setTimeout(() => {
      setStalled(true);
      reportStalled();
    }, NAV_STALL_MS);
    return () => clearTimeout(timer);
  }, [target, stalled, pathname, reset]);

  // Bewusst KEIN abgeleitetes `pending` mehr. Es stand für `target !== null && !stalled` und las
  // sich wie „eine Navigation läuft" — bedeutete aber „läuft UND ist noch nicht gemeldet". Genau auf
  // diese Verwechslung stützte das (+)-Blatt seine Schranke gegen ein zweites Ziel: sie gab mit der
  // Stockt-Meldung nach, während die Anfrage weiterlief, und jeder weitere Tipp legte einen zweiten
  // Seitenaufbau auf den ersten.
  //
  // Übrig bleiben zwei Werte, die nichts vortäuschen: WOHIN es geht (`target`, `null` = nichts
  // unterwegs) und OB es schon gemeldet ist (`stalled`). Wer beides zugleich braucht, verknüpft sie
  // an seiner Aufrufstelle — dort ist sichtbar, welche der beiden Fragen er eigentlich stellt.
  return { go, retry, reset, target, stalled };
}
