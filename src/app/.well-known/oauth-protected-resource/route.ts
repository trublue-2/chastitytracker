import { NextResponse } from "next/server";
import { generateProtectedResourceMetadata } from "mcp-handler";
import { OAUTH_SUPPORTED_SCOPES, publicBaseFromHeaders } from "@/lib/oauth";

/**
 * GET /.well-known/oauth-protected-resource
 * OAuth 2.0 Protected Resource Metadata (RFC 9728). Die neuere MCP-Auth-Spec trennt Resource- und
 * Authorization-Server: der Client entdeckt hierüber, welcher Authorization-Server diese Resource
 * absichert. Fehlt das, fällt der Client (je nach Version) auf Re-Auth zurück.
 *
 * Resource- und Authorization-Server sind hier dieselbe Origin; der Issuer ist dynamisch (pro
 * Subdomain) — daher pro Request aus den Forwarded-Headers abgeleitet, konsistent zur AS-Metadata.
 */
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" };

export function GET(req: Request) {
  const base = publicBaseFromHeaders(req);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [base],
    resourceUrl: base,
    additionalMetadata: { scopes_supported: [...OAUTH_SUPPORTED_SCOPES] },
  });
  return NextResponse.json(metadata, { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
