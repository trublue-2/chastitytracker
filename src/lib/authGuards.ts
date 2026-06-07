import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";
import { isKeyholderOf } from "@/lib/keyholder";

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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
