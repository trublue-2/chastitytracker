import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { timingSafeEqual, createHash } from "crypto";
import { z } from "zod";
import { buildOverview, listSessions, listEntries, mcpStrafbuch } from "@/lib/mcpOverview";
import { verifyAccessToken } from "@/lib/oauth";
import { VALID_TYPES } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Resolves MCP_USERNAME, runs the aggregator, and wraps the result as a tool response.
 *  Centralizes the misconfig check + error handling shared by all tools. */
async function runTool<T>(label: string, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  const username = process.env.MCP_USERNAME;
  if (!username) {
    return { content: [{ type: "text", text: "Server misconfigured: MCP_USERNAME is not set." }], isError: true };
  }
  try {
    const data = await fn(username);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `${label} failed: ${(e as Error).message}` }], isError: true };
  }
}

/** Read-only MCP server. Exposes tools so an AI assistant can query the tracker state and
 *  propose measures. Gated behind ENABLE_MCP + a static bearer token (MCP_TOKEN); all data
 *  is for the user named in MCP_USERNAME. */
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "get_overview",
      {
        title: "Get tracker overview",
        description:
          "Returns a read-only snapshot of the chastity-tracker state: lock status and duration, " +
          "KG wearing hours (today/week/month), active training goal with progress, open control " +
          "requests, active lock periods, session statistics, recorded penalties and active wear " +
          "sessions. Use this to reason about the user's current situation and propose measures.",
        inputSchema: {},
      },
      () => runTool("get_overview", buildOverview),
    );

    server.registerTool(
      "list_sessions",
      {
        title: "List completed sessions",
        description:
          "Returns completed (closed) sessions — KG lock sessions and non-KG wear sessions — " +
          "newest first, each with category, device, start/end time and duration. Use for " +
          "history beyond the live snapshot of get_overview.",
        inputSchema: {
          category: z.string().optional().describe('Filter: "KG" or a category name (e.g. "Plug"). Omit for all categories.'),
          limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 20)."),
        },
      },
      (args) => runTool("list_sessions", (username) => listSessions(username, args)),
    );

    server.registerTool(
      "list_entries",
      {
        title: "List raw entries (full detail)",
        description:
          "Returns the raw entry timeline with ALL per-entry detail needed to understand the " +
          "full situation: each entry's type, timestamp, free-text note/comment, opening reason " +
          "(oeffnenGrund), orgasm type (orgasmusArt), control code, verification status, device, " +
          "whether a photo exists (+ its EXIF capture time) and whether the time was back-/post-dated. " +
          "Newest first. Use this for the narrative context that the aggregate tools (get_overview, " +
          "list_sessions, get_strafbuch) leave out.",
        inputSchema: {
          type: z.enum(VALID_TYPES).optional().describe("Filter by entry type. Omit for all types."),
          limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
        },
      },
      (args) => runTool("list_entries", (username) => listEntries(username, args)),
    );

    server.registerTool(
      "get_strafbuch",
      {
        title: "Get penalty book (Strafbuch)",
        description:
          "Returns the Strafbuch: system-detected offenses — unauthorized openings during a " +
          "lock period, late and rejected control submissions, and cleaning-limit violations — " +
          "each (where applicable) flagged whether it has already been marked as punished. " +
          "Use to reason about outstanding misconduct and propose consequences.",
        inputSchema: {},
      },
      () => runTool("get_strafbuch", mcpStrafbuch),
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

/** Constant-time bearer-token comparison — avoids timing side-channels on MCP_TOKEN.
 *  Compares SHA-256 digests so the comparison is always fixed-length regardless of
 *  the token length (eliminates the truncation risk of a pad-and-slice approach). */
function tokenMatches(token: string, expected: string): boolean {
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verifies an incoming MCP bearer token.
 * Priority:
 *   1. OAuth access token (issued via /api/oauth/token) — preferred, supports mobile
 *   2. Static MCP_TOKEN env var — legacy fallback for Claude Desktop config
 */
const verifyToken = async (_req: Request, token?: string) => {
  if (!token) return undefined;

  // 1. OAuth access token
  const oauthRecord = await verifyAccessToken(token);
  if (oauthRecord) {
    return { token, scopes: oauthRecord.scopes.split(" "), clientId: oauthRecord.clientId };
  }

  // 2. Static bearer token fallback
  const expected = process.env.MCP_TOKEN;
  if (expected && tokenMatches(token, expected)) {
    return { token, scopes: ["read"], clientId: "mcp-client" };
  }

  return undefined;
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

/** Gate the whole endpoint behind ENABLE_MCP — disabled instances return 404. */
function gated(h: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (process.env.ENABLE_MCP !== "true") return new Response("Not Found", { status: 404 });
    return h(req);
  };
}

export const GET = gated(authHandler);
export const POST = gated(authHandler);
