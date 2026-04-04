# Chastity Tracker

> Multi-user web application for tracking chastity device wear times, inspections, and training goals.

![Version](https://img.shields.io/badge/version-4.5.0-blue)
![License](https://img.shields.io/badge/license-Proprietary-red)
![Node](https://img.shields.io/badge/node-24+-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-16-black)

<!-- screenshot -->

## Features

### User Features

- Lock/unlock event logging with timestamps, photos, and notes
- Photo upload with EXIF metadata extraction and seal detection
- AI-powered inspection verification (Claude Vision reads handwritten codes from photos)
- Real-time wear duration timer
- Personal statistics with calendar heatmap, monthly overview, and training goal progress
- Orgasm tracking with categorization
- Password self-service (change, reset via email)
- Push notifications (PWA) for lock/unlock events, inspections, and more
- Passkey login (Face ID, Touch ID, Fingerprint, Windows Hello)
- Offline-first with IndexedDB caching and background sync
- View Transitions for smooth page navigation
- Full i18n support (German and English)
- Installable as a Progressive Web App with splash screens and app shortcuts

### Admin Features

- User management (create, edit, delete, demo user generation)
- Training goals per user (daily / weekly / monthly minimum wear hours)
- Inspection requests with 5-digit verification codes and 4-hour deadlines
- Lock-up requests and lock periods
- Penalty tracking for missed inspections or unauthorized openings
- Per-user notification preferences (email + push, per event type)
- Admin-user relationship model (multi-admin support via feature flag)
- User statistics overview and inspection history

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript 5 |
| UI | React 19 + Tailwind CSS v4 |
| Auth | NextAuth.js v5 (Credentials + Passkey/WebAuthn, JWT strategy, bcrypt) |
| Database | Prisma 5 + SQLite |
| AI | Anthropic Claude SDK (inspection photo verification) |
| Images | Sharp (processing) + Exifr (EXIF extraction) |
| Email | Nodemailer (SMTP) |
| Push | web-push (VAPID) |
| i18n | next-intl v4 |
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
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<password>
INITIAL_ADMIN_EMAIL=<email>

# AI verification
ANTHROPIC_API_KEY=<key>

# Push notifications (VAPID) — generate with: node -e "const c=require('crypto').createECDH('prime256v1');c.generateKeys();console.log(c.getPublicKey('base64url'));console.log(c.getPrivateKey('base64url'))"
VAPID_PUBLIC_KEY=<generated-public-key>
VAPID_PRIVATE_KEY=<generated-private-key>
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Passkey / WebAuthn (optional — defaults to localhost for dev)
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_ORIGIN=https://yourdomain.com
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

The container runs as non-root (`www-data`), uses a multi-stage build (Node.js 24 Alpine), and outputs standalone Next.js. The `/app/data` volume persists the SQLite database and uploaded photos.

At startup, the entrypoint script runs Prisma migrations automatically.

## Project Structure

```
src/
  app/
    api/              # REST API routes
      admin/          # User management, training goals, inspections
      auth/           # Password reset
      entries/        # Lock/unlock/inspection/orgasm CRUD
      upload/         # Photo upload
      uploads/        # Auth-protected photo serving
      verify-kontrolle/ # AI inspection verification
      push/           # Push notification subscription
    dashboard/        # User-facing pages (entries, stats, settings)
    admin/            # Admin pages (users, goals, inspections)
    components/       # Shared React components
    hooks/            # Custom hooks (photo upload, entries cache, offline queue, etc.)
  lib/
    auth.ts           # NextAuth configuration
    prisma.ts         # Prisma client singleton
    constants.ts      # Validation constants, enums, lookup maps
    utils.ts          # Duration formatting, wear pair calculation
    mail.ts           # Nodemailer wrapper
    authGuards.ts     # API route auth helpers
    webauthn.ts       # WebAuthn/Passkey configuration and token store
    haptics.ts        # Vibration API helpers (Android)
    idb.ts            # IndexedDB helpers (offline cache + queue)
  proxy.ts            # Route protection (replaces middleware.ts)
prisma/
  schema.prisma       # Database schema
  migrations/         # Migration history
messages/
  de.json             # German translations
  en.json             # English translations
data/
  uploads/            # User-uploaded photos (volume mount)
  logs/               # Access logs
```

## API Reference

### Entries

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/entries` | List entries for current user |
| `POST` | `/api/entries` | Create entry (lock, unlock, inspection, orgasm) |
| `PATCH` | `/api/entries/[id]` | Update entry |
| `DELETE` | `/api/entries/[id]` | Delete entry |

### Photos

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | Upload photo (extension whitelist + magic byte check, 10 MB limit) |
| `GET` | `/api/uploads/[...path]` | Serve photo (auth-protected) |
| `POST` | `/api/detect-seal` | Detect seal presence in photo |

### Inspections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/verify-kontrolle` | AI verification of handwritten code in photo |
| `GET` | `/api/admin/kontrollen` | List all inspections (admin) |
| `PATCH` | `/api/admin/kontrollen/[id]` | Withdraw or manually verify inspection (admin) |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List users |
| `POST` | `/api/admin/users` | Create user |
| `PATCH` | `/api/admin/users/[id]` | Update user |
| `DELETE` | `/api/admin/users/[id]` | Delete user |
| `GET/POST` | `/api/admin/vorgaben` | List / create training goals |
| `PATCH/DELETE` | `/api/admin/vorgaben/[id]` | Update / delete training goal |
| `POST` | `/api/admin/kontrolle` | Request inspection (sends code via email) |
| `POST` | `/api/admin/demo` | Create demo user with sample data |

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
| `PATCH` | `/api/settings/password` | Change own password |
| `PATCH` | `/api/settings/email` | Change own email |

### Misc

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/version` | Returns `{ version, buildDate }` |
| `POST` | `/api/push/subscribe` | Register push notification subscription |

## Database Schema

| Model | Purpose |
|-------|---------|
| `User` | Accounts with username, email, role (`user` / `admin`), settings |
| `Entry` | Events: lock, unlock, inspection, orgasm (with photo, EXIF, notes) |
| `TrainingVorgabe` | Admin-set wear-time goals per user per period |
| `KontrollAnforderung` | Inspection requests with verification code and deadline |
| `VerschlussAnforderung` | Lock-up requests and lock periods |
| `StrafeRecord` | Penalty records for violations |
| `NotificationPreference` | Per-user, per-event email/push notification settings |
| `PushSubscription` | Web Push subscription endpoints per device |
| `Passkey` | WebAuthn credentials for biometric login |
| `AdminUserRelationship` | Many-to-many admin-user supervision mapping |

## Contributing

This is a proprietary project. If you have access to the repository:

1. Create a feature branch from `main`
2. Follow the existing code conventions (see `CLAUDE.md` for detailed patterns)
3. All visible strings must use i18n (`next-intl`) — no hardcoded text in JSX
4. Run `npm run build` before submitting to catch type errors
5. Version bump and changelog entry go in the same commit as the change

## License

Proprietary. All rights reserved.
