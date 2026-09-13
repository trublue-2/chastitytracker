import { lookup } from "dns/promises";
import { isIP } from "net";

/**
 * Darf die Foto-Prüfung eine vom ADMIN eingetragene Adresse anfragen?
 *
 * **Warum es das braucht.** Auf einer Portal-Instanz ist der Admin ein fremder Nutzer, nicht der
 * Betreiber des Servers. Der Container hängt dort im selben Docker-Netz wie Portal, Schlüsselbox-
 * Steuerung, MQTT, Traefik und alle anderen Instanzen. Eine frei eintragbare Adresse, an die der
 * Server POST-Anfragen schickt — und deren HTTP-Status „Einstellung testen" zurückmeldet —, wäre ein
 * Werkzeug, dieses Netz abzutasten und anzusprechen.
 *
 * **Die Regel.** Standardmässig nur ÖFFENTLICHE Ziele: kein Loopback, kein privates Netz, kein
 * Link-Local, kein Tailscale-/CGNAT-Bereich, kein einteiliger Hostname (Container-Namen). Aufgelöst
 * wird der Hostname, nicht nur sein Name geprüft — ein öffentlicher Name kann auf eine interne Adresse
 * zeigen. Wer den eigenen Server im lokalen Netz betreibt, schaltet private Ziele ausdrücklich frei:
 * `VISION_ALLOW_PRIVATE_URLS=true`. Das kann nur, wer die `.env` in der Hand hat, also der Betreiber.
 *
 * Gilt nur für Adressen aus der App-Einstellung. Was in der `.env` steht, hat der Betreiber selbst
 * eingetragen.
 */

export function privateVisionUrlsAllowed(): boolean {
  return process.env.VISION_ALLOW_PRIVATE_URLS === "true";
}

/** Liegt die IP-Adresse in einem nicht-öffentlichen Bereich? Ein Nicht-IP-Wert gilt als intern. */
export function isInternalAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127
      || (a === 100 && b >= 64 && b <= 127) // CGNAT, u.a. Tailscale
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || a >= 224; // Multicast und reserviert
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isInternalAddress(mapped[1]);
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower); // ULA, Link-Local
  }
  return true;
}

/** Ist die Adresse ein erlaubtes Ziel? Wirft nie. */
export async function isAllowedVisionUrl(raw: string): Promise<boolean> {
  if (privateVisionUrlsAllowed()) return true;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !isInternalAddress(host);
  // Einteilig heisst: ein Name im Docker-Netz (`heimdall`, `tracker-portal`) oder `localhost`.
  if (!host.includes(".")) return false;
  try {
    const addresses = await lookup(host, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isInternalAddress(a.address));
  } catch {
    return false;
  }
}
