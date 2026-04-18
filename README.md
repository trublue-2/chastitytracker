# Chastity Tracker

> Multi-user web application for tracking chastity device wear times, inspections, training goals, and device (KG) usage statistics.

![Version](https://img.shields.io/badge/version-4.12.7-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
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

At startup, the entrypoint script automatically runs Prisma migrations and creates the initial admin user (if none exists). `DATABASE_URL` is set by the entrypoint — do **not** include it in the `.env` file passed to the container.

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

This is a proprietary project. If you have access to the repository:

1. Create a feature branch from `main`
2. Follow the existing code conventions — see `CLAUDE.md` for detailed patterns (shared primitives, i18n, form conventions, security rules)
3. All visible strings must use i18n (`next-intl`) — no hardcoded text in JSX, including admin pages
4. Every commit must follow the **mandatory commit sequence**: implement → `/simplify` → `npm run build` → changelog + version bump → commit (all in a single commit; see `CLAUDE.md` for details)
5. Git author must be configured locally as `trublue-2 <info@trublue.ch>`

## License

Proprietary. All rights reserved.
