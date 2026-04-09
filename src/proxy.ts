import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// ── Rate limiter für Login-Endpunkt ──────────────────────────────────────────
const loginBucket = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 Minuten

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginBucket.get(ip);
  if (!entry || entry.resetAt < now) {
    loginBucket.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

// Cleanup abgelaufener Einträge alle 30 Min – verhindert Memory-Leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginBucket.entries()) {
    if (entry.resetAt < now) loginBucket.delete(ip);
  }
}, 30 * 60 * 1000);

export default auth((req) => {
  // Ungültige Server Action IDs (Bots/Scanner) frühzeitig abweisen
  const actionId = req.headers.get("Next-Action");
  if (actionId !== null && !/^[0-9a-f]{40}$/i.test(actionId)) {
    return new NextResponse(null, { status: 400 });
  }

  // Rate-Limit auf Login-Endpunkt
  if (req.method === "POST" && req.nextUrl.pathname === "/api/auth/callback/credentials") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Zu viele Anmeldeversuche. Bitte warte 15 Minuten." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }
  }

  const { pathname } = req.nextUrl;
  const user = req.auth?.user as { id?: string | null; role?: string } | undefined;
  const isLoggedIn = !!req.auth && !!user?.id;
  const role = user?.role;

  const isAuthRoute = pathname.startsWith("/api/auth") || pathname === "/login" || pathname === "/api/version" || pathname === "/api/portal-login";
  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/api") && !isAuthRoute);

  if ((isProtected || isAdminRoute) && !isLoggedIn) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAdminRoute && role !== "admin") {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Access-Log: nur Seiten-Aufrufe (keine API-Calls, keine statischen Assets)
  // Admin-User-Detail-Pfade (/admin/users/<id>/...) werden von der jeweiligen
  // Seite mit aufgelöstem Username geloggt.
  const isAdminUserDetailPath = /^\/admin\/users\/[a-z0-9]{20,}(\/|$)/.test(pathname);
  if (isLoggedIn && !pathname.startsWith("/api") && !isAdminUserDetailPath) {
    const user = req.auth?.user as { id?: string; name?: string } | undefined;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`[ACCESS] ${ts} | ${user?.name ?? "?"} | ${pathname} | ${ip}`);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
