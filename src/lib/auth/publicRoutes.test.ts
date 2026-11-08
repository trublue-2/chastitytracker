import { describe, it, expect } from "vitest";
import { PUBLIC_ROUTES, isPublicPath } from "./publicRoutes";
import { expectImportFree } from "@/test/importFree";

/** Die Bedingung, wie `proxy.ts` sie vor der Auslagerung inline trug — das Orakel für „byte-identisch". */
const legacyIsAuthRoute = (pathname: string) =>
  pathname.startsWith("/api/auth") || pathname === "/login" || pathname === "/api/version" || pathname === "/api/heartbeat" || pathname === "/api/upstream-changelog" || pathname === "/api/portal-login"
  || pathname === "/api/mcp" || pathname === "/api/sse" || pathname === "/api/message"
  || pathname.startsWith("/api/integration/")
  || pathname === "/api/telegram/webhook"
  || pathname.startsWith("/api/oauth/") || pathname.startsWith("/.well-known/") || pathname.startsWith("/oauth/");

const PROBES = [
  "/", "/login", "/login/x", "/dashboard", "/admin", "/api", "/api/entries", "/api/auth", "/api/authx", "/api/auth/session",
  "/api/auth/callback/credentials", "/api/version", "/api/version/x", "/api/heartbeat", "/api/upstream-changelog",
  "/api/portal-login", "/api/mcp", "/api/mcp/x", "/api/sse", "/api/message", "/api/integration", "/api/integration/box/status",
  "/api/telegram/webhook", "/api/telegram", "/api/oauth", "/api/oauth/token", "/oauth", "/oauth/authorize",
  "/.well-known/oauth-protected-resource", "/.well-known", "/api/uploads/a.jpg", "/api/admin/users", "/api/push/subscribe",
];

describe("publicRoutes", () => {
  it("entscheidet für jeden Probe-Pfad wie die frühere Inline-Bedingung im Proxy", () => {
    for (const p of PROBES) expect({ p, v: isPublicPath(p) }).toEqual({ p, v: legacyIsAuthRoute(p) });
  });

  it("jeder Eintrag trägt Grund und Schutzart", () => {
    for (const r of PUBLIC_ROUTES) {
      expect(r.reason.length, r.path).toBeGreaterThan(15);
      expect(r.guard, r.path).toBeTruthy();
    }
  });

  it("ist importfrei (Proxy und Tests lesen sie)", () => {
    expectImportFree("src/lib/auth/publicRoutes.ts");
  });

  it("hat keine doppelten Pfade", () => {
    const paths = PUBLIC_ROUTES.map((r) => `${r.match}:${r.path}`);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
