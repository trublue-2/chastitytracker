import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRpConfig, setChallenge, getAndDeleteChallenge } from "@/lib/webauthn";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";

/**
 * POST /api/auth/passkey/register
 * Generate registration options (challenge) for adding a new passkey.
 * Requires authenticated user.
 */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { rpId, rpName } = getRpConfig();

  // Get existing passkeys to exclude (prevents re-registration of same authenticator)
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const excludeCredentials = existingPasskeys.map((p) => ({
    id: Buffer.from(p.credentialId, "base64url"),
    type: "public-key" as const,
    transports: p.transports
      ? (JSON.parse(p.transports) as AuthenticatorTransportFuture[])
      : undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: session.user.name ?? userId,
    userID: userId,
    attestationType: "none", // We don't need attestation for this use case
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  // Store challenge for verification
  setChallenge(userId, options.challenge);

  return NextResponse.json(options);
}

/**
 * PUT /api/auth/passkey/register
 * Verify registration response and store the new passkey.
 * Body: { response, deviceName? }
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;
  const { rpId, rpOrigin } = getRpConfig();

  const body = await req.json();
  const { response, deviceName } = body;

  const expectedChallenge = getAndDeleteChallenge(userId);
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expired or not found" }, { status: 400 });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rpOrigin,
      expectedRPID: rpId,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "Verification failed" }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Store passkey in database
    await prisma.passkey.create({
      data: {
        userId,
        credentialId: Buffer.from(credentialID).toString("base64url"),
        publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
        counter,
        transports: response.response?.transports
          ? JSON.stringify(response.response.transports)
          : null,
        deviceName: deviceName || null,
      },
    });

    return NextResponse.json({ verified: true }, { status: 201 });
  } catch (err) {
    console.error("[Passkey Register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 400 });
  }
}
