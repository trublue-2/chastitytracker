import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// ── Constants ────────────────────────────────────────────────────────────────

export const OAUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OAUTH_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour (access token — silently renewed via refresh)
export const OAUTH_REFRESH_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year (refresh token, non-rotating)
export const OAUTH_SUPPORTED_SCOPES = ["read"] as const;
export const OAUTH_SUPPORTED_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
export const OAUTH_CODE_CHALLENGE_METHODS = ["S256"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a cryptographically random URL-safe token string. */
export function generateToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

/** SHA-256 hex digest — used to store tokens without plaintext. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Public Origin hinter Traefik (X-Forwarded-Host/Proto) — geteilt von den .well-known-Metadata-
 *  Routen, damit Issuer/Resource konsistent abgeleitet werden. */
export function publicBaseFromHeaders(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",").at(-1)?.trim() ?? "https";
  return `${proto}://${host}`;
}

/** Verifies a PKCE S256 code verifier against a stored challenge.
 *  challenge = BASE64URL(SHA256(verifier)) */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const expected = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Returns true if all requested scopes are within the supported set. */
export function scopesValid(scopes: string[]): boolean {
  return scopes.every((s) =>
    (OAUTH_SUPPORTED_SCOPES as readonly string[]).includes(s)
  );
}

// ── Client registration ──────────────────────────────────────────────────────

export interface RegisterClientInput {
  clientName: string;
  redirectUris: string[];
}

export async function registerClient(input: RegisterClientInput) {
  const clientId = generateToken(16);
  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientName: input.clientName,
      redirectUris: JSON.stringify(input.redirectUris),
    },
  });
  return client;
}

export async function getClient(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { clientId } });
}

export function clientAllowsRedirect(client: { redirectUris: string }, uri: string): boolean {
  const allowed: string[] = JSON.parse(client.redirectUris);
  return allowed.includes(uri);
}

// ── Authorization codes ──────────────────────────────────────────────────────

export interface CreateCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
}

export async function createAuthorizationCode(input: CreateCodeInput): Promise<string> {
  const code = generateToken(32);
  await prisma.oAuthCode.create({
    data: {
      code,
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scopes: input.scopes.join(" "),
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
    },
  });
  return code;
}

/** Retrieves and atomically marks the code as used (single-use).
 *  Uses a conditional updateMany so concurrent requests cannot both succeed.
 *  Returns null if the code is invalid, expired, already used, or the client/redirect don't match. */
export async function consumeAuthorizationCode(code: string, clientId: string, redirectUri: string) {
  const now = new Date();
  // Single atomic write: only succeeds if the code exists, matches, is unused, and not expired.
  const result = await prisma.oAuthCode.updateMany({
    where: { code, clientId, redirectUri, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (result.count === 0) return null;
  return prisma.oAuthCode.findUnique({ where: { code } });
}

// ── Access tokens ────────────────────────────────────────────────────────────

export async function createAccessToken(clientId: string, userId: string, scopes: string[]): Promise<string> {
  const raw = generateToken(32);
  const tokenHash = hashToken(raw);
  await prisma.oAuthToken.create({
    data: {
      tokenHash,
      clientId,
      userId,
      scopes: scopes.join(" "),
      expiresAt: new Date(Date.now() + OAUTH_TOKEN_TTL_MS),
    },
  });
  return raw;
}

/** Looks up a token by its hash. Returns the record if valid (not expired), else null. */
export async function verifyAccessToken(raw: string) {
  const tokenHash = hashToken(raw);
  const record = await prisma.oAuthToken.findUnique({ where: { tokenHash } });
  if (!record) return null;
  if (record.expiresAt < new Date()) return null;
  return record;
}

// ── Refresh tokens (non-rotating, RFC 6749 §6) ────────────────────────────────

/** Issues a long-lived, reusable refresh token for silent access-token renewal. */
export async function createRefreshToken(clientId: string, userId: string, scopes: string[]): Promise<string> {
  const raw = generateToken(32);
  await prisma.oAuthRefreshToken.create({
    data: { tokenHash: hashToken(raw), clientId, userId, scopes: scopes.join(" "), expiresAt: new Date(Date.now() + OAUTH_REFRESH_TTL_MS) },
  });
  return raw;
}

/** Looks up a refresh token by hash. Returns the record if valid (not expired), else null. */
export async function verifyRefreshToken(raw: string) {
  const record = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!record) return null;
  if (record.expiresAt < new Date()) return null;
  return record;
}

/** Widerruft ein Token (RFC 7009): löscht den passenden Access- ODER Refresh-Token per Hash.
 *  Idempotent — unbekannte Tokens sind ein No-op (RFC 7009 verlangt 200 unabhängig vom Treffer). */
export async function revokeToken(raw: string): Promise<void> {
  const tokenHash = hashToken(raw);
  await Promise.all([
    prisma.oAuthToken.deleteMany({ where: { tokenHash } }),
    prisma.oAuthRefreshToken.deleteMany({ where: { tokenHash } }),
  ]);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/** Deletes expired codes and tokens. Call from a background job or on-demand.
 *  Note: used-but-unexpired codes are intentionally retained until their TTL elapses
 *  to prevent replay attacks (the usedAt check happens before expiry check). */
export async function pruneExpiredOAuthRecords(): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oAuthToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oAuthRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
}
