import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";

/**
 * Upstream inbox at the project portal. Self-hosters can override with
 * FEEDBACK_UPSTREAM_URL or disable forwarding entirely with DISABLE_FEEDBACK=true.
 */
const DEFAULT_UPSTREAM_URL = "https://portal.chastitytracker.ch/api/app-feedback";

const VALID_TYPES = ["BUG", "IDEA", "QUESTION", "THANKS"] as const;
const VALID_PLATFORMS = ["web", "ios", "android"] as const;
const MAX_MESSAGE_LEN = 2000;
const MAX_URL_LEN = 500;
const MAX_EMAIL_LEN = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  // Feature toggle comes first — if disabled, pretend the route doesn't exist
  // without even consulting the session layer.
  if (process.env.DISABLE_FEEDBACK === "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const { type, message, contactEmail, currentUrl, platform, clientLocale } = body ?? {};

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Ungültiger Typ" }, { status: 400 });
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Nachricht fehlt" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json({ error: `Nachricht zu lang (max. ${MAX_MESSAGE_LEN} Zeichen)` }, { status: 400 });
  }
  if (contactEmail && (typeof contactEmail !== "string" || contactEmail.length > MAX_EMAIL_LEN || !EMAIL_RE.test(contactEmail))) {
    return NextResponse.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
  }
  if (currentUrl && (typeof currentUrl !== "string" || currentUrl.length > MAX_URL_LEN)) {
    return NextResponse.json({ error: "URL ungültig" }, { status: 400 });
  }
  if (platform && !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Plattform ungültig" }, { status: 400 });
  }

  // App version from package.json — runtime import so it's always current
  const { default: pkg } = await import("../../../../package.json");
  const appVersion = pkg.version;

  // Prepend this instance's base URL to currentUrl so the receiving portal
  // can distinguish submissions from different tracker deployments. Without
  // the hostname, all feedbacks look like they come from the same source.
  const instanceBase = (process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
  const path = currentUrl?.trim() || "/";
  const fullUrl = instanceBase
    ? (path.startsWith("http") ? path : `${instanceBase}${path.startsWith("/") ? path : `/${path}`}`)
    : path;

  try {
    const upstream = await fetch(process.env.FEEDBACK_UPSTREAM_URL || DEFAULT_UPSTREAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        message: message.trim(),
        contactEmail: contactEmail?.trim() || null,
        currentUrl: fullUrl,
        appVersion,
        platform: platform ?? "web",
        clientLocale: clientLocale ?? null,
      }),
      // Keep the request quick — don't block the user's UI on upstream latency.
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "Feedback konnte nicht gesendet werden" }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Feedback konnte nicht gesendet werden" }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
