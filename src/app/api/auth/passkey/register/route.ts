import { NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { prisma } from "@/lib/prisma";
import { getRpConfig, setChallenge, getAndDeleteChallenge } from "@/lib/webauthn";
import { generateRegistrationOptions, verifyRegistrationResponse, type AuthenticatorTransport } from "@simplewebauthn/server";

/**
 * POST /api/auth/passkey/register
 * Generate registration options (challenge) for adding a new passkey.
 * Requires authenticated user.
 */
export async function POST() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const userId = session.user.id;
  const { rpId, rpName } = getRpConfig();

  // Get existing passkeys to exclude (prevents re-registration of same authenticator)
  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  const excludeCredentials = existingPasskeys.map((p) => ({
    id: p.credentialId,
    transports: p.transports
      ? (JSON.parse(p.transports) as AuthenticatorTransport[])
      : undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID: rpId,
    userName: session.user.name ?? userId,
    // Dieselben UTF-8-Bytes wie vor v14 (dort wandelte die Bibliothek den String selbst): der
    // User-Handle bestehender Passkeys bleibt gleich.
    userID: new TextEncoder().encode(userId),
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
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

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

    const { credential } = verification.registrationInfo;

    // Store passkey in database
    await prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
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
