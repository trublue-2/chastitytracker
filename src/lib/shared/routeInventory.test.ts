import { describe, it, expect } from "vitest";
import { listFiles, readStripped } from "@/test/sourceScan";
import { PUBLIC_ROUTES, isPublicPath } from "../auth/publicRoutes";

/**
 * Jede Route hat einen Wächter — und ein neuer ungeschützter Endpunkt bricht diesen Test.
 *
 * **Die Überlegung:** `proxy.ts` stellt `/dashboard` und alles unter `/api` hinter die Session,
 * ausser dem, was `publicRoutes.ts` aufzählt. Das ist die ÄUSSERE Haut. Darunter muss jede Route
 * den Aufrufer selbst prüfen (Rolle, Besitz) — und genau das vergisst man bei einer neuen Route,
 * ohne dass es kompiliert anders aussähe. Der Test liest den Baum, statt eine Dateiliste zu pflegen
 * (Bauart nach `nestedComponents.test.ts`), und prüft JEDEN exportierten Handler einzeln: eine
 * Datei mit geschütztem GET und ungeschütztem DELETE fiele sonst durch.
 *
 * Drei Klassen, eine Route gehört in genau eine:
 *  a) vom Proxy erfasst UND ein bekannter Guard-Aufruf im Handler (oder in einem lokalen Helfer,
 *     den er ruft) — der Regelfall;
 *  b) vom Proxy ausgenommen (`publicRoutes.ts`) — dann steht sie in `PUBLIC_ROUTE_FILES` mit der
 *     Marke ihres EIGENEN Schutzes, die in der Datei vorkommen muss, oder mit Begründung, warum sie
 *     offen sein darf;
 *  c) über eine Fabrik geschützt (`FACTORY_EXPORTS`) oder bewusst offen (`GATED_BUT_OPEN`) — klein
 *     und begründet. Wer hier einträgt, entscheidet, dass eine Route keinen Wächter braucht.
 *
 * Grenze: der Test sieht, dass ein Guard AUFGERUFEN wird, nicht, dass sein Ergebnis auch benutzt
 * wird. Das prüft das Review.
 */

const ROUTE_FILES = (["src/app/api", "src/app/.well-known"] as const)
  .flatMap((root) => listFiles(root, (f) => f.endsWith("route.ts")))
  .sort();

/** Pfad, unter dem der Proxy die Route sieht (dynamische Segmente durch Beispielwerte ersetzt). */
function samplePath(file: string): string {
  return file
    .replace(/^src\/app/, "")
    .replace(/\/route\.ts$/, "")
    .replace("[transport]", "mcp") // zusätzlich /api/sse und /api/message, siehe TRANSPORTS
    .replace(/\[\.\.\.\w+\]/g, "a/b")
    .replace(/\[\w+\]/g, "x1");
}

/** Die Pfade, die `[transport]` bedient (mcp-handler). */
const TRANSPORTS = ["/api/mcp", "/api/sse", "/api/message"];

/** Die Guards, die auch eine Rolle verlangen — für `/api/admin/*` reicht eine blosse Session nicht. */
const ROLE_GUARD_NAMES = "requireAdminApi|requireKeyholderOrAdminApi|requireKeyholderOrAdminActor|requireControllerApi|requireJournalReaderApi|assert(?:Admin|KeyholderOrAdmin|Controller)";
const ROLE_GUARD = new RegExp(`\\b(${ROLE_GUARD_NAMES})\\(`);
/** Alle bekannten Guard-Aufrufe: die Rollen-Guards plus Session-Guards. `auth()` zählt, weil Routen mit eigener Session-Logik (heartbeat, oauth) sie nutzen. */
const GUARD = new RegExp(`\\b(${ROLE_GUARD_NAMES}|requireApi|requireBoxSync|userSelfFieldRoute|withMcpAuth|auth)\\(`);

interface Chunk { name: string; text: string; exported: boolean }

