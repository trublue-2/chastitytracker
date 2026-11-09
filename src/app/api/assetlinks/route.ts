import { NextResponse } from "next/server";
import { NATIVE_APP_ID } from "@/lib/nativePlatforms";
import { androidCertFingerprints } from "@/lib/webauthn";

// Served at /.well-known/assetlinks.json via next.config.ts rewrite — das Android-Gegenstück zur
// apple-app-site-association. Es erklärt die Android-App zur Vertreterin dieser Domain, damit
// Passkeys in ihrer WebView funktionieren (`MainActivity`: WebAuthn im App-Modus).
//
// Hier gebraucht von Self-Hostern, deren RP-ID die eigene Instanz ist. Portal-Instanzen melden
// Passkeys mit der Basis-Domain; deren assetlinks.json liefert das Portal (gleiche Route dort).
//
// `ANDROID_CERT_SHA256`: Fingerabdruck des Signatur-Zertifikats (öffentlich, kommagetrennt). Ohne
// ihn eine leere Liste — keine Zuordnung statt einer falschen.
export async function GET() {
  const packageName = process.env.ANDROID_PACKAGE ?? NATIVE_APP_ID;
  const fingerprints = androidCertFingerprints();

  const statements = fingerprints.length === 0 ? [] : [{
    relation: ["delegate_permission/common.get_login_creds"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
  }];

  return NextResponse.json(statements, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
