import { heimdallEnabled } from "@/lib/constants";
import { buildReinigungView, reinigungVerbrauchtHeute, nextReinigungsFenster, type ReinigungUserFields } from "@/lib/reinigungService";
import { cleaningBlockReason } from "@/lib/queries";
import type { BoxReinigungView } from "@/lib/boxStatus";

/**
 * Die Reinigungs-Zeilen der Box-Status-Karte (Fenster + Kontingent + Live-Urteil) für EINEN Sub.
 *
 * Serverseitig einmal je Seitenaufbau — NICHT im 5s-Poll der Karte: die Regeln ändern sich, wenn
 * der Keyholder sie editiert oder eine Reinigung eingetragen wird, nicht im Sekundentakt. Dieselbe
 * Quelle wie `get_context.cleaning` im MCP.
 *
 * `blockedBy` kommt aus derselben Regel wie die Durchsetzung und kennt als einziges die AKTIVE
 * Sperrzeit: ohne es versprach die Karte Fenster, die eine reinigungsverbietende Sperre längst
 * gesperrt hatte. `sperre` muss deshalb eine wirklich AKTIVE sein (`getActiveSperrzeit`, bereits
 * über `foldActiveSperrzeiten` zusammengefaltet) — eine erst geplante darf hier nicht mitzählen,
 * sonst sperrt die Anzeige zu früh.
 *
 * Geteilt vom Sub-Dashboard und der Keyholder-Detailseite: beide zeigen dieselbe Karte, also darf
 * die Herleitung nicht zweimal dastehen.
 */
export async function buildBoxReinigungView(
  user: (ReinigungUserFields & { id: string }) | null,
  sperre: { reinigungErlaubt: boolean } | null,
  now: Date,
  tz: string,
): Promise<BoxReinigungView | null> {
  // Ohne Heimdall gibt es keine Box-Karte — dann auch keine Zählabfrage dafür.
  if (!heimdallEnabled() || !user) return null;
  return {
    ...buildReinigungView(user, await reinigungVerbrauchtHeute(user.id, now, tz), now, tz),
    nextWindow: nextReinigungsFenster(user.reinigungsFenster, now, tz),
    blockedBy: cleaningBlockReason(
      { reinigungErlaubt: user.reinigungErlaubt ?? false, reinigungsFenster: user.reinigungsFenster, timezone: tz },
      sperre ? [sperre] : [],
      now,
    ),
  };
}
