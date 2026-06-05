/** Shared result type for service-layer functions called by both API routes and MCP write tools.
 *  `status` is the HTTP status an API route should return on failure. */
export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
