import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClient, consumeAuthorizationCode, createAccessToken, verifyPkceS256, OAUTH_TOKEN_TTL_MS, pruneExpiredOAuthRecords } from "@/lib/oauth";

/**
 * POST /api/oauth/token
 * Authorization Code → Access Token exchange (RFC 6749 §4.1.3).
 * Validates PKCE S256 code_verifier against the stored code_challenge.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const rl = await checkRateLimit(`oauth-token:${ip}`, 30, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // Accept both application/x-www-form-urlencoded and application/json
  let params: Record<string, string>;
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      params = await req.json() as Record<string, string>;
    } else {
      params = Object.fromEntries(await req.formData()) as Record<string, string>;
    }
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "Unable to parse request body" }, { status: 400 });
  }

  const { grant_type, code, redirect_uri, client_id: clientId, code_verifier: codeVerifier } = params;

  if (grant_type !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }
  if (!code || !redirect_uri || !clientId || !codeVerifier) {
    return NextResponse.json({ error: "invalid_request", error_description: "Missing required parameters" }, { status: 400 });
  }

  const client = await getClient(clientId);
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  const record = await consumeAuthorizationCode(code, clientId, redirect_uri);
  if (!record) {
    return NextResponse.json({ error: "invalid_grant", error_description: "Code is invalid, expired, or already used" }, { status: 400 });
  }

  if (record.codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_grant", error_description: "Unsupported code_challenge_method" }, { status: 400 });
  }
  if (!verifyPkceS256(codeVerifier, record.codeChallenge)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, { status: 400 });
  }

  const scopes = record.scopes.split(" ").filter(Boolean);
  const accessToken = await createAccessToken(clientId, record.userId, scopes);

  // Lazy cleanup — prune expired codes and tokens on every successful exchange (fire-and-forget).
  pruneExpiredOAuthRecords().catch(() => {});

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(OAUTH_TOKEN_TTL_MS / 1000),
    scope: record.scopes,
  });
}
