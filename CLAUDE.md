# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-User Web-App zur Erfassung von Keuschheitsgürtel-Einschlusszeiten. Benutzer werden in der DB mit bcrypt-Passwort gespeichert. Admins verwalten Benutzer, setzen Trainingsvorgaben und sehen Statistiken. Jeder Benutzer kann Einschlüsse (VERSCHLUSS/OEFFNEN), Prüfungen (PRUEFUNG) und Orgasmen (ORGASMUS) mit Zeitstempel, Foto und Notiz erfassen.

## Commands

```bash
npm run dev       # Dev-Server starten (http://localhost:3000)
npm run build     # Produktions-Build
npm run start     # Produktions-Server starten

# Prisma
DATABASE_URL="file:./dev.db" npx prisma migrate dev --name <name>  # Migration erstellen
DATABASE_URL="file:./dev.db" npx prisma studio                     # DB-Browser öffnen
npx prisma generate                                                  # Client regenerieren
```

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · NextAuth.js v5 (Credentials) · Prisma 5 + SQLite · Tailwind CSS v4 · next-intl v4

**Auth flow:** `src/proxy.ts` schützt alle `/dashboard`- und `/api`-Routen (außer `/api/auth`). Credentials werden gegen DB-User mit bcrypt geprüft. `role`-Feld: `"user"` oder `"admin"`. (Next.js 16: `proxy.ts` statt `middleware.ts`)

**DB-Modelle:**
- `User` – username, email, passwordHash, role (`user`/`admin`), settings
- `Entry` – type (`VERSCHLUSS`|`OEFFNEN`|`PRUEFUNG`|`ORGASMUS`), startTime, imageUrl, imageExifTime, note, orgasmusArt, kontrollCode, verifikationStatus, oeffnenGrund
- `TrainingVorgabe` – Zeitraum mit min. Tragedauer pro Tag/Woche/Monat, pro User
- `KontrollAnforderung` – code (5-stellig), deadline (4h), userId, fulfilledAt, withdrawnAt, kommentar
- `VerschlussAnforderung` – art (`ANFORDERUNG`/`SPERRZEIT`), userId, kommentar, endetAt, fulfilledAt, withdrawnAt
- `StrafeRecord` – userId, vergehenTyp, bestraftAt, notiz (Strafbuch)
- `NotificationPreference` – userId, eventType, mail, push (pro Event-Typ)
- `PushSubscription` – userId, endpoint, keys (Web Push VAPID)
- `AdminUserRelationship` – adminId, userId (many-to-many)
- `PasswordResetToken` – token, userId, expiresAt (1h)
- `RateLimitEntry` – key, count, expiresAt (DB-basiertes Rate Limiting)

**Key files:**
- `src/lib/auth.ts` – NextAuth-Konfiguration (Credentials + bcrypt, JWT-Strategie)
- `src/lib/prisma.ts` – Prisma-Client Singleton
- `src/lib/utils.ts` – `formatDuration()`, `formatDateTime()`, `toDatetimeLocal()`
- `src/app/dashboard/page.tsx` – Übersicht: Paare (VERSCHLUSS+OEFFNEN), Prüfungen, Orgasmen
- `src/app/dashboard/new/` – Formular-Seiten je Typ (verschluss, oeffnen, pruefung, orgasmus)
- `src/app/dashboard/edit/[id]/page.tsx` – Eintrag bearbeiten
- `src/app/dashboard/stats/page.tsx` – eigene Statistik-Seite (nutzt `StatsMain`)
- `src/app/admin/` – Benutzerverwaltung, Vorgaben, User-Statistiken; `/admin/users/[id]/kontrollen` – Kontrollen-History pro User
- `src/app/components/StatsMain.tsx` – serverseitiger Statistik-Block (Kalender, Monatsübersicht, Trainingsziele); wird von `/dashboard/stats` und `/admin/users/[id]/stats` geteilt
- `src/app/dashboard/settings/page.tsx` – Benutzereinstellungen (Passwort, E-Mail ändern)
- `src/app/forgot-password/page.tsx` + `src/app/reset-password/page.tsx` – Passwort-Reset via E-Mail-Token
- `src/lib/mail.ts` – nodemailer-Wrapper (`sendMail`)
- `src/lib/accessLog.ts` – schreibt IP/UserAgent/Pfad nach `data/logs/access.log` (NDJSON)

