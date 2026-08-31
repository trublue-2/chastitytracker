import { heimdallEnabled } from "@/lib/constants";
import { activeCleaningWindow, type CleaningUserFields } from "@/lib/cleaningService";
import { cleaningWindowBindingStatus } from "@/lib/queries";
import type { BoxCleaningView } from "@/lib/boxStatus";

/**
 * Die EINE Reinigungs-Zeile der Box-Status-Karte für einen Sub: bindet gerade ein Fenster, und wenn
 * ja, bis wann.
 *
 * Serverseitig einmal je Seitenaufbau — NICHT im 5s-Poll der Karte: die Regeln ändern sich, wenn
 * der Keyholder sie editiert oder eine Reinigung eingetragen wird, nicht im Sekundentakt. Dieselbe
 * Quelle wie `get_context.cleaning` im MCP.
 *
 * Das NÄCHSTE Fenster gehört bewusst nicht dazu — die Karte zeigt nur das gerade offene (Begründung
 * bei `boxCleaningWindowOpenLabel`). Es stand hier trotzdem und wurde in jede Dashboard-Antwort
 * serialisiert, ohne dass es je jemand las.
 *
 * `windowsBinding` kommt aus derselben Regel wie die Durchsetzung und kennt als einziges die AKTIVE
 * Sperrzeit — ohne sie zeigte die Karte Fenster, die entweder längst gesperrt waren oder überhaupt
 * nichts einschränkten (Begründung am Feld). `lockPeriod` muss deshalb eine wirklich AKTIVE sein
 * (`getActiveLockPeriod`, bereits über `foldActiveLockPeriods` zusammengefaltet) — eine erst geplante
 * darf hier nicht mitzählen, sonst sperrt die Anzeige zu früh.
 *
 * Geteilt vom Sub-Dashboard und der Keyholder-Detailseite: beide zeigen dieselbe Karte, also darf
 * die Herleitung nicht zweimal dastehen.
 *
 * Reine Funktion ohne DB-Runde: beide Werte stehen bereits in der User-Zeile.
 */
export function buildBoxCleaningView(
  user: CleaningUserFields | null,
  lockPeriod: { cleaningAllowed: boolean } | null,
  now: Date,
  tz: string,
): BoxCleaningView | null {
  // Ohne Heimdall gibt es keine Box-Karte.
  if (!heimdallEnabled() || !user) return null;
  const { windowsBinding } = cleaningWindowBindingStatus(
    { cleaningAllowed: user.cleaningAllowed ?? false, cleaningWindows: user.cleaningWindows, timezone: tz },
    lockPeriod,
    now,
  );
  // Das ENDE des Fensters ist das einzige, was der Status nicht mitbringt — es ist die Angabe, die
  // aus der Zeile eine Gelegenheit mit Ablauf macht.
  const until = activeCleaningWindow(user.cleaningWindows, now, tz);
  return { windowsBinding, windowOpenNow: until ? { until } : null };
}
