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
> and range rules in the config feed are **not yet implemented** — see
> [Maturity & limitations](#maturity--limitations).

## Architecture

The **Heimdall server is the only bridge** between the box and the tracker. The
box hardware never talks to the tracker directly — it syncs with the Heimdall
server, which in turn calls the tracker's integration API. Users are mapped by
**username** (Heimdall does not know the tracker's internal IDs).

```
[ box hardware ] ──► [ Heimdall server ] ──► /api/integration/box/*  (tracker)
                                             (Bearer HEIMDALL_SYNC_SECRET)

[ tracker web UI ] ──► /api/box  (session-authenticated, read-only)
[ VERSCHLUSS/OEFFNEN entry ] ──► pendingCommand + notify  (the box follows the entry)
```

## Enabling

| Variable | Purpose |
|----------|---------|
| `HEIMDALL_SYNC_SECRET` | The box-related secret. Does **both**: (1) machine auth for all `/api/integration/box/*` routes (bearer token, constant-time compare), and (2) feature gate — when set, the box UI and commands are active. Unset → no box UI, commands rejected, integration routes deny. Also used as the outbound Bearer for the instant-push below. |
| `HEIMDALL_BASE_URL` | *Optional.* Base URL of the Heimdall server (e.g. `https://heimdall.trublue.ch`). When set, the tracker fires a fire-and-forget notify to `…/api/tracker/notify` on box-relevant changes (Verschluss/Öffnen entry, Sperrzeit set/change/withdraw) so a **live** box gets the command instantly via MQTT instead of at its next sync. No-op if unset — the `pendingCommand`/config pull on the next box sync remains the fallback. |

Treat `HEIMDALL_SYNC_SECRET` like a
production credential: if it leaks, anyone can read lock periods and write
`BoxStatus`/`BoxEvent` for any username. It is rotatable (rotating briefly
disables the feature).

## Endpoints

### Machine side — called by the Heimdall server (auth: `Bearer HEIMDALL_SYNC_SECRET`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/integration/box/config?username=<name>` | Tracker → Heimdall **intent**: the active keyholder lock period (`{ sperrzeit: { endetAt, indefinite, reinigungErlaubt } \| null }`), which Heimdall folds into its own `lockUntil`. Nothing else — the cleaning rules (permission, windows, quota, max duration) stay in the tracker, which decides whether an opening is allowed and sends `open`. The box must not second-guess that: two rule sets over one question drift apart. |
| `POST` | `/api/integration/box/status` | Heimdall pushes the live box state on every sync (`username, boxId, name, locked` + optional `lockUntil, simpleLock, keyholderLocked, battery, charging, boltPos, fwVersion, lastSyncAt, offlineOpenHours, lowBatteryOpenPercent`). Upserts `BoxStatus`. Returns any `pendingCommand` and **deletes it on read** (consume-on-read; no ack). |
| `POST` | `/api/integration/box/event` | Heimdall reports real box transitions: `type ∈ {LOCKED, UNLOCKED, EARLY_OPEN, UNAUTHORIZED_OPEN}` + optional `wakeReason, battery, fwVersion, at`. Stored as `BoxEvent`. |

### App side — called by the tracker UI (auth: NextAuth session)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/box` | Box status for the logged-in sub (status display only). Overlays the pushed status with the tracker's own active lock period immediately (the pushed `BoxStatus` lags). Returns `[]` if Heimdall is disabled. |

There is **no** sub-facing command route. The box has no separate controls: it follows the
`VERSCHLUSS`/`OEFFNEN` entries.

## Lifecycle

- **Status sync (Heimdall → tracker):** every sync POSTs to `.../status`,
  upserting `BoxStatus`. Online heuristic: `lastSyncAt` within the last 10 min.
- **Command flow (entry → box):** creating a `VERSCHLUSS` entry sets
  `pendingCommand = "lock"`, an `OEFFNEN` entry sets `"open"` (`lib/boxCommand.ts`,
  inside the entry transaction). A **forbidden** opening — one that breaks a lock
  period — sets nothing: documenting the offense must not execute it. Delivery is
  two-way: a live box gets it instantly over MQTT (`lib/heimdallNotify.ts` →
  Heimdall `/api/tracker/notify`), a sleeping one pulls it on its next `.../status`
  sync, where the tracker returns and clears it (consume-on-read; no ack).
- **Lock-period enforcement (tracker → box):** Heimdall pulls the active keyholder
  lock period via `.../config` and folds `endetAt` into its `lockUntil`. This is a
  **standing order**: the box re-derives "should I be closed?" from it on every
  sync. A one-shot `open` cannot cancel it — which is why `open` additionally makes
  Heimdall suspend it (`LockPolicy.holdOpen`) until the next `lock`.
- **Cleaning pause:** `OEFFNEN` with reason `REINIGUNG` during a cleaning-permitted
  lock period. The box opens and the lock period keeps running. Nothing re-locks it
  by itself — the `VERSCHLUSS` entry does. Miss the deadline
  (`reinigungRelockDeadline`) and the Strafbuch books the offense; the bolt stays
  put. Heimdall is never told about cleaning, windows or deadlines: it drives an
  open-loop stepper with no end-stop and no lid contact, so a deadline expiring
  there would close the bolt unattended.

## Data models

`prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `BoxStatus` | Live state of a user's box(es), pushed by Heimdall: `boxId, name, locked, lockUntil, simpleLock, keyholderLocked, battery, charging, boltPos, fwVersion, lastSyncAt` + the two thresholds at which the box opens ITSELF (`offlineOpenHours, lowBatteryOpenPercent` — they drive the failsafe pre-warning and are never guessed here. Note the two have OPPOSITE owners: `offlineOpenHours` is Heimdall's own per-device `LockPolicy` value, pushed DOWN to the box; `lowBatteryOpenPercent` is a firmware constant that Heimdall mirrors and passes UP. Neither is reported by the box itself.) + command fields (`pendingCommand, pendingCommandAt`). Unique `[userId, boxId]`. |
| `BoxEvent` | History of real box transitions (hardware truth): `type, wakeReason, battery, fwVersion, at`. Bound to the user; `deviceId` exists in the schema but is currently never set (the box is intentionally generic). Read by the key proof below. |

## Key proof from telemetry

The key proof on an entry is normally the **box photo** (`Entry.boxImageUrl` →
`keyDetected`, judged server-side by `detectKeyInBox`). The photo stays
**optional**, and the form still asks before saving without one.

`lib/boxKeyProof.ts` adds a second, photo-free source: **if the bolt has not
moved since the last proof, that proof still holds.** The anchors are the lock
entry, every recorded inspection, every cleaning pause (opening *and* re-lock),
and the opening that ends the session. Only **inspections** are ever covered — a
lock is the moment the key goes in, the bolt moves, and that is what the photo
is for.

The derivation walks the anchors in time order, carrying a cursor on the last
**real** proof: a lock declaring `keyInBox === true`, or an inspection whose
*photo* showed the key. An opening, or a lock without that declaration, kills
the chain until a new proof establishes it; a photo verdict of "no key" kills it
too. An inspection is covered when all of these hold:

1. the chain is alive at that point,
2. the box's latest report has the bolt physically closed (`reportedLocked ?? locked`),
3. the box has reported **after** the judged moment (`BoxStatus.lastSyncAt`) — measured against the *later* of the entered time and `Entry.createdAt`, so a backdated entry cannot certify its own freshness,
4. no `UNLOCKED` / `EARLY_OPEN` / `UNAUTHORIZED_OPEN` event lies between the last real proof and the inspection.

Condition 4 deliberately measures from the last *real* proof, not from the
previous anchor. Chaining window to window would let a reported opening be
healed by the next inspection but one: the inspection right after the opening
fails, and the one after that "inherits" a proof nobody re-established.

The derivation is **live** (no stored column): an event the box delivers late
corrects the verdict on the next page render, which a persisted "OK" would not.
It runs over all sessions, not just the running one — the verdict depends on
timestamps, not on "now", so a pill must not disappear from the history the
moment the sub unlocks. It only ever answers *yes* or *unknown* — never *no*. A
photo verdict always wins, including a negative one: the photo shows the key
itself, the telemetry only shows a bolt that stayed put. Telemetry substitutes
only for a *missing* photo — an entry that has a box photo whose verdict is
still `null` (recognition running, or inconclusive) stays silent as before. The
timeline pill names the source (`key in box (telemetry)`) so the keyholder can
tell the two apart.

**Limitation — gaps in the middle of a window are invisible.** `BoxStatus`
keeps only the *latest* sync, not a sync history, so condition 3 closes the gap
at the *end* of the window only. The realistic way a real opening goes
unreported is the offline failsafe: after `offlineOpenHours` without a sync the
box opens itself with nobody listening. Condition 2 catches that once the box
returns — it reports the bolt as open, and no proof is issued until the sub
locks again. What remains uncovered is a box that opens offline, drops the
event, *and* is closed again before its next sync. Whether the firmware buffers
events across an offline stretch is not documented on the tracker side; the
ingest (`/api/integration/box/event`) accepts an explicit `at`, so a buffered
replay would be dated correctly and the live derivation would heal itself.

A second, smaller residual: entry times are entered by the sub and are
minute-granular, while `BoxEvent.at` is hardware seconds. An inspection recorded
in the same minute as an opening can therefore sort just before it. Deliberate
backdating is bounded by condition 3 and stays visible to the keyholder through
the existing "time corrected" marker on the same row.

Users with multiple boxes are covered conservatively: the freshness bound is the
**oldest** `lastSyncAt` and *every* box must report its bolt closed, because
`BoxEvent` carries no box id and all boxes feed one stream.

**The pill can appear late.** The heartbeat that re-renders a pending *photo*
verdict (`/api/heartbeat`) only tracks entries that have a box photo. A
photo-free inspection normally cannot be covered at save time anyway — the box
has not synced past it yet — so its pill shows up on the next navigation rather
than immediately.

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

`failsafeWarnings` is the forward-looking counterpart to `staleLock`: `offlineOpen`
(hours without contact, hours left, `dueAt`) and `lowBatteryOpen` (percent vs. the
threshold the box opens at). Its `info` and `warn` steps come *before* the opening;
`due` no longer does — for the offline case `due` is exactly what `staleLock` is
derived from, and both clear together on the next successful sync.

The countdown is derived server-side from elapsed time, never from a box-reported
counter: a box that cannot sync cannot report its own silence either. It measures
the *tracker's* view, which usually errs early (a stalled Heimdall push ages
`lastSyncAt` here while the box is fine) but can also err late: the box resets its
own counter only after reading a successful response, while Heimdall stamps
`lastSyncAt` on request arrival — so a lost response leaves the box counting while
this looks fresh. Same derivation (`boxFailsafeWarnings` in `src/lib/boxStatus.ts`)
as the sub's box card, so both sides read one deadline.

An empty array means "no cause **or** no data": a box that never synced, and a
pre-rollout row without the thresholds, are silent too.

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

- **Entry ↔ BoxEvent reconciliation** — box events now back the [key proof](#key-proof-from-telemetry),
  but `EARLY_OPEN` / `UNAUTHORIZED_OPEN` are still not surfaced as offenses in
  the penalty book (deferred to "P3").
- **Device binding** — `BoxEvent.deviceId` exists in the schema but is never set;
  the box is treated as generic (which belt is worn is inferred from the lock
  session).
- **Cleaning windows are delivered but not yet honoured** — `config` now carries
  `reinigung.fenster` (the sub's cleaning time windows) alongside the lock period.
  Until Heimdall reads that field, the box keeps whatever windows are configured
  on it locally, and an edit in the tracker's admin UI has no effect on the
  hardware. The tracker cannot verify the box's window behaviour, so it never
  claims the bolt will follow just because a window is open — it only ever
  predicts a hold from the box's own reported `lockUntil`.
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
