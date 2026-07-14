import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { isKeyholderOf } from "@/lib/keyholder";

/** A session that is guaranteed to carry a user id (what `requireApi` hands back).
 *  `Session` (not `ReturnType<typeof auth>`) — `auth` is overloaded and would resolve to the
 *  middleware signature. Die `user.id`/`user.role`-Felder kommen aus src/types/next-auth.d.ts. */
export type ApiSession = Session;

/**
 * Plain-user API guard — the counterpart to `requireAdminApi()` for routes that only need "somebody
 * is logged in". Returns the session on success, so the caller needs no second `auth()` call:
 *
 *   const session = await requireApi();
 *   if (session instanceof NextResponse) return session;
 *   // session is narrowed to ApiSession here
 *
 * Deliberately NOT used by `oauth/authorize` (returns the RFC-6749 lowercase `unauthorized` code
 * its clients string-match) nor by `uploads/[...path]` (answers in plaintext, not JSON).
 */
export async function requireApi(): Promise<ApiSession | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}

/** Returns a 403 NextResponse if the current session is not an admin, otherwise null. */
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Redirects to /login if the current session is not an admin. For use in page components. */
export async function assertAdmin(): Promise<void> {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/login");
}

/** API guard: allows a global admin OR a keyholder of `targetUserId`. Self-control is impossible
 *  (isKeyholderOf rejects actor === target). Returns a 401/403 NextResponse on denial, else null. */
export async function requireKeyholderOrAdminApi(targetUserId: string): Promise<NextResponse | null> {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (session.user.role === "admin") return null;
  if (await isKeyholderOf(session.user.id, targetUserId)) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Page guard: returns the actor's id + whether they are a global admin if they are admin or
 *  keyholder of `targetUserId`, else redirects. Returning isGlobalAdmin lets callers gate
 *  admin-only UI without a second `auth()` call. */
export async function assertKeyholderOrAdmin(targetUserId: string): Promise<{ userId: string; isGlobalAdmin: boolean }> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const isGlobalAdmin = session.user.role === "admin";
  if (isGlobalAdmin || (await isKeyholderOf(session.user.id, targetUserId))) {
    return { userId: session.user.id, isGlobalAdmin };
  }
  redirect("/dashboard");
}

/** Returns a 404 NextResponse if the device-categories feature flag is off, else null.
 *  Mirrors `requireAdminApi()` — caller does:
 *  `const gate = deviceCategoriesGate(); if (gate) return gate;`. */
export function deviceCategoriesGate(): NextResponse | null {
  if (deviceCategoriesEnabled()) return null;
  return NextResponse.json({ error: "Device-Kategorien sind nicht aktiviert" }, { status: 404 });
}
