import { NextRequest, NextResponse } from "next/server";
import { registerClient, OAUTH_SUPPORTED_SCOPES } from "@/lib/oauth";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/oauth/register
 * Dynamic Client Registration (RFC 7591).
 * Called automatically by Claude Desktop / Claude Mobile on first connection.
 * No auth required — rate-limited by IP.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const rl = await checkRateLimit(`oauth-register:${ip}`, 20, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "Invalid JSON" }, { status: 400 });
  }

  const clientName = typeof body.client_name === "string" && body.client_name.trim()
    ? body.client_name.trim()
    : "Unknown Client";

  // Validate redirect URIs
  const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const redirectUris: string[] = [];
  for (const uri of rawUris) {
    if (typeof uri !== "string") continue;
    try {
      const parsed = new URL(uri);
      const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isHttps = parsed.protocol === "https:";
      // Allow custom app schemes (e.g. claude://) — explicitly block dangerous schemes
      const isDangerousScheme = ["http:", "javascript:", "data:", "file:", "ftp:", "blob:"].includes(parsed.protocol);
      const isCustomScheme = !isDangerousScheme && !isHttps;
      if (isHttps || isLocalhost || isCustomScheme) {
        redirectUris.push(uri);
      }
    } catch {
      // skip invalid URIs
    }
  }

  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "At least one valid redirect_uri is required" },
      { status: 400 }
    );
  }

  const client = await registerClient({ clientName, redirectUris });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      scope: OAUTH_SUPPORTED_SCOPES.join(" "),
      token_endpoint_auth_method: "none",
    },
    { status: 201 }
  );
}
