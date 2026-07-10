import { NextResponse } from "next/server";

/** Shared result type for service-layer functions called by both API routes and MCP write tools.
 *  `status` is the HTTP status an API route should return on failure. */
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Maps a ServiceResult onto the API-route response: `{ok:true}` — or the service's error code with
 *  its HTTP status. Ohne diese Auswertung meldet eine abgelehnte Änderung dem Client Erfolg. */
export function serviceResponse(result: ServiceResult<unknown>): NextResponse {
  return result.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
