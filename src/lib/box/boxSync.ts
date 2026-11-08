import { timingSafeEqual, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/** Maschinen-Auth für die Heimdall-Integration: Shared-Secret-Bearer.
 *  Der Heimdall-Server ist die einzige Brücke zwischen Box und Tracker; er
 *  authentifiziert sich mit HEIMDALL_SYNC_SECRET. Konstante-Zeit-Vergleich über
 *  SHA-256 (gleicht Längen an, verhindert Timing-Leak). Kein Secret gesetzt → deny. */
function sha(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function checkBoxSyncSecret(req: NextRequest): boolean {
  const secret = process.env.HEIMDALL_SYNC_SECRET;
  if (!secret) return false;
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return timingSafeEqual(sha(m[1]), sha(secret));
}

/** Gibt eine 401-Response zurück, wenn das Secret fehlt/falsch ist — sonst null. */
export function requireBoxSync(req: NextRequest): NextResponse | null {
  if (!checkBoxSyncSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
