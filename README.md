# KG-Tracker

Web-Applikation zur Erfassung von Keuschheitsgürtel-Einschlusszeiten. Benutzer können Verschlüsse, Öffnungen, Prüfungen und Orgasmen mit Zeitstempel, Foto und Notiz erfassen. Admins verwalten Benutzer, setzen Trainingsvorgaben und sehen Statistiken.

## Stack

- **Next.js 14** (App Router)
- **NextAuth.js v5** (Credentials-Authentifizierung)
- **Prisma 5** + SQLite
- **Tailwind CSS**
- **Docker** (Produktion)
- **Traefik** (Reverse-Proxy, SSL via Let's Encrypt)

## Features

- Einträge erfassen: Verschluss, Öffnen, Prüfung, Orgasmus – mit Foto (EXIF-Zeitauswertung), Notiz und Zeitstempel
- Statistik-Seite mit Kalenderansicht und Monatsübersicht
- Trainingsvorgaben (min. Tragedauer pro Tag/Woche/Monat)
- Admin-Bereich: Benutzerverwaltung, Vorgaben, User-Statistiken, Demo-User
- Passwort-Reset via E-Mail (SMTP)
- Mobile-optimiertes UI
- Multi-Instanz-Betrieb: mehrere unabhängige Instanzen auf einem Server

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- npm

### Setup

```bash
# Abhängigkeiten installieren
npm install

# Umgebungsvariablen konfigurieren (Werte anpassen)
cp .env.local.example .env.local

# Datenbank initialisieren
DATABASE_URL="file:./dev.db" npx prisma migrate dev

# Dev-Server starten
npm run dev
```

App läuft unter [http://localhost:3000](http://localhost:3000).

### Umgebungsvariablen (`.env.local`)

```env
NEXTAUTH_SECRET=<langer-zufaelliger-string>   # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"

# SMTP (für Passwort-Reset)
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Erster Admin-User (wird beim Start einmalig angelegt falls kein Admin existiert)
INITIAL_ADMIN_USERNAME=
INITIAL_ADMIN_PASSWORD=
INITIAL_ADMIN_EMAIL=

# Claude Vision (für Kontrollfoto-Auswertung)
ANTHROPIC_API_KEY=
```

### Nützliche Befehle

```bash
npm run dev          # Dev-Server
npm run build        # Produktions-Build
npm run start        # Produktions-Server
npm run changelog    # Version bumpen + Changelog-Eintrag erfassen

# Prisma
DATABASE_URL="file:./dev.db" npx prisma migrate dev --name <name>   # Migration erstellen
DATABASE_URL="file:./dev.db" npx prisma studio                      # DB-Browser
npx prisma generate                                                   # Client regenerieren
```

## Deployment (Multi-Instanz)

Das Projekt läuft produktiv mit **Traefik** als Reverse-Proxy. Mehrere unabhängige Instanzen (je eigene Domain, DB und Daten) können auf einem Server betrieben werden.

### Infrastruktur-Übersicht

```
Internet :80/:443
       │
    Traefik
       ├── *.trublue.ch          → Docker-Container (kg-app)
       ├── *.chastitytracker.ch  → Docker-Container (kg-app)
       └── *.chastity-tracker.com→ Docker-Container (kg-app)
```

### Traefik aufsetzen (einmalig)

```bash
cp -r infra/traefik ~/traefik
touch ~/traefik/acme.json && chmod 600 ~/traefik/acme.json
cd ~/traefik && docker compose up -d
```

### Neue Instanz anlegen

```bash
./infra/deploy-instance.sh create <name> <domain>
# Beispiel:
./infra/deploy-instance.sh create kunde1 kunde1.trublue.ch
```

Das Skript:
1. Liest SMTP + ANTHROPIC_API_KEY aus `~/.env.production`
2. Fragt Username/Passwort/E-Mail für den ersten Admin ab
3. Startet einen neuen Docker-Container mit Traefik-Labels
4. Beim App-Start wird der Admin-User automatisch angelegt (`instrumentation.ts`)

### Instanz entfernen

```bash
./infra/deploy-instance.sh remove <name>           # Daten behalten
./infra/deploy-instance.sh remove <name> --purge   # Alles löschen
```

### GitHub Actions

Der Workflow **Build, Push & Deploy** wird manuell via `workflow_dispatch` angestossen und:
1. Baut das Docker-Image und pusht es in die GitHub Container Registry
2. Deployt auf den Server via SSH (`docker compose pull && docker compose up -d`)

## Datenbankmodelle

| Modell | Felder |
|--------|--------|
| `User` | username, email, passwordHash, role (`user`/`admin`) |
| `Entry` | type (`VERSCHLUSS`/`OEFFNEN`/`PRUEFUNG`/`ORGASMUS`), startTime, imageUrl, imageExifTime, note, orgasmusArt |
| `TrainingVorgabe` | userId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH |
| `PasswordResetToken` | token, userId, expiresAt (1h) |
| `KontrollAnforderung` | code (5-stellig), deadline (4h), userId, fulfilledAt, withdrawnAt, manuallyVerifiedAt |

## API-Übersicht

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| GET/POST | `/api/entries` | Einträge abrufen / erstellen |
| PATCH/DELETE | `/api/entries/[id]` | Eintrag bearbeiten / löschen |
| POST | `/api/upload` | Foto hochladen (max. 10 MB) |
| GET | `/api/uploads/[...path]` | Fotos ausliefern (auth-geschützt) |
| GET/POST | `/api/admin/users` | Benutzerliste / neuen User anlegen |
| PATCH/DELETE | `/api/admin/users/[id]` | User bearbeiten / löschen |
| GET/POST | `/api/admin/vorgaben` | Trainingsvorgaben verwalten |
| PATCH | `/api/settings/password` | Eigenes Passwort ändern |
| POST | `/api/auth/forgot-password` | Reset-Token per E-Mail senden |
| POST | `/api/auth/reset-password` | Passwort mit Token zurücksetzen |
| POST | `/api/admin/demo` | Demo-User anlegen (nur Admin) |
| POST | `/api/admin/kontrolle` | Kontrolle anfordern (5-stelliger Code per E-Mail) |
| POST | `/api/verify-kontrolle` | Kontrollfoto per Claude Vision auswerten |
| GET | `/api/version` | Version + Build-Datum |