/** Zerlegt eine Datei an ihren Top-Level-Deklarationen. */
function chunks(src: string): Chunk[] {
  const re = /^(export )?(?:async )?(?:function\s+(\w+)|const\s+(\w+)\s*=|const\s*\{\s*([\w\s,]+)\}\s*=)/gm;
  const marks: { i: number; name: string; exported: boolean }[] = [];
  for (let m = re.exec(src); m; m = re.exec(src)) marks.push({ i: m.index, name: m[2] ?? m[3] ?? m[4], exported: !!m[1] });
  return marks.map((c, k) => ({ name: c.name, exported: c.exported, text: src.slice(c.i, marks[k + 1]?.i ?? src.length) }));
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Exportierte Handler, die eine FABRIK zusammensetzt statt eines Rumpfs. Der Guard sitzt in der
 * Fabrik — `messageInboxRoutes.ts`, deren Wächter der Test unten eigens prüft.
 */
const FACTORY_EXPORTS = /=\s*(ownInboxRoutes|keyholderInboxRoutes)\.\w+\s*;?\s*$/;

/** Vom Proxy erfasst, aber ohne Guard im Handler — bewusst. */
const GATED_BUT_OPEN: Record<string, string> = {
  "src/app/api/apple-app-site-association/route.ts":
    "Wird über den Rewrite /.well-known/apple-app-site-association ausgeliefert (der Proxy sieht den .well-known-Pfad, der ausgenommen ist); nur Team- und Bundle-ID, nichts Geheimes. Der Direktaufruf bleibt hinter der Session.",
};

/**
 * Routen unter einem vom Proxy ausgenommenen Pfad: die Marke ihres EIGENEN Schutzes (muss im Quelltext
 * vorkommen; wo ein Fremder Eingaben schickt, ist es `checkRateLimit(`) oder `null` mit Begründung, warum sie offen sein darf. Eine neue Route unter
 * `/api/auth/`, `/api/oauth/` usw. muss HIER eingetragen werden — sonst schlüpft sie ungeprüft durch
 * die Ausnahme ihres Verzeichnisses.
 */
const PUBLIC_ROUTE_FILES: Record<string, { marker: RegExp | null; why: string }> = {
  "src/app/.well-known/oauth-authorization-server/route.ts": { marker: null, why: "OAuth-Discovery-Metadaten, per Standard öffentlich" },
  "src/app/.well-known/oauth-protected-resource/route.ts": { marker: null, why: "OAuth-Discovery-Metadaten, per Standard öffentlich" },
  "src/app/api/[transport]/route.ts": { marker: /withMcpAuth\(/, why: "MCP: Bearer-Token" },
  "src/app/api/auth/[...nextauth]/route.ts": { marker: /handlers/, why: "Auth.js" },
  "src/app/api/auth/forgot-password/route.ts": { marker: /checkRateLimit\(/, why: "Reset-Anfrage ohne Konto; Rate-Limit, einheitliche Antwort" },
  "src/app/api/auth/lockout/route.ts": { marker: /checkRateLimit\(/, why: "Sperr-Auskunft der Anmeldeseite; antwortet für bekannte und unbekannte Eingaben gleich, Rate-Limit" },
  "src/app/api/auth/passkey/authenticate/route.ts": { marker: /checkRateLimit\(/, why: "Passkey-Anmeldung: der Aufrufer ist noch nicht angemeldet; die Prüfung ist die WebAuthn-Signatur, dazu Rate-Limit" },
  "src/app/api/auth/passkey/list/route.ts": { marker: /requireApi\(/, why: "Passkey-Verwaltung, Session" },
  "src/app/api/auth/passkey/register/route.ts": { marker: /requireApi\(/, why: "Passkey-Registrierung, Session" },
  "src/app/api/auth/reset-password/route.ts": { marker: /checkRateLimit\(/, why: "Passwort-Reset über einmaliges Token, Rate-Limit" },
  "src/app/api/heartbeat/route.ts": { marker: /auth\(\)/, why: "Session selbst gelesen; ohne sie keine Nutzdaten" },
  "src/app/api/integration/box/config/route.ts": { marker: /requireBoxSync\(/, why: "Box-Secret" },
  "src/app/api/integration/box/event/route.ts": { marker: /requireBoxSync\(/, why: "Box-Secret" },
  "src/app/api/integration/box/status/route.ts": { marker: /requireBoxSync\(/, why: "Box-Secret" },
  "src/app/api/oauth/authorize/route.ts": { marker: /auth\(\)/, why: "Consent-Entscheidung braucht die Session; GET prüft nur Parameter und leitet weiter" },
  "src/app/api/oauth/register/route.ts": { marker: /checkRateLimit\(/, why: "dynamische Client-Registrierung (RFC 7591), Rate-Limit" },
  "src/app/api/oauth/revoke/route.ts": { marker: /checkRateLimit\(/, why: "Widerruf (RFC 7009), Rate-Limit" },
  "src/app/api/oauth/token/route.ts": { marker: /checkRateLimit\(/, why: "Token-Endpunkt, Rate-Limit; prüft Code/Client" },
  "src/app/api/portal-login/route.ts": { marker: /jwtVerify\(/, why: "Portal-JWT" },
  "src/app/api/telegram/webhook/route.ts": { marker: /telegramWebhookSecretOk\(/, why: "Secret-Header" },
  "src/app/api/upstream-changelog/route.ts": { marker: null, why: "öffentlicher Changelog" },
  "src/app/api/version/route.ts": { marker: null, why: "Version und Build-Datum" },
};

/** Exportierte Handler einer Datei, die `guard` weder selbst noch über einen lokalen Helfer (oder eine Fabrik) rufen. */
function unguardedHandlers(file: string, guard: RegExp): string[] {
  const parts = chunks(readStripped(file));
  // Lokale Helfer, die selbst einen Guard rufen (z.B. eine Besitz-Prüfung vor dem Handler).
  const helpers = new Set(parts.filter((c) => !METHODS.includes(c.name) && guard.test(c.text)).map((c) => c.name));
  const handlers = parts.filter((c) => c.exported && METHODS.includes(c.name));
  if (handlers.length === 0) return ["(kein exportierter Handler gefunden)"];
  return handlers
    .filter((h) => !(guard.test(h.text) || FACTORY_EXPORTS.test(h.text.trim()) || [...helpers].some((n) => new RegExp(`\\b${n}\\(`).test(h.text))))
    .map((h) => h.name);
}

describe("Routen-Inventar", () => {
  it("findet die Routen — sonst prüft der Test nichts", () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(100);
  });

  it("jede Route unter einem ausgenommenen Pfad ist einzeln eingetragen und trägt die Marke ihres Schutzes", () => {
    const problems: string[] = [];
    for (const file of ROUTE_FILES) {
      const exempt = isPublicPath(samplePath(file));
      const entry = PUBLIC_ROUTE_FILES[file];
      if (exempt && !entry) problems.push(`${file}: vom Proxy ausgenommen, aber nicht in PUBLIC_ROUTE_FILES`);
      if (!exempt && entry) problems.push(`${file}: steht in PUBLIC_ROUTE_FILES, ist aber nicht ausgenommen`);
      if (exempt && entry?.marker && !entry.marker.test(readStripped(file))) {
        problems.push(`${file}: erwartete Schutz-Marke ${entry.marker} fehlt`);
      }
    }
    for (const file of Object.keys(PUBLIC_ROUTE_FILES)) if (!ROUTE_FILES.includes(file)) problems.push(`${file}: Eintrag ohne Datei`);
    expect(problems).toEqual([]);
  });

  it("jeder exportierte Handler einer vom Proxy erfassten Route ruft einen bekannten Guard", () => {
    const problems = ROUTE_FILES.filter((f) => !isPublicPath(samplePath(f)) && !(f in GATED_BUT_OPEN))
      .flatMap((f) => unguardedHandlers(f, GUARD).map((h) => `${f}: ${h} ohne erkennbaren Guard`));
    expect(problems).toEqual([]);
  });

  it("unter /api/admin reicht eine blosse Session nicht: jeder Handler verlangt eine Rolle", () => {
    const problems = ROUTE_FILES.filter((f) => f.startsWith("src/app/api/admin/"))
      .flatMap((f) => unguardedHandlers(f, ROLE_GUARD).map((h) => `${f}: ${h}`));
    expect(problems).toEqual([]);
  });

  it("die Fabrik der Posteingänge setzt ihre Wächter selbst", () => {
    const src = readStripped("src/lib/messages/messageInboxRoutes.ts");
    expect(src).toMatch(/requireApi\(|requireControllerApi\(/);
  });

  it("jede Ausnahme für einen /api-Pfad hat eine Route", () => {
    const sampled = [...ROUTE_FILES.map(samplePath), ...TRANSPORTS];
    const dangling = PUBLIC_ROUTES.filter((r) => r.path.startsWith("/api") && !sampled.some((s) => (r.match === "exact" ? s === r.path : s.startsWith(r.path))));
    expect(dangling.map((r) => r.path)).toEqual([]);
  });

  it("die Ausnahmen mit Begründung (GATED_BUT_OPEN) betreffen existierende Dateien", () => {
    for (const f of Object.keys(GATED_BUT_OPEN)) expect(ROUTE_FILES).toContain(f);
  });
});
