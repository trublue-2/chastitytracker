import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { timingSafeEqual } from "crypto";
import { buildOverview } from "@/lib/mcpOverview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only MCP server. Exposes a single `get_overview` tool so an AI assistant can
 *  query the tracker state and propose measures. Gated behind ENABLE_MCP + a static
 *  bearer token (MCP_TOKEN); the snapshot is always for the user named in MCP_USERNAME. */
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
      async () => {
        const username = process.env.MCP_USERNAME;
        if (!username) {
          return {
            content: [{ type: "text", text: "Server misconfigured: MCP_USERNAME is not set." }],
            isError: true,
          };
        }
        try {
          const overview = await buildOverview(username);
          return { content: [{ type: "text", text: JSON.stringify(overview, null, 2) }] };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Failed to build overview: ${(e as Error).message}` }],
            isError: true,
          };
        }
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 },
);

/** Constant-time bearer-token comparison — avoids a timing side-channel on MCP_TOKEN. */
function tokenMatches(token: string, expected: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const verifyToken = async (_req: Request, token?: string) => {
  const expected = process.env.MCP_TOKEN;
  if (!expected || !token || !tokenMatches(token, expected)) return undefined;
  return { token, scopes: ["read"], clientId: "mcp-client" };
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
