import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { encode } from "@auth/core/jwt";
import { prisma } from "@/lib/prisma";

// One hour – tokens are max 2 min, so after 1h they are long expired anyway.
const CLEANUP_AGE_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  const portalSecret = process.env.PORTAL_SHARED_SECRET;
  if (!portalSecret) {
    return new NextResponse("Portal login not configured on this instance", { status: 503 });
  }

  // ── 1. Verify JWT signature + expiry ────────────────────────────────────────
  let jti: string;
  try {
    const secret = new TextEncoder().encode(portalSecret);
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!payload.jti) throw new Error("No JTI");
    jti = payload.jti;
  } catch {
    return new NextResponse("Invalid or expired token", { status: 401 });
  }

  // ── 2. Enforce single-use (replay protection) ───────────────────────────────
  try {
    // Prune expired tokens while we're here
    await prisma.portalTokenUsed.deleteMany({
      where: { usedAt: { lt: new Date(Date.now() - CLEANUP_AGE_MS) } },
    });
    // create() throws P2002 (unique constraint) if JTI already exists
    await prisma.portalTokenUsed.create({ data: { jti } });
  } catch {
    return new NextResponse("Token already used", { status: 401 });
  }

  // ── 3. Resolve target admin user ────────────────────────────────────────────
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    return new NextResponse("No admin user found", { status: 500 });
  }

  // ── 4. Mint a NextAuth session token ────────────────────────────────────────
  // The salt MUST match the actual session cookie name that NextAuth uses,
  // because @auth/core derives the encryption key from (NEXTAUTH_SECRET + salt).
  const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;
  const cookieName = useSecureCookies
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const sessionToken = await encode({
    token: {
      sub: admin.id,
      name: admin.username,
      role: admin.role,
      id: admin.id,
    },
    secret: process.env.NEXTAUTH_SECRET!,
    maxAge: 30 * 24 * 60 * 60, // 30 days – same as NextAuth default
    salt: cookieName,
  });

  // ── 5. Set session cookie and redirect ──────────────────────────────────────
  // Use NEXTAUTH_URL as base — req.url resolves to the internal Docker address
  // (0.0.0.0:3000) which browsers can't reach.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const response = NextResponse.redirect(new URL("/admin", base));
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}
