import { NextResponse } from "next/server";
import { OAUTH_SUPPORTED_SCOPES, OAUTH_SUPPORTED_GRANT_TYPES, OAUTH_CODE_CHALLENGE_METHODS } from "@/lib/oauth";

/**
 * GET /.well-known/oauth-authorization-server
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 * Required by the MCP spec so clients can auto-discover endpoints.
 */
export async function GET(req: Request) {
  // Behind Traefik the internal URL is 0.0.0.0:3000 — use forwarded headers for the public origin.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",").at(-1)?.trim() ?? "https";
  const base = `${proto}://${host}`;
  return NextResponse.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    scopes_supported: [...OAUTH_SUPPORTED_SCOPES],
    response_types_supported: ["code"],
    grant_types_supported: [...OAUTH_SUPPORTED_GRANT_TYPES],
    code_challenge_methods_supported: [...OAUTH_CODE_CHALLENGE_METHODS],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