**API Routes:**
- `GET/POST /api/entries` – Einträge abrufen / erstellen
- `PATCH/DELETE /api/entries/[id]` – Eintrag bearbeiten / löschen
- `POST /api/upload` – Foto hochladen
- `GET /api/uploads/[...path]` – Fotos ausliefern (auth-geschützt)
- `GET/POST /api/admin/users` – Benutzerliste / neuen User anlegen
- `PATCH/DELETE /api/admin/users/[id]` – User bearbeiten / löschen
- `GET/POST /api/admin/vorgaben` – Trainingsvorgaben
- `PATCH/DELETE /api/admin/vorgaben/[id]` – Vorgabe bearbeiten / löschen
- `PATCH /api/settings/password` – Eigenes Passwort ändern
- `POST /api/admin/demo` – DemoUser mit Beispieldaten anlegen (nur Admin)
- `POST /api/admin/kontrolle` – Kontrolle anfordern: sendet 5-stelligen Code per E-Mail, 4h Frist (nur Admin, User muss verschlossen sein)
- `POST /api/auth/forgot-password` – Passwort-Reset-Token per E-Mail senden
- `POST /api/auth/reset-password` – Passwort mit Token zurücksetzen
- `POST /api/verify-kontrolle` – Handgeschriebenen Code im Foto per Claude Vision erkennen (Auth required, body: `{ imageUrl, expectedCode }`, returns `{ detected, match }`)
- `GET /api/admin/kontrollen` – Alle KontrollAnforderungen mit User-Info und Entry-Status (Admin)
- `PATCH /api/admin/kontrollen/[id]` – Kontrolle zurückziehen (`action: "withdraw"`) oder manuell verifizieren (`action: "manuallyVerify"`) (Admin)
- `GET /api/version` – gibt `{ version, buildDate }` zurück (aus `package.json` + `BUILD_DATE` env)

**ENV-Variablen** (`.env.local`):
```
NEXTAUTH_SECRET=<random>
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"
SMTP_HOST=<host>
SMTP_PORT=587
SMTP_USER=<user>
SMTP_PASS=<pass>
SMTP_FROM=<from-address>
ANTHROPIC_API_KEY=<key>
```


## Architektur-Konventionen

Diese Regeln verhindern, dass gleiche Features unterschiedlich implementiert werden. **Vor jeder neuen Komponente oder Form: grep nach bestehendem Pattern.**

### Wiederverwendung vor Neubau
- **Bevor du eine Komponente, einen Hook oder eine Utility-Funktion schreibst:** Durchsuche `src/app/components/`, `src/app/hooks/`, `src/lib/` nach bestehenden Lösungen.
- **Gleicher JSX in >1 Datei → sofort extrahieren** nach `src/app/components/`. Keine Ausnahme für "kleine" Blöcke — auch 10-Zeilen-Banner werden zu Komponenten wenn sie an 2+ Stellen vorkommen.
- **Gleiche Lookup-Maps** (TYPE_LABELS, STATUS_COLOR, etc.) gehören in `src/lib/constants.ts`, nicht lokal in Seiten-Dateien.

### Form-Konventionen
- **Loading-State** heisst immer `saving` (nicht `loading`)
- **Fehler-Anzeige** immer über styled Card: `text-sm text-warn bg-warn-bg border border-[var(--color-warn-border)] rounded-xl px-4 py-3`
- **Network-Errors** immer via `try/catch` mit User-Feedback — kein unhandled Promise
- **Nach Submit:** `router.push(redirectTo ?? "/dashboard")` — kein `router.refresh()` nach `router.push()`
- **Validierung** über zentrale Konstanten (`src/lib/constants.ts`), nicht inline

### i18n — keine Ausnahmen
- **Jeder sichtbare String** in JSX muss aus `useTranslations()` / `getTranslations()` kommen
- **Admin-Seiten** nutzen `useTranslations("admin")` — auch die `/aktionen/` Forms
- **Keine hardcoded German Strings** — auch nicht in "internen" Admin-Pages
- Wenn ein i18n-Key fehlt: anlegen in `messages/de.json` UND `messages/en.json`

### Shared Abstractions (bestehend — immer zuerst hier suchen!)

