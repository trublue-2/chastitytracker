import { heimdallEnabled } from "@/lib/constants";
import { buildCleaningView, countCleaningUsedToday, type CleaningCountEntry, type CleaningUserFields } from "@/lib/cleaningService";
import { cleaningBlockReason } from "@/lib/queries";
import type { BoxCleaningView } from "@/lib/boxStatus";

/**
 * Die Reinigungs-Zeilen der Box-Status-Karte (Fenster + Kontingent + Live-Urteil) für EINEN Sub.
 *
 * Serverseitig einmal je Seitenaufbau — NICHT im 5s-Poll der Karte: die Regeln ändern sich, wenn
 * der Keyholder sie editiert oder eine Reinigung eingetragen wird, nicht im Sekundentakt. Dieselbe
 * Quelle wie `get_context.cleaning` im MCP.
 *
 * Das NÄCHSTE Fenster gehört bewusst nicht dazu — die Karte zeigt nur das gerade offene (Begründung
 * bei `boxCleaningWindowOpenLabel`). Es stand hier trotzdem und wurde in jede Dashboard-Antwort
 * serialisiert, ohne dass es je jemand las.
 *
 * `blockedBy` kommt aus derselben Regel wie die Durchsetzung und kennt als einziges die AKTIVE
 * Sperrzeit: ohne es versprach die Karte Fenster, die eine reinigungsverbietende Sperre längst
 * gesperrt hatte. `lockPeriod` muss deshalb eine wirklich AKTIVE sein (`getActiveLockPeriod`, bereits
 * über `foldActiveLockPeriods` zusammengefaltet) — eine erst geplante darf hier nicht mitzählen,
 * sonst sperrt die Anzeige zu früh.
 *
 * Geteilt vom Sub-Dashboard und der Keyholder-Detailseite: beide zeigen dieselbe Karte, also darf
 * die Herleitung nicht zweimal dastehen.
 *
 * `allEntries` = alle Einträge des Subs; beide Aufrufer laden sie ohnehin, also zählt
 * {@link countCleaningUsedToday} das Tageskontingent daraus statt mit einer eigenen DB-Runde —
 * deshalb ist das hier keine async-Funktion.
 */
export function buildBoxCleaningView(
  user: CleaningUserFields | null,
  allEntries: CleaningCountEntry[],
  lockPeriod: { cleaningAllowed: boolean } | null,
  now: Date,
  tz: string,
): BoxCleaningView | null {
  // Ohne Heimdall gibt es keine Box-Karte — dann auch keine Zählung dafür.
  if (!heimdallEnabled() || !user) return null;
  return {
    ...buildCleaningView(user, countCleaningUsedToday(allEntries, now, tz), now, tz),
    blockedBy: cleaningBlockReason(
      { cleaningAllowed: user.cleaningAllowed ?? false, cleaningWindows: user.cleaningWindows, timezone: tz },
      lockPeriod ? [lockPeriod] : [],
      now,
    ),
  };
}
