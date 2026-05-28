import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getClient, clientAllowsRedirect, createAuthorizationCode, scopesValid } from "@/lib/oauth";

/**
 * GET /api/oauth/authorize
 * Validates the authorization request and redirects to the consent UI page.
 * The actual consent form lives at /oauth/authorize (a Next.js page).
 * This route only validates parameters so the page can trust them.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const scope = searchParams.get("scope") ?? "read";
  const state = searchParams.get("state") ?? "";
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");

  function errorRedirect(error: string, description: string) {
    if (!redirectUri) {
      return NextResponse.json({ error, error_description: description }, { status: 400 });
    }
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return NextResponse.redirect(url.toString());
  }

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id and redirect_uri are required" }, { status: 400 });
  }
  if (responseType !== "code") return errorRedirect("unsupported_response_type", "Only 'code' is supported");
  if (!codeChallenge) return errorRedirect("invalid_request", "code_challenge is required (PKCE)");
  if (codeChallengeMethod !== "S256") return errorRedirect("invalid_request", "code_challenge_method must be S256");

  const scopes = scope.split(" ").filter(Boolean);
  if (!scopesValid(scopes)) return errorRedirect("invalid_scope", "Unsupported scope requested");

  const client = await getClient(clientId);
  if (!client) return errorRedirect("invalid_client", "Unknown client_id");
  if (!clientAllowsRedirect(client, redirectUri)) return errorRedirect("invalid_redirect_uri", "redirect_uri not registered");

  // Redirect to consent page. Behind Traefik req.nextUrl.origin is the internal bind address
  // (0.0.0.0:3000) — reconstruct the public origin from forwarded headers instead.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",").at(-1)?.trim() ?? "https";
  const consentUrl = new URL("/oauth/authorize", `${proto}://${host}`);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("redirect_uri", redirectUri);
  consentUrl.searchParams.set("scope", scopes.join(" "));
  consentUrl.searchParams.set("state", state);
  consentUrl.searchParams.set("code_challenge", codeChallenge);
  consentUrl.searchParams.set("client_name", client.clientName);
  return NextResponse.redirect(consentUrl.toString());
}

/**
 * POST /api/oauth/authorize
 * Called by the consent form when the user clicks "Erlauben".
 * Requires an active session — the user must be logged in.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, string>;
  try {
    body = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { client_id: clientId, redirect_uri: redirectUri, scope, state, code_challenge: codeChallenge } = body;

  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const client = await getClient(clientId);
  if (!client || !clientAllowsRedirect(client, redirectUri)) {
    return NextResponse.json({ error: "invalid_client" }, { status: 400 });
  }

  const scopes = (scope ?? "read").split(" ").filter(Boolean);
  if (!scopesValid(scopes)) {
    return NextResponse.json({ error: "invalid_scope" }, { status: 400 });
  }

  const code = await createAuthorizationCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    scopes,
    codeChallenge,
  });

  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);
  return NextResponse.redirect(callbackUrl.toString());
}
