import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { timingSafeEqual, createHash } from "crypto";
import { z } from "zod";
import { buildOverview, listSessions, listEntries, listDevices, mcpStrafbuch, listKeyholderNotes } from "@/lib/mcpOverview";
import { MCP_MODEL_DOC } from "@/lib/mcpModelDoc";
import {
  checkMcpKeyholder, mcpRequestLock, mcpSetLockPeriod, mcpRequestInspection, mcpSetTrainingGoal, mcpWithdraw,
  mcpListTrainingGoals, mcpEditTrainingGoal, mcpDeleteTrainingGoal, mcpSetCleaning, mcpResolveInspection, mcpEditLockPeriod,
  mcpAddKeyholderNote, mcpDeleteKeyholderNote, mcpRequestOrgasm,
} from "@/lib/mcpWrite";
import { ORGASMUS_ARTEN } from "@/lib/constants";
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

/** Auth context the MCP SDK passes to tool callbacks. The OAuth branch of verifyToken stores the
 *  authorizing user's id under authInfo.extra.userId. */
type ToolExtra = { authInfo?: { extra?: { userId?: string } } };

/** Wrapper for WRITE tools: enforces keyholder (admin OAuth) authorization, then delegates to
 *  runTool. The static MCP_TOKEN has no user identity and is therefore always rejected here. */
