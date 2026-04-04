import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRpConfig, setChallenge, getAndDeleteChallenge } from "@/lib/webauthn";
import { generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import crypto from "crypto";

// Temporary token store for passkey-to-credentials bridge.
// Token is consumed by the Credentials provider to create a session.
const passkeyTokens = new Map<string, { userId: string; expiresAt: number }>();

const TOKEN_TTL = 60_000; // 1 minute

/** Called by Credentials provider to validate a passkey token */
export function consumePasskeyToken(token: string): string | null {
  const entry = passkeyTokens.get(token);
  if (!entry) return null;
  passkeyTokens.delete(token);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

/**
 * POST /api/auth/passkey/authenticate
 * Generate authentication options (challenge).
 * No auth required — this is the login flow.
 */
export async function POST() {
  const { rpId } = getRpConfig();

  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
    // Empty allowCredentials = discoverable credential / resident key flow
  });

  // Store challenge keyed by challenge value (no userId known yet for discoverable credentials)
  setChallenge(`auth:${options.challenge}`, options.challenge);

  return NextResponse.json(options);
}

/**
 * PUT /api/auth/passkey/authenticate
 * Verify authentication response and return a one-time token
 * that the client can use with signIn("credentials", { passkeyToken }).
 * Body: { response }
 */
export async function PUT(req: Request) {
  const { rpId, rpOrigin } = getRpConfig();
  const body = await req.json();
  const { response } = body;

  if (!response?.id) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  }

  // Find the passkey by credential ID
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: response.id },
    include: { user: { select: { id: true, username: true, role: true } } },
  });

  if (!passkey) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 400 });
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (c: string) => {
        // Accept any recent challenge we stored (discoverable credential flow)
        const stored = getAndDeleteChallenge(`auth:${c}`);
        return stored !== null;
      },
      expectedOrigin: rpOrigin,
      expectedRPID: rpId,
      authenticator: {
        credentialID: Uint8Array.from(Buffer.from(passkey.credentialId, "base64url")),
        credentialPublicKey: Uint8Array.from(Buffer.from(passkey.publicKey, "base64url")),
        counter: passkey.counter,
        transports: passkey.transports
          ? (JSON.parse(passkey.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    // Update counter and lastUsedAt
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    // Generate one-time token for the Credentials provider bridge
    const token = crypto.randomBytes(32).toString("hex");
    passkeyTokens.set(token, {
      userId: passkey.userId,
      expiresAt: Date.now() + TOKEN_TTL,
    });

    // Cleanup expired tokens
    if (passkeyTokens.size > 50) {
      const now = Date.now();
      for (const [k, v] of passkeyTokens) {
        if (v.expiresAt < now) passkeyTokens.delete(k);
      }
    }

    return NextResponse.json({
      verified: true,
      token,
      username: passkey.user.username,
    });
  } catch (err) {
    console.error("[Passkey Authenticate]", err);
    return NextResponse.json({ error: "Authentication failed" }, { status: 400 });
  }
}
