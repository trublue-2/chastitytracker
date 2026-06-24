import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { revokeToken } from "@/lib/oauth";

/**
 * POST /api/oauth/revoke
 * OAuth 2.0 Token Revocation (RFC 7009). Widerruft einen Access- oder Refresh-Token. Damit ist der
 * langlebige (nicht-rotierende) Refresh-Token tatsächlich widerrufbar — z.B. wenn der Client den
 * Connector entfernt oder ein Token kompromittiert ist.
 *
 * RFC 7009: Der Server antwortet IMMER mit 200, auch wenn der Token unbekannt/bereits abgelaufen ist
 * (kein Token-Status-Leak).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
  const rl = await checkRateLimit(`oauth-revoke:${ip}`, 30, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  let params: Record<string, string>;
  const ct = req.headers.get("content-type") ?? "";
  try {
    params = ct.includes("application/json")
      ? (await req.json() as Record<string, string>)
      : (Object.fromEntries(await req.formData()) as Record<string, string>);
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // token_type_hint wird ignoriert — revokeToken prüft ohnehin beide Tabellen per Hash.
  if (params.token) await revokeToken(params.token);
  return new NextResponse(null, { status: 200 });
}
