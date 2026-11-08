import { NextResponse } from "next/server";
import { NATIVE_APP_ID } from "@/lib/nativePlatforms";

// Served at /.well-known/apple-app-site-association via next.config.ts rewrite.
// Tells iOS that this domain is associated with the native Capacitor app,
// enabling WebAuthn/Passkeys in the WKWebView.
export async function GET() {
  const teamId = process.env.APNS_TEAM_ID ?? "C4RN29TT3H";
  const bundleId = process.env.APNS_BUNDLE_ID ?? NATIVE_APP_ID;

  return NextResponse.json(
    {
      webcredentials: {
        apps: [`${teamId}.${bundleId}`],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
