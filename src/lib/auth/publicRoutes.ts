/**
 * Die Pfade, die das Proxy-Gate (`src/proxy.ts`) NICHT hinter die Session stellt — an EINER Stelle.
 *
 * **Warum eine eigene Datei:** `proxy.ts` schützt standardmässig `/dashboard` und alles unter
 * `/api`; nur was hier steht, ist ausgenommen. Eine Ausnahme ist ein Loch, das jemand mit Absicht
 * gebohrt hat — also muss sie einen Grund und die Art ihres EIGENEN Schutzes tragen, sonst ist sie
 * beim nächsten Lesen nicht von einem Versehen zu unterscheiden. `publicRoutes.test.ts` und
 * `routeInventory.test.ts` halten diese Liste gegen den Baum: eine neue Route unter einem
 * ausgenommenen Pfad muss dort einzeln begründet werden.
 *
 * Bewusst **importfrei** (per Test abgesichert): der Proxy und die Tests lesen sie.
 */

/** Womit sich eine ausgenommene Route selbst schützt (oder warum sie offen sein darf). */
export type PublicGuard =
  | "nextauth" // Auth.js-Handler (Login/Session/CSRF) bzw. Anmelde-Hilfen mit eigener Prüfung
  | "session-self" // prüft die Session selbst (requireApi/auth()), Proxy-Ausnahme aus Pfad-Gründen
  | "token" // einmaliges Token (Passwort-Reset, Portal-JWT)
  | "bearer-token" // OAuth-Bearer (withMcpAuth)
  | "box-secret" // geteiltes Geheimnis der LockMeBox-Brücke
  | "webhook-secret" // Secret-Header des Absenders
  | "oauth" // OAuth-Protokoll-Endpunkt, schützt sich über Client/Code/Token
  | "public-info"; // enthält nichts Schützenswertes

export interface PublicRoute {
  /** `exact`: gleicher Pfad. `prefix`: `pathname.startsWith(path)` — der Pfad trägt dann den Schrägstrich, wo die Ausnahme nur Unterpfade meint. */
  match: "exact" | "prefix";
  path: string;
  guard: PublicGuard;
  reason: string;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  // `/api/auth` OHNE Schrägstrich: so stand es im Proxy, Verhalten bleibt byte-identisch.
  { match: "prefix", path: "/api/auth", guard: "nextauth", reason: "Auth.js-Handler, Passwort-Reset, Sperr-Abfrage, Passkey-Anmeldung — Anmelden geht nur ohne Session; die Passkey-Verwaltung prüft die Session selbst" },
  { match: "exact", path: "/login", guard: "public-info", reason: "Anmeldeseite; angemeldete Nutzer leitet der Proxy weiter" },
  { match: "exact", path: "/api/version", guard: "public-info", reason: "Version und Build-Datum, wie /info" },
  { match: "exact", path: "/api/heartbeat", guard: "session-self", reason: "Erreichbarkeits-Probe; liest die Session selbst und antwortet ohne sie ohne Nutzdaten" },
  { match: "exact", path: "/api/upstream-changelog", guard: "public-info", reason: "öffentlicher Changelog des Projekts (Update-Hinweis)" },
  { match: "exact", path: "/api/portal-login", guard: "token", reason: "Portal-Anmeldung per signiertem JWT mit Replay-Schutz" },
  { match: "exact", path: "/api/mcp", guard: "bearer-token", reason: "MCP-Transport; jede Anfrage trägt ein OAuth-Bearer (withMcpAuth)" },
  { match: "exact", path: "/api/sse", guard: "bearer-token", reason: "Alter MCP-Transportname; mcp-handler 2 antwortet 405, die Ausnahme bleibt wie bei /api/mcp" },
  { match: "exact", path: "/api/message", guard: "bearer-token", reason: "Alter MCP-Transportname; mcp-handler 2 antwortet 405, die Ausnahme bleibt wie bei /api/mcp" },
  { match: "prefix", path: "/api/integration/", guard: "box-secret", reason: "LockMeBox-Brücke: Shared-Secret (requireBoxSync), keine Session" },
  { match: "exact", path: "/api/telegram/webhook", guard: "webhook-secret", reason: "Telegram ruft an; gesichert über den secret_token-Header" },
  { match: "prefix", path: "/api/oauth/", guard: "oauth", reason: "OAuth-Endpunkte: Clients rufen sie direkt auf, geschützt über Client/Code/Token und Rate-Limit" },
  { match: "prefix", path: "/.well-known/", guard: "public-info", reason: "Metadaten für OAuth-Discovery und Apple-Passkeys, ohne Nutzdaten" },
  { match: "prefix", path: "/oauth/", guard: "oauth", reason: "Consent-Seite; leitet selbst auf /login, wenn keine Session besteht" },
];

/** Steht dieser Pfad auf der Ausnahmeliste? Genau das, was der Proxy früher als `isAuthRoute` inline rechnete. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((r) => (r.match === "exact" ? pathname === r.path : pathname.startsWith(r.path)));
}
