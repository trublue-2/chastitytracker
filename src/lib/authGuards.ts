import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

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
