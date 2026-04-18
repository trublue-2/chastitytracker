# Chastity Tracker

> Multi-user web application for tracking chastity device wear times, inspections, training goals, and device (KG) usage statistics.

![Version](https://img.shields.io/badge/version-4.12.14-blue)
![License](https://img.shields.io/badge/license-PolyForm_Noncommercial_1.0.0-orange)
![Node](https://img.shields.io/badge/node-24+-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-16-black)

<!-- screenshot -->

## Features

### User Features

- **Lock/unlock event logging** with timestamps, photos, notes, and device selection
- **Device (KG) management** — register multiple chastity belts with name, description, photo, and purchase price; automatic per-device wear statistics and cost-per-hour tracking
- **Cleaning openings** with configurable daily limits and per-opening max-minutes
- **Photo upload** with EXIF metadata extraction, automatic seal-number detection, and rotation correction
- **AI-powered inspection verification** (Claude Vision reads handwritten codes from photos)
- **Real-time wear duration timer** and live countdown of remaining lock period
- **Personal statistics** — calendar heatmap, monthly overview, training-goal progress, per-device usage
- **Orgasm tracking** with categorization and sub-types (Masturbation, Geschlechtsverkehr, ruinierter, feuchter Traum, etc.)
- **Offline-first** — IndexedDB-cached dashboard and queued entry creation with background sync
- **Password self-service** (change and reset via email)
- **Push notifications** (PWA) for lock/unlock, inspections, lock requests, and penalties
- **Passkey login** (Face ID, Touch ID, Fingerprint, Windows Hello) alongside password
- **View Transitions** for smooth navigation between dashboard pages
- **Full i18n** support (German and English)
- **Installable PWA** with splash screens, app shortcuts, and iOS/Android wrappers

### Admin Features

- **User management** — create, edit, delete, demo-user generation, password reset
- **Training goals** per user (daily / weekly / monthly minimum wear hours)
- **Inspection requests** with 5-digit verification codes and configurable deadlines
- **Lock requests** — request a user locks up by a deadline, optionally with a minimum wear duration
- **Lock periods (Sperrzeiten)** — enforced lock periods with automatic or manual end time; optional flag allowing cleaning openings during the period
- **Device requirements** — admin can require a specific KG for a lock request; wrong-device usage is flagged automatically
- **Penalty tracking** — cleaning-limit violations, wrong-device, missed inspections, unauthorized openings
- **Unified Admin UI** — user-detail tabs share layout, width, and actions consistently across Overview / Actions / Entries / Inspections / Statistics / Penalties / Settings / Devices
- **Per-user notification preferences** (email + push, per event type)
- **Admin-user relationship model** — multi-admin support with feature flag
- **User statistics overview** and inspection history with alarm filter

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5 |
| UI | React 19 + Tailwind CSS v4 |
| Auth | NextAuth.js v5 (Credentials + Passkey/WebAuthn, JWT strategy, bcrypt) |
| Database | Prisma 5 + SQLite |
| AI | Anthropic Claude SDK (inspection photo verification + seal detection) |
| Images | Sharp (processing) + Exifr (EXIF extraction) |
| Email | Nodemailer (SMTP) |
| Push | web-push (VAPID) |
| i18n | next-intl v4 |
| Mobile | Capacitor wrappers (iOS via TestFlight, Android via direct APK) |
| Icons | Lucide React |
| Testing | Playwright (E2E) |
| Runtime | Node.js 24 Alpine (Docker) |

## Architecture

> This section describes the **hosted deployment** at chastitytracker.ch (multi-instance with the self-service portal). For a **single-instance self-hosted setup**, see the [Self-Hosting](#self-hosting) section below — a simpler topology with one container per install.

The tracker runs as one container per user instance, orchestrated by a separate portal application behind Traefik:

```
Internet
   |
Traefik (TLS reverse proxy)
   |-- portal.chastitytracker.ch  -> tracker-portal container
   |-- chastitytracker.ch         -> marketing site (static)
   |-- alice.trublue.ch           -> kg-alice (chastitytracker instance)
   +-- bob.chastitytracker.ch     -> kg-bob  (chastitytracker instance)
```

Each tracker instance is an independent container with its own SQLite database. The portal handles user registration, email verification, subdomain selection, and automated container deployment via the Docker API.

**Base domains:** `trublue.ch`, `chastitytracker.ch`, `chastity-tracker.com`

## Getting Started

### Prerequisites

- Node.js 24+
- npm 10+
- An SMTP server for email delivery (password reset, notifications)
- An Anthropic API key (for AI-powered inspection verification)

### Install

```bash
git clone <repository-url>
cd chastitytracker
npm install
```

### Environment

Create `.env.local`:

```env
NEXTAUTH_SECRET=<random-string>
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"

# SMTP
SMTP_HOST=<host>
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<password>
SMTP_FROM=<from-address>

# Initial admin (created on first start if no admin exists)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<password>
ADMIN_EMAIL=<email>

# AI verification
ANTHROPIC_API_KEY=<key>

# Push notifications (VAPID) — generate with:
#   node -e "const c=require('crypto').createECDH('prime256v1');c.generateKeys();console.log(c.getPublicKey('base64url'));console.log(c.getPrivateKey('base64url'))"
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Passkey / WebAuthn (optional — defaults to localhost for dev)
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_ORIGIN=https://yourdomain.com

# Optional integrations
PORTAL_SHARED_SECRET=<secret>      # JWT secret for the self-service portal's login flow
USE_ADMIN_RELATIONSHIPS=true       # enable n:m admin-user supervision
DISABLE_FEEDBACK=true              # hide the in-app feedback button (disables upstream forwarding)
TELEMETRY_URL=<url>                # optional telemetry endpoint
TELEMETRY_INSTANCE_ID=<id>         # optional instance identifier
ENABLE_DEMO=true                   # optional: allow /api/admin/demo endpoint
BUILD_DATE=<iso-date>              # optional: shown in footer; set at build time
```

### Database

```bash
# Apply migrations
npx prisma migrate deploy

# (Optional) Open database browser
DATABASE_URL="file:./dev.db" npx prisma studio
```

### Run

```bash
npm run dev
```

The app starts at `http://localhost:3000`. Default port is 3000 — override with `PORT=<port>`.

## Docker

### Build

```bash
docker build \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t kg-tracker .
```

### Run

```bash
docker run -d \
  --name kg-tracker \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  kg-tracker
```

The container starts as `root` to fix volume ownership, then drops to `www-data` via `su-exec`. Uses a multi-stage build (Node.js 24 Alpine) with standalone Next.js output. The `/app/data` volume persists the SQLite database and uploaded photos.

At startup, the entrypoint script automatically runs Prisma migrations and creates the initial admin user (if none exists). See the [Self-Hosting](#self-hosting) section below for a sample `docker-compose.yml` and a complete `.env` template.

## Self-Hosting

You are free to run the tracker on your own server for **any noncommercial purpose** — personal use, hobby projects, non-profit communities, and the like — under the terms of the [PolyForm Noncommercial License 1.0.0](./LICENSE.md). Commercial use (e.g. running it as a paid service for others) is not covered by this license.

The core dependencies (Node, SMTP, Anthropic API key, VAPID keys) are already listed under [Prerequisites](#prerequisites) — the infrastructure pieces a production deployment adds on top are:

- A public domain with TLS (Let's Encrypt or your own certificate)
- A reverse proxy with TLS termination — e.g. [Traefik](https://traefik.io/), Caddy, or nginx
- Persistent storage for the `/app/data` volume (SQLite database + uploaded photos)

Minimal production deployment:

1. Point a domain / subdomain (e.g. `tracker.example.com`) at your server.
2. Set up your reverse proxy with HTTPS and route to port `3000` of the container.
3. Create a production `.env` file (see below) alongside the `docker-compose.yml`.
4. `docker compose up -d --build`.
5. Back up the `kg-data` volume regularly — it holds the entire SQLite database and all uploads.

### Sample `docker-compose.yml`

The repository already ships a basic `docker-compose.yml`. Below is an example expanded with a Traefik-style reverse proxy label set — adapt to your own proxy (Caddy, nginx, etc.):

```yaml
services:
  kg-tracker:
    build: .
    # Or use a pre-built image:
    # image: ghcr.io/<your-org>/kg-tracker:latest
    container_name: kg-tracker
    init: true
    restart: unless-stopped
    env_file:
      - .env                       # see "Sample .env" below
    volumes:
      - kg-data:/app/data          # SQLite DB + uploads (persistent)
    # If you terminate TLS inside Docker with Traefik:
    # (requires a 'letsencrypt' certresolver + 'websecure' entrypoint in your Traefik config)
    # labels:
    #   - "traefik.enable=true"
    #   - "traefik.http.routers.kg-tracker.rule=Host(`tracker.example.com`)"
    #   - "traefik.http.routers.kg-tracker.entrypoints=websecure"
    #   - "traefik.http.routers.kg-tracker.tls.certresolver=letsencrypt"
    #   - "traefik.http.services.kg-tracker.loadbalancer.server.port=3000"
    # networks:
    #   - traefik-public

    # If you terminate TLS upstream (system nginx, Caddy, Cloudflare Tunnel, …):
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  kg-data:

# networks:
#   traefik-public:
#     external: true
```

### Sample `.env`

Create a `.env` next to `docker-compose.yml` (add it to `.gitignore`, never commit):

```env
# --- Required ---
NEXTAUTH_SECRET=<generate with: openssl rand -base64 48>
NEXTAUTH_URL=https://tracker.example.com

# SMTP for password reset + notifications
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
SMTP_FROM="KG Tracker <no-reply@example.com>"

# Initial admin (only used on first container start if no admin exists).
# ⚠ If you omit these the entrypoint falls back to username=admin / password=admin123 —
# always set your own on the first boot.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
ADMIN_EMAIL=admin@example.com

# Passkey / WebAuthn — must match your public domain
WEBAUTHN_RP_ID=tracker.example.com
WEBAUTHN_RP_ORIGIN=https://tracker.example.com

# --- Strongly recommended ---
# AI inspection verification (Claude Vision). Omit to disable AI features.
ANTHROPIC_API_KEY=<key>

# Web-push (VAPID). Generate once with:
#   node -e "const c=require('crypto').createECDH('prime256v1');c.generateKeys();console.log(c.getPublicKey('base64url'));console.log(c.getPrivateKey('base64url'))"
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_SUBJECT=mailto:admin@example.com

# --- Optional ---
# USE_ADMIN_RELATIONSHIPS=true      # enable n:m admin↔user supervision
# DISABLE_FEEDBACK=true             # hide the in-app feedback button entirely
# TELEMETRY_URL=<url>               # optional telemetry endpoint
# TELEMETRY_INSTANCE_ID=<id>
```

### In-App Feedback

By default the tracker shows a feedback button in the header that lets users
send bug reports, ideas, or thanks to the project maintainer. Submissions are
POSTed to `https://portal.chastitytracker.ch/api/app-feedback` — **only** the
message text, page path, app version, and platform are transmitted. Username,
IP, and any user identifier stay on your server.

The form shows users exactly what gets shared before they submit.

If you'd prefer to disable this entirely (no button, no forwarding):

```env
DISABLE_FEEDBACK=true
```

`BUILD_DATE` is a build-time variable (baked in at image build, not read from `.env`) — see the `--build-arg` in the [Docker Build](#build) section.

**Do not** include `DATABASE_URL` in `.env` — the Docker entrypoint hard-sets it to `file:/app/data/prod.db` inside the volume. Overriding it is a good way to lose data.

> **Don't want to self-host?**
> A hosted version is available at [chastitytracker.ch](https://chastitytracker.ch) — a hobby-run, no-fee portal that registers your account and automatically provisions a tracker instance on a shared server. No SLA. Good fit for users who don't want to run their own server. See the website for details and terms.

## Project Structure

```
src/
  app/
    api/                    # REST API routes
      admin/                # User management, training goals, inspections, lock requests
      auth/                 # Password reset + passkey registration/authentication
      entries/              # Lock/unlock/inspection/orgasm CRUD
      devices/              # Device (KG) CRUD
      upload/               # Photo upload
      uploads/              # Auth-protected photo serving
      verify-kontrolle/     # AI inspection verification
      detect-seal/          # AI seal-number detection
      push/                 # Push notification subscription
    dashboard/              # User-facing pages (entries, devices, stats, settings)
    admin/                  # Admin pages with shared user-detail layout
    entries/                # Shared entry-form cores (used by both user and admin)
    components/             # Shared React components
    hooks/                  # Custom hooks (photo upload, entries cache, offline queue,
                            #               useTick, useEntrySubmit, etc.)
  lib/
    auth.ts                 # NextAuth configuration
    prisma.ts               # Prisma client singleton
    constants.ts            # Validation constants, enums, shared payload validator
    queries.ts              # Shared server queries (getIsLocked, getUserDeviceOptions,
                            #   validateDeviceOwnership, getActiveVorgabe)
    kontrollen.ts           # Inspection row pipeline (shared by admin list views)
    utils.ts                # Duration formatting, wear-pair calculation
    mail.ts                 # Nodemailer wrapper
    authGuards.ts           # API route auth helpers
    webauthn.ts             # WebAuthn/Passkey configuration and token store
    haptics.ts              # Vibration API helpers (Android)
    idb.ts                  # IndexedDB helpers (offline cache + queue)
  proxy.ts                  # Route protection (replaces middleware.ts in Next.js 16)
prisma/
  schema.prisma             # Database schema
  migrations/               # Migration history
messages/
  de.json                   # German translations
  en.json                   # English translations
data/
  uploads/                  # User-uploaded photos (volume mount)
  logs/                     # Access logs
```

## API Reference

### Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/entries` | List entries for current user |
| `POST` | `/api/entries` | Create entry (lock, unlock, inspection, orgasm) |
| `PATCH` | `/api/entries/[id]` | Update entry |
| `DELETE` | `/api/entries/[id]` | Delete entry |
| `POST` | `/api/admin/entries` | Admin: create entry for another user |

### Devices

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices` | List current user's devices (or `?userId=` for admin) |
| `POST` | `/api/devices` | Create device |
| `PATCH` | `/api/devices/[id]` | Update device (name, description, photo, price, archivedAt) |
| `DELETE` | `/api/devices/[id]` | Delete device (only if no entries reference it) |

### Photos

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload photo (extension whitelist + magic-byte check, 10 MB limit) |
| `GET` | `/api/uploads/[...path]` | Serve photo (auth-protected) |
| `POST` | `/api/detect-seal` | Detect seal-number presence in photo |

### Inspections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/verify-kontrolle` | AI verification of handwritten code in photo |
| `POST` | `/api/admin/kontrolle` | Request inspection (sends 5-digit code via email) |
| `GET` | `/api/admin/kontrollen` | List all inspections (admin) |
| `PATCH` | `/api/admin/kontrollen/[id]` | Withdraw or manually verify inspection (admin) |

### Lock Requests & Sperrzeiten

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/verschluss-anforderung` | Create lock request or lock period (admin). Supports `dauerH` (min wear), `deviceId` (required device), `reinigungErlaubt` (allow cleaning openings) |
| `PATCH` | `/api/admin/verschluss-anforderung/[id]` | Withdraw a lock request or period (admin) |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List users |
| `POST` | `/api/admin/users` | Create user |
| `PATCH` | `/api/admin/users/[id]` | Update user |
| `DELETE` | `/api/admin/users/[id]` | Delete user |
| `GET/POST` | `/api/admin/vorgaben` | List / create training goals |
| `PATCH/DELETE` | `/api/admin/vorgaben/[id]` | Update / delete training goal |
| `GET/PATCH` | `/api/admin/notifications` | Get / update per-user notification preferences (`?userId=`) |
| `POST` | `/api/admin/strafe` | Record a penalty (offense type + refId + note) |
| `POST` | `/api/admin/demo` | Create demo user with sample data (requires `ENABLE_DEMO=true`) |

### Auth, Passkeys & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Reset password with token |
| `POST` | `/api/auth/passkey/register` | Generate passkey registration options |
| `PUT` | `/api/auth/passkey/register` | Verify and store new passkey |
| `POST` | `/api/auth/passkey/authenticate` | Generate passkey authentication challenge |
| `PUT` | `/api/auth/passkey/authenticate` | Verify passkey and return session token |
| `GET` | `/api/auth/passkey/list` | List user's passkeys |
| `DELETE` | `/api/auth/passkey/list` | Remove a passkey |
| `POST` | `/api/auth/lockout` | Check login lockout status |
| `PATCH` | `/api/settings/password` | Change own password |
| `PATCH` | `/api/settings/email` | Change own email |
| `PATCH` | `/api/settings/upload` | Toggle mobile/desktop upload behavior |

### Misc

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/version` | Returns `{ version, buildDate }` |
| `GET` | `/api/push/vapid-public-key` | VAPID public key for web-push subscription |
| `POST` | `/api/push/subscribe` | Register web-push subscription |
| `POST` | `/api/push/native-subscribe` | Register native iOS/Android push token (Capacitor) |
| `POST` | `/api/portal-login` | JWT-based portal login (requires `PORTAL_SHARED_SECRET`) |
| `GET` | `/api/apple-app-site-association` | iOS Universal Links manifest |

## Database Schema

| Model | Purpose |
|-------|---------|
| `User` | Accounts with username, email, role (`user` / `admin`), cleaning-policy settings |
| `Entry` | Events: lock, unlock, inspection, orgasm (with photo, EXIF, notes, device) |
| `Device` | Chastity belts per user — name, description, photo, purchase price, archived state |
| `TrainingVorgabe` | Admin-set wear-time goals per user per period |
| `KontrollAnforderung` | Inspection requests with 5-digit code and deadline |
| `VerschlussAnforderung` | Lock requests (`ANFORDERUNG`) and lock periods (`SPERRZEIT`); optional device requirement and `reinigungErlaubt` flag |
| `StrafeRecord` | Penalty records — cleaning-limit violations, wrong-device usage, missed inspections |
| `NotificationPreference` | Per-user, per-event email/push notification settings |
| `PushSubscription` / `NativePushToken` | Web Push endpoints and native-iOS/Android tokens |
| `Passkey` | WebAuthn credentials for biometric login |
| `AdminUserRelationship` | Many-to-many admin-user supervision mapping |
| `PortalTokenUsed` | Replay protection for portal-login JWTs |
| `PasswordResetToken` | Time-limited password reset tokens (1h validity) |
| `RateLimit` | DB-backed rate-limiting (login attempts, etc.) |
| `AppMeta` | Key-value metadata store (last-seen version, etc.) |

## Contributing

Contributions are welcome. By submitting a pull request you agree that your contribution is licensed under the same terms as the project (PolyForm Noncommercial 1.0.0).

1. Create a feature branch from `main`.
2. Follow the existing code conventions — shared UI primitives (see `src/app/components/`), i18n for all visible strings (`next-intl`, both `de.json` and `en.json`), and the form / API conventions already used throughout the codebase.
3. When changing `prisma/schema.prisma`, create a migration: `DATABASE_URL="file:./dev.db" npx prisma migrate dev --name <name>`.
4. `npm run build` must pass cleanly before opening a pull request.
5. Bump the version in `package.json` and add a matching entry to `src/data/changelog.json` in the same commit as the feature/fix.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](./LICENSE.md).

In plain terms:
- **You may** use, copy, modify, and self-host this software for any noncommercial purpose (personal use, hobby projects, non-profit communities, research, education).
- **You may not** use the software to run a commercial service for others, re-sell it, or offer paid hosting of it.
- **No warranty.** The software is provided as-is.

> The above is an informal summary for orientation. The binding terms — including the definition of "noncommercial" — are in [LICENSE.md](./LICENSE.md).

The copyright holder retains the right to operate [chastitytracker.ch](https://chastitytracker.ch) and to offer commercial licenses or services on separate terms.

Copyright © 2026–present trublue-2 &lt;info@trublue.ch&gt;.
