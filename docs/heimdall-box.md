# Heimdall Box Integration

**Heimdall** is a physical, electronic key box (hardware) that holds the chastity
key and **physically enforces** a lock period — the wearer cannot open locally
while it is held. It is the hardware counterpart to the software-only
**Bildersafe** (a sealed photo of the key-box code, gated separately by
`ENABLE_BILDERSAFE`).

The distinction surfaces throughout the app as **`hardwareEnforced`**: when a box
holds the key, a keyholder lock period is enforced physically (`hardwareEnforced:
true`); otherwise the lock is honor-system only.

> **Maturity: MVP ("P1").** The box reads the active lock period and reports its
> status and real-world events. The reconciliation of box events against tracker
> entries (penalty-book surfacing of early/unauthorized opens), device binding,
> and cleaning/range rules in the config feed are **not yet implemented** — see
> [Maturity & limitations](#maturity--limitations).

## Architecture

The **Heimdall server is the only bridge** between the box and the tracker. The
box hardware never talks to the tracker directly — it syncs with the Heimdall
server, which in turn calls the tracker's integration API. Users are mapped by
**username** (Heimdall does not know the tracker's internal IDs).

```
[ box hardware ] ──► [ Heimdall server ] ──► /api/integration/box/*  (tracker)
                                             (Bearer HEIMDALL_SYNC_SECRET)

[ tracker web UI ] ──► /api/box, /api/box/command  (session-authenticated)
```

## Enabling

| Variable | Purpose |
|----------|---------|
| `HEIMDALL_SYNC_SECRET` | The only box-related secret. Does **both**: (1) machine auth for all `/api/integration/box/*` routes (bearer token, constant-time compare), and (2) feature gate — when set, the box UI and commands are active. Unset → no box UI, commands rejected, integration routes deny. |

There are no other box-specific environment variables. Treat the secret like a
production credential: if it leaks, anyone can read lock periods and write
`BoxStatus`/`BoxEvent` for any username. It is rotatable (rotating briefly
disables the feature).

## Endpoints

### Machine side — called by the Heimdall server (auth: `Bearer HEIMDALL_SYNC_SECRET`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/integration/box/config?username=<name>` | Tracker → Heimdall **intent**: the active keyholder lock period (`{ sperrzeit: { endetAt, indefinite, reinigungErlaubt } \| null }`), which Heimdall folds into its own `lockUntil`. |
| `POST` | `/api/integration/box/status` | Heimdall pushes the live box state on every sync (`username, boxId, name, locked` + optional `lockUntil, simpleLock, keyholderLocked, battery, charging, boltPos, fwVersion, lastSyncAt`). Upserts `BoxStatus`. Returns any `pendingCommand` (+`relockBy`) and **deletes it on read** (consume-on-read; no ack). |
| `POST` | `/api/integration/box/event` | Heimdall reports real box transitions: `type ∈ {LOCKED, UNLOCKED, EARLY_OPEN, UNAUTHORIZED_OPEN}` + optional `wakeReason, battery, fwVersion, at`. Stored as `BoxEvent`. |

### App side — called by the tracker UI (auth: NextAuth session)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/box` | Box status for the logged-in sub (the `+` menu). Overlays the pushed status with the tracker's own active lock period immediately (the pushed `BoxStatus` lags). Returns `[]` if Heimdall is disabled. |
| `POST` | `/api/box/command` | Sub triggers a box action: `command ∈ {lock, open, clean_open}`. Sets the **intent** (`pendingCommand`) only; Heimdall applies it on the next sync. `open` is blocked while keyholder-locked / within a lock period; `clean_open` requires an active, permitted cleaning window with quota left and sets `relockBy`. |

## Lifecycle

- **Status sync (Heimdall → tracker):** every sync POSTs to `.../status`,
  upserting `BoxStatus`. Online heuristic: `lastSyncAt` within the last 10 min.
- **Command flow (sub → box), pull-based:** `POST /api/box/command` stores
  `pendingCommand`; nothing is pushed to the box. On the next `.../status` sync
  the tracker returns the command and clears it (consume-on-read). If it is lost
  (e.g. a crash) the sub simply re-issues it. The `+` menu polls `/api/box` every
  3 s to reflect syncs / expired locks without reopening.
- **Lock-period enforcement (tracker → box):** Heimdall pulls the active
  keyholder lock period via `.../config` and folds `endetAt` into its `lockUntil`
  (capped). Because the pushed `BoxStatus` lags the tracker's lock period,
  `GET /api/box` overlays it locally and `POST /api/box/command` re-checks the
  live lock period.

Coupling to the normal `VERSCHLUSS`/`OEFFNEN` flow is currently loose: the box
reads the lock period (config) and reports events (event); `clean_open` is wired
into the existing cleaning system (window, quota).

## Data models

`prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `BoxStatus` | Live state of a user's box(es), pushed by Heimdall: `boxId, name, locked, lockUntil, simpleLock, keyholderLocked, battery, charging, boltPos, fwVersion, lastSyncAt` + command fields (`pendingCommand, pendingCommandRelockBy, pendingCommandAt`). Unique `[userId, boxId]`. |
| `BoxEvent` | History of real box transitions (hardware truth): `type, wakeReason, battery, fwVersion, at`. Bound to the user; `deviceId` exists in the schema but is currently never set (the box is intentionally generic). |

## Keyholder view (MCP)

The MCP tool **`get_box_state`** (and the `keyholder_dashboard`) expose
`BoxStateView`: `name, locked, lockUntil, hardwareEnforced, hardwareEnforcedEffective,
lockUntilStale, battery, charging, online, lastSeen`. `hardwareEnforced` mirrors
`BoxStatus.keyholderLocked` as last reported — a stale honesty gap if the box has
since gone offline (the field never updates without a fresh sync). Prefer
`hardwareEnforcedEffective` (`online && hardwareEnforced`) for the real-world
answer: `false` whenever the box is offline, regardless of the last reported
state — an offline box cannot verifiably enforce anything, so the lock is honor-
system in practice. `lockUntilStale` flags a `lockUntil` in the past that the box
hasn't been online since to confirm/clear. `null` means no box is registered. See
[`mcp.md`](mcp.md).

## Setup

1. Set `HEIMDALL_SYNC_SECRET=<strong-secret>` in the tracker's `.env` (enables the
   feature and the auth at once).
2. Configure the Heimdall server to call
   `https://<instance>/api/integration/box/{config,status,event}` with
   `Authorization: Bearer <secret>`.
3. Pairing is **by username** — Heimdall must know the tracker `username`. There
   is no separate pairing token; the `BoxStatus` row is created on the first
   `status` push (upsert). `boxId` is a stable device id assigned by Heimdall.

## Maturity & limitations

This is an MVP. Not yet implemented:

- **Entry ↔ BoxEvent reconciliation** — `EARLY_OPEN` / `UNAUTHORIZED_OPEN` events
  are stored but not yet surfaced in the penalty book (deferred to "P3").
- **Device binding** — `BoxEvent.deviceId` exists in the schema but is never set;
  the box is treated as generic (which belt is worn is inferred from the lock
  session).
- **Cleaning / range rules in `config`** — only the bare lock period is delivered.
- **Multi-box per user** — the schema allows it (`@@unique([userId, boxId])`), but
  `get_box_state` only considers the most recently updated box.
- **No command ack** — commands are consume-on-read; idempotency is the sub
  re-issuing.

## Security

- Machine auth is a shared-secret bearer with a constant-time compare; no secret
  set → deny. The `/api/integration/*` routes are session-free by design, so
  protection rests entirely on the secret.
- The same secret is the feature flag — rotating it briefly turns the feature off.

---

← Back to the [main README](../README.md).