async function runWriteTool<T>(label: string, extra: ToolExtra, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  const check = await checkMcpKeyholder(extra?.authInfo?.extra?.userId);
  if (!check.ok) {
    return { content: [{ type: "text", text: `Write denied: ${check.reason}.` }], isError: true };
  }
  return runTool(label, fn);
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
          "KG wearing hours (today/week/month), active KG training goal with progress, cleaning-pause " +
          "rules (reinigung), per-category wear hours + goals for non-KG categories (Plug, Collar, …), " +
          "open control requests, active lock periods, session statistics, recorded penalties, " +
          "active wear sessions, and the human keyholder's free-text rules (keyholderInstructions) " +
          "that the write tools must respect. Use this to reason about the user's situation and propose measures. " +
          "If any field or rule is unclear (e.g. reinigung.maxPausesPerDay, or how Strafbuch detection vs " +
          "punishment works), call explain_model first for a plain-language reference.",
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
      "list_devices",
      {
        title: "List devices (inventory)",
        description:
          "Returns the user's device inventory — KG and non-KG (Plug, Collar, …) devices — each " +
          "with its notes/description, category, purchase price, currency, whether it has a photo, " +
          "archived status and creation date. Active devices first, then archived. Use for " +
          "inventory, notes and cost questions.",
        inputSchema: {},
      },
      () => runTool("list_devices", listDevices),
    );

    server.registerTool(
      "get_strafbuch",
      {
        title: "Get penalty book (Strafbuch)",
        description:
          "Returns the Strafbuch: system-detected offenses — unauthorized openings during a " +
          "lock period, late and rejected control submissions, cleaning-limit violations, and " +
          "wrong-device violations (a different device worn than the Anforderung specified) — " +
          "each (where applicable) flagged whether it has already been marked as punished. " +
          "Use to reason about outstanding misconduct and propose consequences.",
        inputSchema: {},
      },
      () => runTool("get_strafbuch", mcpStrafbuch),
    );

    server.registerTool(
      "list_keyholder_notes",
      {
        title: "List keyholder notes (wearing-behaviour observations)",
        description:
          "Returns the private keyholder notes — free observations about the user's wearing " +
          "behaviour, optionally tagged by KG (device) and category (e.g. pressure marks, escape " +
          "attempts, complaints). Newest first. get_overview already surfaces the 8 most recent; " +
          "use this for the full history or to filter by a specific KG/category. MCP-only — the " +
          "user never sees these. Use add_keyholder_note to record, delete_keyholder_note to prune.",
        inputSchema: {
          kg: z.string().optional().describe("Filter to a specific KG/device tag (exact match). Omit for all."),
          kategorie: z.string().optional().describe("Filter to a specific category/tag (exact match). Omit for all."),
          limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
        },
      },
      (args) => runTool("list_keyholder_notes", (username) => listKeyholderNotes(username, args)),
    );

    server.registerTool(
      "explain_model",
      {
        title: "Explain the tracker model & dependencies",
        description:
          "Returns a plain-language reference (German) of how the tracker's concepts interrelate — " +
          "lock & Sperrzeit, Reinigung (cleaning) incl. maxPausesPerDay (a COUNT per calendar day, not " +
          "minutes), device switches (which run through the cleaning path and consume the cleaning " +
          "quota), the Strafbuch detected-vs-punished distinction, box control, and keyholder notes. " +
          "Read this whenever a field or rule is unclear — it prevents the common misreadings (e.g. " +
          "treating a detected offense as a punishment, or maxPausesPerDay as minutes).",
        inputSchema: {},
      },
      () => ({ content: [{ type: "text" as const, text: MCP_MODEL_DOC }] }),
    );

    // ── WRITE tools — keyholder directives (require an admin OAuth token; act on MCP_USERNAME) ──
    // All write tools MUST respect the human keyholder's rules in get_overview.keyholderInstructions.
    const KEYHOLDER_NOTE =
      " Keyholder action (requires an admin OAuth token). Respect the human keyholder's rules in " +
      "get_overview.keyholderInstructions before acting. The user is notified by e-mail + push.";

    server.registerTool(
      "request_lock",
      {
        title: "Request lock-up",
        description:
          "Asks the user to lock up within a deadline (creates a VerschlussAnforderung). Only valid " +
          "when the user is currently open. Optionally enforce a minimum wearing duration and/or a " +
          "specific device." + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe("Hours from now to lock up by. Use this or deadlineAt."),
          deadlineAt: z.string().optional().describe("Absolute deadline (ISO 8601). Overrides deadlineHours."),
          minDurationHours: z.number().positive().optional().describe("Min wearing duration (h) enforced after lock-up via an auto lock period."),
          deviceName: z.string().optional().describe("Require a specific device by name."),
          message: z.string().optional().describe("Message shown to the user."),
        },
      },
      (args, extra) => runWriteTool("request_lock", extra, (u) => mcpRequestLock(u, args)),
    );

    server.registerTool(
      "set_lock_period",
      {
        title: "Set lock period (Sperrzeit)",
        description:
          "Sets a lock period during which the user may not open (creates a SPERRZEIT). Only valid " +
          "when the user is currently locked. Provide untilAt or durationHours, or set indefinite=true." + KEYHOLDER_NOTE,
        inputSchema: {
          untilAt: z.string().optional().describe("Lock until this absolute time (ISO 8601)."),
          durationHours: z.number().positive().optional().describe("Lock for this many hours from now."),
          indefinite: z.boolean().optional().describe("Lock indefinitely (no end). Overrides untilAt/durationHours."),
          reinigungErlaubt: z.boolean().optional().describe("Allow cleaning openings without breaking the lock period."),
          message: z.string().optional().describe("Message shown to the user."),
        },
      },
      (args, extra) => runWriteTool("set_lock_period", extra, (u) => mcpSetLockPeriod(u, args)),
    );

    server.registerTool(
      "request_inspection",
      {
        title: "Request inspection (Kontrolle)",
        description:
          "Requests a photo inspection: e-mails the user a code they must show in a photo within a " +
          "deadline (default 4h). Only valid when the user is currently locked. Can be triggered " +
          "time-delayed so the user does not know exactly when it strikes." + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe("Deadline in hours (default 4). Counts from when the inspection is triggered."),
          comment: z.string().optional().describe("Instruction shown to the user."),
          delayMinutes: z.coerce.number().optional().describe("Delay before the code reaches the user. Omit for a random 5–65 min delay; 0 = immediate; any other value is clamped to 5–65."),
        },
      },
      (args, extra) => runWriteTool("request_inspection", extra, (u) => mcpRequestInspection(u, args)),
    );

    server.registerTool(
      "request_orgasm",
      {
        title: "Request / direct an orgasm",
        description:
          "Sets a keyholder orgasm directive with a time window. art=ANWEISUNG makes it mandatory " +
          "(a missed window becomes a Strafbuch offense); art=GELEGENHEIT is a permitted opportunity " +
          "(no penalty if unused). Optionally require a specific orgasm type, allow opening the device " +
          "during the window, and attach a message. Replaces any existing open directive (one active " +
          "at a time). The user is notified by e-mail + push." + KEYHOLDER_NOTE,
        inputSchema: {
          art: z.enum(["ANWEISUNG", "GELEGENHEIT"]).describe("ANWEISUNG = mandatory (penalty if missed); GELEGENHEIT = permitted opportunity (no penalty)."),
          beginsAt: z.string().optional().describe("Window start (ISO 8601). Default: now."),
          endsAt: z.string().optional().describe("Window end (ISO 8601). Use this or windowHours."),
          windowHours: z.number().positive().optional().describe("Window length in hours from beginsAt, when endsAt is omitted."),
          requiredType: z.enum(ORGASMUS_ARTEN).optional().describe("Require a specific orgasm type. Omit = any orgasm counts."),
          openAllowed: z.boolean().optional().describe("Allow opening the device to perform the orgasm during the window (no lock break / penalty)."),
          message: z.string().optional().describe("Message shown to the user."),
        },
      },
      (args, extra) => runWriteTool("request_orgasm", extra, (u) => mcpRequestOrgasm(u, args)),
    );

    server.registerTool(
      "set_training_goal",
      {
        title: "Set training goal (Vorgabe)",
        description:
          "Sets a wear-time goal (min hours per day/week/month) for KG or a named category. Starts now by " +
          "default, or schedule a future start via validFrom. Goals are chained per category by start date, " +
          "so a future-dated goal automatically ends the current one at that date. At least one period target " +
          "is required." + KEYHOLDER_NOTE,
        inputSchema: {
          category: z.string().optional().describe('Category name, e.g. "Plug". Omit or "KG" for the chastity device.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601, e.g. 2026-06-12). Omit to start now. May be a future date to schedule a goal in advance."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit for open-ended."),
          note: z.string().optional().describe("Note shown with the goal."),
        },
      },
      (args, extra) => runWriteTool("set_training_goal", extra, (u) => mcpSetTrainingGoal(u, args)),
    );

    server.registerTool(
      "withdraw",
      {
        title: "Withdraw an open directive",
        description:
          "Withdraws the user's currently open lock request, active lock period, open inspection, or orgasm directive." + KEYHOLDER_NOTE,
        inputSchema: {
          target: z.enum(["lock_request", "lock_period", "inspection", "orgasm_directive"]).describe("Which open directive to withdraw."),
        },
      },
      (args, extra) => runWriteTool("withdraw", extra, (u) => mcpWithdraw(u, args)),
    );

    server.registerTool(
      "list_training_goals",
      {
        title: "List training goals",
        description:
          "Lists all training goals (KG + categories) with their id, status (active/scheduled/expired), " +
          "start/end dates, period targets and note. Use the id with edit_training_goal / delete_training_goal.",
        inputSchema: {
          category: z.string().optional().describe('Filter by category name, e.g. "Plug". Omit for all.'),
        },
      },
      (args) => runTool("list_training_goals", (u) => mcpListTrainingGoals(u, args)),
    );

    server.registerTool(
      "edit_training_goal",
      {
        title: "Edit a training goal",
        description:
          "Replaces a training goal's values by id (get the id from list_training_goals). Overwrite semantics: " +
          "provide the full desired state. Omitting category keeps the current one. At least one period target " +
          "is required." + KEYHOLDER_NOTE,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
          category: z.string().optional().describe('Category name, e.g. "Plug" or "KG". Omit to keep current.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601). Omit = now."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit = open-ended."),
          note: z.string().optional().describe("Note shown with the goal."),
        },
      },
      (args, extra) => runWriteTool("edit_training_goal", extra, (u) => mcpEditTrainingGoal(u, args)),
    );

    server.registerTool(
      "delete_training_goal",
      {
        title: "Delete a training goal",
        description: "Deletes a training goal by id (get the id from list_training_goals)." + KEYHOLDER_NOTE,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
        },
      },
      (args, extra) => runWriteTool("delete_training_goal", extra, (u) => mcpDeleteTrainingGoal(u, args)),
    );

    server.registerTool(
      "set_cleaning",
      {
        title: "Set cleaning (Reinigung) rules",
        description:
          "Sets the cleaning-pause rules: whether short cleaning openings are allowed, the max minutes per " +
          "pause, and the max pauses per day (0 = unlimited). Only provided fields change." + KEYHOLDER_NOTE,
        inputSchema: {
          allowed: z.boolean().optional().describe("Allow cleaning pauses?"),
          maxMinutes: z.number().int().nonnegative().optional().describe("Max minutes per cleaning pause (clamped to 1–120)."),
          maxPerDay: z.number().int().nonnegative().optional().describe("Max pauses per day, 0 = unlimited (clamped to 0–20)."),
        },
      },
      (args, extra) => runWriteTool("set_cleaning", extra, (u) => mcpSetCleaning(u, args)),
    );

    server.registerTool(
      "resolve_inspection",
      {
        title: "Verify or reject the latest inspection",
        description:
          "Manually verifies or rejects the user's most recent submitted inspection photo (overrides any " +
          "automatic check). Use request_inspection to ask for one, withdraw to cancel an open one." + KEYHOLDER_NOTE,
        inputSchema: {
          action: z.enum(["verify", "reject"]).describe("Accept (verify) or reject the submitted photo."),
        },
      },
      (args, extra) => runWriteTool("resolve_inspection", extra, (u) => mcpResolveInspection(u, args)),
    );

    server.registerTool(
      "edit_lock_period",
      {
        title: "Change the active lock period's end",
        description:
          "Extends or shortens the currently active lock period (Sperrzeit) by changing its end — without " +
          "withdrawing and recreating it. Set indefinite=true for open-ended, or untilAt for a new end (must " +
          "be in the future)." + KEYHOLDER_NOTE,
        inputSchema: {
          untilAt: z.string().optional().describe("New end (ISO 8601, future). Ignored if indefinite=true."),
          indefinite: z.boolean().optional().describe("Make the lock period open-ended."),
        },
      },
      (args, extra) => runWriteTool("edit_lock_period", extra, (u) => mcpEditLockPeriod(u, args)),
    );

    server.registerTool(
      "add_keyholder_note",
      {
        title: "Add a keyholder note (wearing-behaviour observation)",
        description:
          "Records a private observation about the user's wearing behaviour for later evaluation — " +
          "e.g. which KG draws complaints, reported pressure marks, escape attempts, hygiene issues. " +
          "Optionally tag it with a KG (device) and a category. These notes are MCP-only (the user " +
          "never sees them) and resurface in get_overview + list_keyholder_notes." + KEYHOLDER_NOTE,
        inputSchema: {
          text: z.string().min(1).describe("The observation (free text)."),
          kg: z.string().optional().describe("Optional KG/device this concerns (e.g. the device name)."),
          kategorie: z.string().optional().describe('Optional category/tag, e.g. "Druckstelle", "Ausbruchsversuch", "Gemecker".'),
        },
      },
      (args, extra) => runWriteTool("add_keyholder_note", extra, (u) => mcpAddKeyholderNote(u, args)),
    );

    server.registerTool(
      "delete_keyholder_note",
      {
        title: "Delete a keyholder note",
        description:
          "Removes a keyholder note by id (e.g. an outdated or superseded observation). Get the id " +
          "from get_overview.keyholderNotes or list_keyholder_notes." + KEYHOLDER_NOTE,
        inputSchema: {
          id: z.string().min(1).describe("The note id to delete."),
        },
      },
      (args, extra) => runWriteTool("delete_keyholder_note", extra, (u) => mcpDeleteKeyholderNote(u, args)),
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

  // 1. OAuth access token — carries the authorizing user's id (used to gate write tools).
  const oauthRecord = await verifyAccessToken(token);
  if (oauthRecord) {
    return { token, scopes: oauthRecord.scopes.split(" "), clientId: oauthRecord.clientId, extra: { userId: oauthRecord.userId } };
  }

  // 2. Static bearer token fallback — read-only (no user identity → cannot pass the keyholder check).
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