**Components:**
- `src/app/components/AdminActionFormShell.tsx` — Wrapper für Admin-Aktionsformulare (Back-Link + Card mit Icon-Header)
- `src/app/components/DateTimePicker.tsx` — Datetime-Input mit Label, Error, Hint, ARIA (statt `<Input type="datetime-local">`)
- `src/app/components/KontrolleBanner.tsx` — Kontroll-Status-Banner (compact + large)
- `src/app/components/FormError.tsx` — Styled Error-Card für Formulare
- `src/app/components/Card.tsx` — Standard-Card mit optionalem Padding
- `src/app/components/Button.tsx` — Button mit Loading-State und Icon
- `src/app/components/ImageViewer.tsx` + `FullscreenImageModal` — Bild-Anzeige + Vollbild-Modal

**Hooks:**
- `src/app/hooks/usePhotoUpload.ts` — Upload + EXIF + Seal-Detect (für alle Foto-Forms)

**Utilities:**
- `src/lib/authGuards.ts` — `requireAdminApi()`, `assertAdmin()`
- `src/lib/constants.ts` — `VALID_TYPES`, `OEFFNEN_GRUENDE`, `ORGASMUS_ARTEN`, `isValidImageUrl()`, `validatePassword()`, `parseOrgasmusArtBase()`, `PASSWORD_MIN_LENGTH`, `BCRYPT_MAX_BYTES`
- `src/lib/utils.ts` — `buildWearPairs()`, `wearingHoursFromPairs()`, `isTimeCorrected()`, `formatDuration()`, `formatDateTime()`, `toDatetimeLocal()`
- `src/lib/queries.ts` — `getIsLocked()`, `getActiveVorgabe()`
- `src/lib/kontrollePills.ts` — `ANFORDERUNG_PILLS`, `getKombinierterPill()`
- `src/app/dashboard/EntryActions.tsx` — Drei-Punkte-Menü (Edit + optional Delete)

### Changelog
- Erlaubte `type`-Werte: `feat`, `fix`, `security`, `perf`, `chore`, `ui` — **nicht** `refactor`
- Version bump + Changelog immer im **gleichen Commit** wie die Änderung

## Design System – Shared Primitives

Alle UI-Elemente MÜSSEN auf den gemeinsamen Shared Primitives basieren. Erfinde NIEMALS neue Farben, Abstände, Schriftgrössen, Schatten oder Border-Radii. Verwende ausschliesslich die definierten Tokens.

### Regeln

1. **Keine Magic Numbers:** Jeder Wert (Farbe, Abstand, Radius, Schatten, Schriftgrösse) muss aus den definierten Primitives stammen. Hardcodierte Werte wie `padding: 13px` oder `color: #3b82f6` sind verboten.
2. **Komponenten wiederverwenden:** Bevor du ein neues UI-Element erstellst, prüfe ob eine bestehende Komponente in `/src/app/components/` existiert. Erstelle neue Komponenten nur, wenn keine passende vorhanden ist.
3. **Erweiterungen nur über Primitives:** Wenn ein neues Element nötig ist, baue es ausschliesslich aus bestehenden Tokens zusammen. Neue Tokens nur nach expliziter Absprache.
4. **Konsistenz vor Kreativität:** Alle Screens und Komponenten sollen visuell zusammengehörig wirken. Kein Element darf "anders" aussehen, nur weil es neu ist.


## Interaktionsmuster & Verhaltensrichtlinien

### Immer klärende Fragen stellen, wenn:
- Die Absicht unsicher oder mehrdeutig ist
- Die Aufgabenbeschreibung mehrere Interpretationen zulässt oder Details fehlen
- Mehrere technische Ansätze möglich sind
- Das Implementierungsmuster, die Bibliothek oder die Architektur nicht spezifiziert ist
- Feldnamen, Geschäftsregeln oder technische Details nicht explizit sind

### Plan vorlegen & auf Freigabe warten, wenn:
- Die Aufgabe mehrere Schritte oder Komponenten umfasst
- Mehrere gültige Implementierungsansätze existieren
- Modifikationen bestehende Funktionalität beeinflussen

### Vor der Ausführung bestätigen, wenn:
- Kernfunktionalität modifiziert oder gelöscht wird
- Kritische Geschäftslogik angepasst wird
- Das erwartete Ergebnis nicht explizit angegeben ist
