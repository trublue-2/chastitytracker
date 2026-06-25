# MCP Keyholder Interface

The tracker can expose a single instance as a **virtual keyholder** over the
[Model Context Protocol](https://modelcontextprotocol.io). An MCP-capable AI
client (e.g. Claude Desktop / Claude mobile) connects to the instance, reads the
full tracker state, and issues keyholder directives — locks, inspections, orgasm
directives, penalties, training goals — **autonomously, without a confirmation
step**.

This is an **advanced, opt-in** integration. It is off by default and not needed
for a standard self-hosted install. For the domain model the agent reasons over
(sessions, segments, the discipline ledger, notes v2, box state), see the
companion reference **[`mcp-keyholder-guide.md`](mcp-keyholder-guide.md)** — it
mirrors the `explain_model` tool output.

> **One server = one sub.** Each MCP server is bound to exactly one target user
> via `MCP_USERNAME`. All reads and writes operate on that user. To keyhold
> several subs you run one configured endpoint per sub.

## Enabling

Set per instance (these are read from the environment, not the database):

| Variable | Required | Purpose |
|----------|----------|---------|
| `ENABLE_MCP` | yes | Master switch. If `!= "true"`, the whole MCP endpoint returns **404**. Also reveals the "AI keyholder rules" field in the admin user settings. |
| `MCP_USERNAME` | yes | The username whose data the keyholder reads and controls. Missing → tools return "Server misconfigured". |
| `MCP_TOKEN` | no | Static bearer token for the **read-only** legacy path (see below). |

## Endpoints

The MCP handler is mounted with base path `/api`, exposing two transports:

- **Streamable HTTP:** `https://<instance>/api/mcp`
- **SSE:** `https://<instance>/api/sse`

Point your client at the streamable-HTTP URL unless it only supports SSE.

## Authentication

Two ways in, both verified as a bearer token. **OAuth is required for write
access**; the static token is read-only.

### OAuth 2.0 (recommended — full read + write)

A standards-compliant OAuth 2.0 authorization server runs on the same origin.
An MCP client discovers and completes the flow automatically:

1. **Discovery** — `GET /.well-known/oauth-protected-resource` (RFC 9728) →
   `GET /.well-known/oauth-authorization-server` (RFC 8414). Issuer/endpoints are
   derived per subdomain from the `X-Forwarded-*` headers (works behind Traefik).
2. **Dynamic Client Registration** (RFC 7591) — `POST /api/oauth/register` with
   `client_name` + `redirect_uris`. Public client, no secret. HTTPS, `localhost`,
   and custom schemes (e.g. `claude://`) are allowed.
3. **Authorization Code + PKCE** (S256 mandatory) — `GET /api/oauth/authorize`
   validates and redirects to the consent page `/oauth/authorize`. Approving
   requires an **active logged-in session** and binds the code to that user.
4. **Token** — `POST /api/oauth/token` (`grant_type=authorization_code`) returns
   an access token (1 h TTL) + a refresh token (1 year, non-rotating).
   `grant_type=refresh_token` mints a new access token and returns the same
   refresh token.
5. **Revoke** — `POST /api/oauth/revoke` (RFC 7009) drops access + refresh tokens
   by hash; always responds 200.

**Write access requires admin consent.** Write tools require `role === "admin"`,
and the OAuth code is bound to the user who approved the consent screen. So sign
in as an **admin** account when authorizing. (The only OAuth scope is `read`;
write permission is gated on the admin role, not the scope.) Tokens are stored
only as SHA-256 hashes; authorization codes are single-use with a 10-minute TTL.

### Static token (legacy — read-only)

Set `MCP_TOKEN` and send it as `Authorization: Bearer <token>` (e.g. in a Claude
Desktop config). This path carries no user identity, so every **write** tool is
rejected ("the static MCP token is read-only"). Use it only for read-only access.

## Tools

The server instructions steer clients to a **V2-first** workflow. Legacy V1 read
tools still exist as a fallback but use misleading single-device labels.

**V2 reads (preferred)** — start with `keyholder_dashboard` (answers ~90 %), then
drill in: `get_session` (segments / per-device breakdown), `device_stats`,
`records`, `period_summary`, `denial_trend`, `get_offenses`, `get_context`,
`timeline`, `get_devices`, `query_notes`, `get_action_log`, `get_box_state`.

**V1 directive writes** (no V2 equivalent) — `request_lock`, `set_lock_period`,
`edit_lock_period`, `request_inspection`, `resolve_inspection`, `request_orgasm`,
`judge_offense`, `withdraw`, `set_training_goal` / `edit_training_goal` /
`delete_training_goal` / `list_training_goals`, `set_cleaning`. Lock, lock-period,
inspection, orgasm, resolve, withdraw and "punish" verdicts notify the sub
(email + push); the rest are silent.

**V2 knowledge / context writes** — `upsert_note`, `link_note`, `set_device_meta`,
`set_health_hold`, `upsert_appointment`, `upsert_recurring_context`. Each takes a
mandatory `reason` (audited), supports `dryRun`, and runs in a transaction with a
recorded field diff. All silent.

**Legacy V1 reads (fallback only):** `get_overview`, `list_sessions`,
`list_devices`, `get_strafbuch`, `list_keyholder_notes`. (`list_entries` and
`explain_model` are V1 but have no V2 replacement.)

## Data models

MCP-specific Prisma models (additive; see `prisma/schema.prisma`):

| Model | Purpose |
|-------|---------|
| `KeyholderNote` | Private keyholder observations (notes v2: type, status, pinned, supersedes, confidence, do/don't). MCP-only — the sub never sees them. |
| `NoteRef` | Polymorphic link from a note to a tracked entity (device, session, segment, control, offense, orgasm directive, goal, appointment). |
| `KeyholderActionLog` | Append-only audit of every V2 mutation (tool, actor, mandatory reason, source). |
| `RecurringContext` | Recurring weekly life-context slot (weekday, device-free, note). |
| `Appointment` | One-off appointment (when, type, device-free, note). |
| `HealthHold` | Health-related hold (active, reason) — advisory context for the keyholder. |
| `OAuthClient` / `OAuthCode` / `OAuthToken` / `OAuthRefreshToken` | OAuth 2.0 server state (hashed tokens, S256 codes). |

## Connecting a client (summary)

1. On the instance: `ENABLE_MCP=true` and `MCP_USERNAME=<sub-username>`.
2. In the client, add the MCP server URL `https://<instance>/api/mcp`.
3. Complete the OAuth consent **signed in as an admin** to get write access
   (or set `MCP_TOKEN` for read-only and use it as a bearer token).

## Keyholder rules (human-in-the-loop)

The human keyholder stays in control by writing **free-text standing rules** that
the AI keyholder must follow. This is the steering layer on top of the autonomous
tools.

- **Where:** the admin area → a user's **Settings** tab → the **"AI keyholder
  rules"** field (`mcpKeyholderInstructions`). The field is only shown when
  `ENABLE_MCP=true`, and is saved via `PATCH /api/admin/users/[id]`.
- **What:** plain-language directives and boundaries — e.g. "minimum 12 h between
  openings", "never require an inspection at night", "no orgasm directives during
  her exam week". There is no fixed syntax; write them as instructions to the
  agent.
- **How the agent sees them:** they are surfaced to the client as
  **`get_overview.keyholderInstructions`**.
- **Binding:** the MCP server instructions and **every write tool description**
  state that writes must respect `get_overview.keyholderInstructions`. So the
  human's rules constrain the agent's autonomous directives without a per-action
  confirmation step.

> Set these rules before letting the agent act. They are the primary way to keep
> the autonomous writes aligned with the keyholder's intent. For richer,
> structured guidance the agent can also read pinned directives/boundaries from
> notes v2 (`query_notes`, surfaced in `keyholder_dashboard`).

## Security & gotchas

- **Autonomous writes — no confirmation.** The server instructions and tool
  descriptions explicitly tell the agent to execute directly without asking. This
  is a deliberate default; treat write access accordingly.
- **Admin-gated writes.** Every write passes a keyholder check requiring the
  authorizing user to be an admin. The static `MCP_TOKEN` can never write.
- **Single target user.** `USE_ADMIN_RELATIONSHIPS` scoping is not applied here —
  the server acts on the one `MCP_USERNAME`.
- **Audit trail.** Every V2 write requires a `reason` and is recorded in
  `KeyholderActionLog`.
- **Not available over MCP.** Automatic-inspection settings are **read-only**
  (`get_overview.autoKontrolle`); inspections are triggered manually via
  `request_inspection`. The physical box is **not** controlled directly — MCP
  sets rules in the tracker, the box enforces them (see
  [`heimdall-box.md`](heimdall-box.md)).
- **Replay protection & rate limits.** Authorization codes are single-use;
  tokens are stored hashed. OAuth endpoints are IP-rate-limited (register 20/min,
  token 30/min, revoke 30/min).

---

← Back to the [main README](../README.md).
