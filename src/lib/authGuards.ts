import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { deviceCategoriesEnabled } from "@/lib/constants";

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

/** Returns a 404 NextResponse if the device-categories feature flag is off, else null.
 *  Mirrors `requireAdminApi()` — caller does:
 *  `const gate = deviceCategoriesGate(); if (gate) return gate;`. */
export function deviceCategoriesGate(): NextResponse | null {
  if (deviceCategoriesEnabled()) return null;
  return NextResponse.json({ error: "Device-Kategorien sind nicht aktiviert" }, { status: 404 });
}
