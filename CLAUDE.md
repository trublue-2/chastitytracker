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

# Tests (Vitest unit)
npm test                                     # alle Tests (vitest run)
npm run test:watch                           # Watch-Mode
npx vitest run <pfad/zur/datei.test.ts>      # einzelne Datei
```

## Deployment

Drei Workflows, alle `workflow_dispatch` (kein Auto-Deploy bei Push):

- **`.github/workflows/docker.yml`** — baut das Image, pusht es nach GHCR, ruft danach den Deploy auf.
- **`.github/workflows/promote.yml`** — befördert ein **bestehendes** Image in einen Kanal (Retag über die Registry, **kein Rebuild**). Der einzige Weg zu `:latest`.
- **`.github/workflows/deploy.yml`** — das Deploy-Skript selbst (`workflow_call`), von beiden oben genutzt. Nicht direkt dispatchbar.

**Drei Ringe — `:feature` → `:portal` → `:latest`:**

| Tag | Für wen | Wann er wandert |
|-----|---------|-----------------|
| `:feature` | trublues Instanz, Tests vor dem Merge | Feature-Branch-Build, oder `main`-Build mit `tagFeature=true` |
| `:portal` | die Portal-Instanzen | jeder `main`-Build |
| `:latest` | alle, inkl. Self-Hoster — der **offizielle Release** | nur durch `promote.yml` |
| `:v<version>`, `:sha-<sha>` | unveränderliche Referenz zum Pinnen, Promoten, Rollback | pro `main`-Build (`v…`) bzw. pro Build (`sha-…`) |

Ein `main`-Build veröffentlicht also **nichts** an Self-Hoster — das ist der Punkt der Kanäle. `:latest` bewegt sich erst, wenn du promotest, und dann per Digest-Retag: der Release ist bitgleich das Image, das die Portal-Flotte schon fährt.

**Regel — bei jedem `main`-Build IMMER `tagFeature=true`**, damit `:feature` (trublue) nie hinter `main` zurückfällt. Der Deploy leitet `pinnedTo` daraus ab und startet dann genau die Instanzen neu, deren Tag sich bewegt hat (`portal,feature`).

```bash
# Standardfall: main bauen → :portal + :feature + :v<version>, Flotte ausrollen.
gh workflow run docker.yml --ref main -f tagFeature=true

# Feature-Branch (ungemergt) → nur :feature. Der Pin-Filter (pinnedTo=feature) trifft nur
# die :feature-Instanz; `instances` zu setzen ist damit nicht mehr nötig, schadet aber nicht.
gh workflow run docker.yml --ref <feature-branch>

# Release freigeben: :latest auf ein bestehendes :v<version> retaggen (kein Build) und den
# Git-Tag `release` mitziehen. Ohne `source` = package.json-Version des Refs.
gh workflow run promote.yml --ref main -f channel=latest

# Flotte zurückrollen, ohne zu bauen: :portal auf eine ältere Version zeigen lassen.
gh workflow run promote.yml --ref main -f channel=portal -f source=v4.56.0 -f deploy=true

# Instanz umpinnen (z.B. die eigene dauerhaft auf :feature)
gh workflow run docker.yml --ref main -f tagFeature=true -f channel=feature -f instances=trublue
```

Dispatch-Inputs von `docker.yml`: `deploy` (Default `true`), `instances`, `channel` (pinnt Ziel-Instanzen um; leer = bestehende Pins behalten), `pinnedTo` (nur Instanzen mit diesem aktuellen Pin deployen; leer = automatisch aus den gebauten Tags), `tagFeature`.

**Der Pin-Filter ersetzt die frühere Pflicht, `instances` zu setzen.** Ein Dispatch mit leerem `instances` iteriert weiter über alle Ordner in `~/instances`, deployt aber nur, was auf einen der gebauten Tags gepinnt ist — ein Feature-Test kann keine fremde Instanz mehr neu starten. Passt keine Instanz auf den Filter, schlägt der Lauf bewusst fehl statt grün „0 Instanzen" zu melden. *(Vorfall 2026-07-10: ein `:feature`-Test ohne `instances` startete 27 Instanzen neu.)*

**`release` (Git-Tag) gehört zum Release-Kanal.** `promote.yml channel=latest` zieht ihn auf den Commit des promoteten Images. Von dort — nicht von `main` — lesen Tracker und Portal-Collector den Changelog für den Update-Hinweis (`src/app/api/upstream-changelog/route.ts`, `docs/update-check.md`). Wer den Tag von Hand verbiegt, verschiebt damit den Update-Hinweis der ganzen Flotte.

⚠️ **Der Tag muss existieren, bevor eine der beiden Changelog-Routen ausgerollt wird.** Fehlt er, liefert der Collector der ganzen Flotte 502 und auch der instanzeigene Fallback greift ins Leere — der Update-Hinweis ist dann still weg, bis der erste Promote läuft. Einmalig setzen, auf den Commit, aus dem das aktuelle `:latest` gebaut wurde (steht im Image-Label `org.opencontainers.image.revision`):

```bash
docker buildx imagetools inspect ghcr.io/trublue-2/chastitytracker:latest \
  --format '{{json .Image}}' | jq -r '.config.Labels["org.opencontainers.image.revision"]'
gh api -X POST repos/trublue-2/chastitytracker/git/refs -f ref=refs/tags/release -f sha=<sha>
```

**Der Pin einer Instanz lebt nur in ihrer `docker-compose.yml`** — kein DB-Feld, und seit tracker-portal v1.5.13 nur noch ein Schreiber: dieser Workflow (per `sed` aus dem `channel`-Input). Das Portal schreibt die Datei ausschliesslich beim Anlegen einer Instanz, einen Redeploy gibt es dort nicht mehr. Der Ring wird also hier gewechselt:

```bash
gh workflow run docker.yml --ref main -f tagFeature=true -f channel=feature -f instances=trublue
```

Der Instanzname `trublue` ist **nicht** schützenswert — es ist der Name des Repo-Inhabers und steht ohnehin in der Repo-URL (`trublue-2/chastitytracker`). Das Deploy-Skript anonymisiert seine Ausgabe ohnehin auf `Instanz <i>/<n>`, damit keine fremden Subdomains ins öffentliche Actions-Log gelangen. Fremde Instanznamen gehören nach wie vor nicht in einen Dispatch-Input.

Nach dem Dispatch mit `gh run watch <run-id> --exit-status` oder `gh run view <run-id>` prüfen, ob `typecheck`, `build-and-push` und `deploy` grün sind.

## Architecture

**Stack:** Next.js 16 (App Router) · React 19 · NextAuth.js v5 (Credentials) · Prisma 5 + SQLite · Tailwind CSS v4 · next-intl v4

**Auth flow:** `src/proxy.ts` schützt alle `/dashboard`- und `/api`-Routen (außer `/api/auth`). Credentials werden gegen DB-User mit bcrypt geprüft. `role`-Feld: `"user"` oder `"admin"`. (Next.js 16: `proxy.ts` statt `middleware.ts`)

**DB-Modelle:**
- `User` – username, email, passwordHash, role (`user`/`admin`), reinigungErlaubt, mobileDesktopUpload
- `Entry` – type (`VERSCHLUSS`|`OEFFNEN`|`PRUEFUNG`|`ORGASMUS`), startTime, imageUrl, imageExifTime, note, orgasmusArt, kontrollCode, verifikationStatus, oeffnenGrund
- `TrainingVorgabe` – Zeitraum mit min. Tragedauer pro Tag/Woche/Monat, pro User
- `KontrollAnforderung` – code (5-stellig), deadline (4h), userId, fulfilledAt, withdrawnAt, kommentar
- `VerschlussAnforderung` – art (`ANFORDERUNG`/`SPERRZEIT`), userId, nachricht, endetAt, dauerH, fulfilledAt, withdrawnAt
- `StrafeRecord` – userId, offenseType (`KONTROLLANFORDERUNG`|`OEFFNEN_ENTRY`), refId, bestraftDatum, notiz
- `NotificationPreference` – userId, eventType, mail, push (pro Event-Typ)
- `PushSubscription` – userId, endpoint, p256dh, auth (Web Push VAPID)
- `AdminUserRelationship` – adminId, userId (many-to-many, feature-flagged via `USE_ADMIN_RELATIONSHIPS`)
- `PasswordResetToken` – token, userId, expiresAt (1h)
- `RateLimit` – key, count, resetAt (DB-basiertes Rate Limiting, ersetzt in-memory Maps)
- `Passkey` – userId, credentialId, publicKey, counter, transports, deviceName (WebAuthn/biometrisch)
- `PortalTokenUsed` – jti, usedAt (Replay-Schutz für Portal-Login)

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
- `src/lib/push.ts` – Web Push Notifications via VAPID (`sendPushToUser()`)
- `src/lib/webauthn.ts` – Passkey/WebAuthn Konfiguration (rpId, rpOrigin)
- `src/lib/verifyCode.ts` – Vision: handschriftlichen Code im Foto erkennen + Siegel-Erkennung (via `src/lib/vision/`)
- `src/lib/vision/` – Provider-Abstraktion für Bildverifikation; `VERIFY_PROVIDER=anthropic|local` umschaltbar (lokal = Ollama, OpenAI-kompatibel). Siehe `docs/local-vision.md`. Ohne konfigurierten Provider greift der lokale Tesseract-OCR-/Schärfe-Fallback (`src/lib/ocr.ts`, `src/lib/imageReadability.ts`)
- `src/lib/appMeta.ts` – `touchAppMeta()`/`markLastAction()`: Fire-and-forget-Zeitstempel in `AppMeta`, gelesen vom Portal-`sync-activity`-Cron (`lastUsedAt` in `proxy.ts`, `lastActionAt` bei echten Business-Aktionen)
- `src/lib/serverLog.ts` – Server-seitiges Logging

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
- `POST /api/admin/verschluss-anforderung` – Verschluss-Anforderung oder Sperrzeit erstellen (Admin)
- `POST /api/detect-seal` – Siegel im Foto erkennen per Claude Vision
- `POST /api/push/subscribe` – Web Push Subscription registrieren
- `GET /api/push/vapid-public-key` – VAPID Public Key abrufen
- `POST /api/portal-login` – JWT-basierter Portal-Login (für externe Portale, `PORTAL_SHARED_SECRET`)
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
VAPID_PUBLIC_KEY=<key>
VAPID_PRIVATE_KEY=<key>
VAPID_SUBJECT=mailto:<email>
WEBAUTHN_RP_ID=<hostname>          # default: localhost
WEBAUTHN_RP_ORIGIN=<origin-url>    # default: http://localhost:3000
PORTAL_SHARED_SECRET=<secret>      # optional: Portal-Login JWT-Secret
USE_ADMIN_RELATIONSHIPS=true       # optional: Admin↔User n:m Zuordnung aktivieren
BUILD_DATE=<iso-date>              # optional: wird beim Build gesetzt
# Update-Check / anonyme Deployment-Zählung (siehe docs/update-check.md):
DISABLE_UPDATE_CENSUS=true         # optional: Census aus, Update-Check liest den Release-Tag direkt auf GitHub
UPSTREAM_CHANGELOG_URL=<url>       # optional: eigene Changelog-Quelle (dann keine Census-Header)
# OVERRIDE des Strafbuch-Stichtags der Reinigungsfenster-Regel (ISO-8601). NORMALERWEISE NICHT
# SETZEN: den Stichtag schreibt die Migration `20260714210000_cleaning_window_enforced_from` beim
# ersten Boot jeder Instanz selbst in `AppMeta.cleaningWindowEnforcedFrom` — also genau dann, wenn
# DIESE Instanz die Regel bekommt. Das Strafbuch ist eine LIVE-Ableitung: Öffnungen VOR dem Stichtag
# werden ohne Fenster-Prüfung beurteilt. Diese Variable nur zum bewussten Rückdatieren/Korrigieren.
CLEANING_WINDOW_ENFORCED_FROM=<iso-date>   # optional
# Selfhosted-KI Health-Check (nur relevant bei lokalem Vision-/Embedding-Backend):
HEALTHCHECK_INTERVAL_MIN=5         # optional: Prüfintervall in Minuten (Default 5)
HEALTHCHECK_ALERT_EMAIL=<email>    # optional: Mail-Alarm bei Ausfall (leer = nur Log). Bei mehreren
                                   #   Instanzen auf demselben KI-Host nur auf EINER setzen (Alarm-Sturm)
HEALTHCHECK_VISION=<true|false>    # optional: Vision-Probe abschalten (Default: an, wenn Vision self-hosted)
HEALTHCHECK_EMBED=<true|false>     # optional: Embedding-Probe abschalten (Default: an, wenn EMBED_BASE_URL gesetzt)
HEALTHCHECK_TIMEOUT_MS=20000       # optional: Timeout je Probe (Default 20s)
```


## Architektur-Konventionen

Diese Regeln verhindern, dass gleiche Features unterschiedlich implementiert werden. **Vor jeder neuen Komponente oder Form: grep nach bestehendem Pattern.**

> `/simplify`-Pflicht (nach JEDER Änderung, auch Einzeilern) ist zentral im **Workspace-Root-`CLAUDE.md`** geregelt → „Commit Sequence" + „Never skip `/simplify`".

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
- `src/app/components/DashboardBlock.tsx` — ein gestapelter Block der Dashboard-Spalte. Breite und Seitenrand kommen aus `--block-col`/`--block-gutter` mit der Sub-Dashboard-Spalte als Vorgabe (`max-w-2xl`/`px-4`); eine Seite, die ihre Spalte selbst aufspannt, überschreibt sie auf ihrem Container (heute nur `admin/users/[id]/layout.tsx`). **Trägt bewusst KEINE vertikalen Abstände** — der Abstand kommt vom `gap` des Elters (`dashboard/page.tsx`: `flex flex-col gap-4`), damit sich selbst ausblendende Blöcke ihren Abstand automatisch überspringen. Neue Dashboard-Blöcke nutzen ihn und ergänzen **kein** `pt-`/`pb-`/`py-`
- `src/app/components/DateTimePicker.tsx` — Datetime-Input mit Label, Error, Hint, ARIA (statt `<Input type="datetime-local">`)
- `src/app/components/DetailField.tsx` — beschriftetes Feld im Detail-Panel (Label über dem Wert, `tone="warn"` für Warn-Label); der Wert kommt als `children` und bleibt bewusst frei gestaltbar
- `src/app/components/InlineSettingRow.tsx` — eine Zeile der Admin-Settings: Beschriftung – Eingabe(n) – Einheit. Zusammen mit `inputStyles.ts` (`inlineInputCls`/`inlineLabelCls`) die einzige Quelle dieses Zeilen-Layouts
- `src/app/components/NumberInput.tsx` — schmale Zahl-Eingabe der Admin-Settings, klemmt und committet erst beim Verlassen des Feldes (statt `<input type="number">` mit Klemmen je Tastendruck — das macht das Feld auf dem Handy unleerbar)
- `src/app/components/TimeInput.tsx` — „HH:MM"-Eingabe; `TimeInput` committet beim Verlassen des Feldes, `TimeField` ist die rohe Variante für Formulare mit eigenem Speichern-Knopf
- `src/app/components/KontrolleBanner.tsx` — Kontroll-Status-Banner (compact + large)
- `src/app/components/LockRequestBanner.tsx` — Verschluss-Anforderung-Banner
- `src/app/components/FormError.tsx` — Styled Error-Card für Formulare
- `src/app/components/FormSuccess.tsx` — Styled Success-Card
- `src/app/components/Card.tsx` — Standard-Card mit optionalem Padding
- `src/app/components/Button.tsx` — Button mit Loading-State und Icon
- `src/app/components/ImageViewer.tsx` — Bild-Anzeige + Vollbild-Modal
- `src/app/components/Input.tsx` — Styled Text-Input
- `src/app/components/Select.tsx` — Styled Select-Dropdown
- `src/app/components/Textarea.tsx` — Styled Textarea
- `src/app/components/Checkbox.tsx` — Styled Checkbox
- `src/app/components/Toggle.tsx` — Styled Toggle-Switch
- `src/app/components/Badge.tsx` — Status-Badge
- `src/app/components/Pill.tsx` — Pill-Label
- `src/app/components/Sheet.tsx` — Bottom-Sheet / Slide-up Panel
- `src/app/components/ActionModal.tsx` — Bestätigungs-/Aktions-Modal
- `src/app/components/EmptyState.tsx` — Leer-Zustand Platzhalter
- `src/app/components/Skeleton.tsx` — Loading-Skeleton
- `src/app/components/Spinner.tsx` — Loading-Spinner
- `src/app/components/Toast.tsx` + `ToastProvider.tsx` — Toast-Notifications
- `src/app/components/PhotoCapture.tsx` — Foto-Aufnahme mit Kamera
- `src/app/components/PasskeyLoginButton.tsx` — Passkey/biometrischer Login
- `src/app/components/PasskeyManager.tsx` — Passkeys verwalten (Settings)
- `src/app/components/PushManager.tsx` — Push-Notifications verwalten (Settings)
- `src/app/components/InstallBanner.tsx` — PWA-Install-Banner
- `src/app/components/VersionChecker.tsx` — Prüft auf neue App-Version
- `src/app/components/TimerDisplay.tsx` — Echtzeit-Timer für aktive Einschlüsse

**Hooks:**
- `src/app/hooks/usePhotoUpload.ts` — Upload + EXIF + Seal-Detect (für alle Foto-Forms)
- `src/app/hooks/useSyncedDraft.ts` — lokaler Tippstand einer erst beim Blur committenden Eingabe, der einer externen `value` folgt (genutzt von `TimeInput`/`NumberInput`)
- `src/app/hooks/useUserSettingsSave.ts` — PATCH `/api/admin/users/[id]` + Toast/`saving` für die Admin-Settings-Toggles

**Utilities:**
- `src/lib/authGuards.ts` — `requireApi()` (Plain-Session-Guard, gibt die Session zurück), `requireAdminApi()`, `requireKeyholderOrAdminApi()`, `assertAdmin()`, `assertKeyholderOrAdmin()`
- `src/lib/userSelfField.ts` — `userSelfFieldRoute()` für „User ändert EIN eigenes Feld"-PATCH-Routen (nur `SELF_EDITABLE_USER_FIELDS`)
- `src/lib/apiClient.ts` — Client-seitig: `parseApiErrorCode()` (stabiler Fehler-Code aus einer Antwort, nie werfend → via `useApiError()` auflösen), `parseApiError()` (nur für Routen, deren `error` schon eine anzeigbare Meldung ist), `entryRequest()` (URL+Init für POST/PATCH `/api/entries`), `postAdminEntry()`/`submitAdminEntry()` — **nie** wieder `res.json().catch(() => ({}))` von Hand
- `src/lib/codedError.ts` — `codedError(code)`/`codeOf(e)`: Fehler mit stabilem `_code`-Tag, um eine Transaktion abzubrechen und den Code AUSSERHALB (auch über Modulgrenzen) wieder einzufangen. Bewusst **importfrei** (per Test abgesichert), damit es aus client-erreichbaren Modulen benutzbar bleibt (`constants.ts` → `entryErrors.ts` → hier) — **nie** wieder `Object.assign(new Error(…), { _code })` oder `(e as {_code?: string})?._code` von Hand
- `src/lib/serviceResult.ts` — `ServiceResult<T>` + `serviceResponse()` (Result → `NextResponse`). Dazu die HTTP-förmige Fehler-Schicht über `codedError`: `serviceErrors(table)` bindet Wurf- und Fang-Seite an EINE Tabelle (nur Tabellen-Keys sind werfbar → Tippfehler = Compile-Fehler statt stillem 500), `mapServiceError(e, table)` übersetzt einen erwarteten Code in ein `ServiceResult` (`null` = echter Defekt, weiterwerfen)
- `src/lib/entryErrors.ts` — Stabile Fehler-Codes der Entry-Routen (`ENTRY_GUARD_CODES`, `ENTRY_VALIDATION_CODES`, `ENTRY_ROUTE_CODES`) + `entryGuardError()`/`entryGuardCode()` (auf `codedError.ts` aufgesetzt, mit getypter Code-Whitelist). Jeder Code braucht einen Key im `errors`-Namespace beider `messages/*.json` — `entryErrors.test.ts` erzwingt das
- `src/lib/entryFormRoute.ts` — die Routen der Erfassungs-Formulare: `isEntryFormRoute()` (Bottom-Nav weicht der Formular-Aktionsleiste) und `inspectionHref(code, { kommentar })` — der EINE Bauplatz des Prüfungs-Links (Dashboard, Session-Listen, Sheet, Mail, Push). Die Query kommt immer aus `URLSearchParams`, leere Werte fallen weg — **nie** wieder `?code=${…}` von Hand. Rückgabe ist RELATIV: die Mail stellt `appBaseUrl()` davor, der Push nicht (`NativePushRouter` nimmt nur `/…`). Das Modul ist bewusst **importfrei** (per Test abgesichert), weil Client-Komponenten und server-only Code es teilen
- `src/lib/constants.ts` — `VALID_TYPES`, `OEFFNEN_GRUENDE`, `ORGASMUS_ARTEN`, `isValidImageUrl()`, `validatePassword()`, `parseOrgasmusArtBase()`, `PASSWORD_MIN_LENGTH`, `BCRYPT_MAX_BYTES`; dazu `NumberRange` + die `*_RANGE`-Konstanten der Admin-Settings (Reinigung/Eskalation/Auto-Kontrollen) — **eine** Quelle für das `clamp()` im Service UND das `range`-Prop von `NumberInput`. Ein neues geklemmtes Zahlen-Feld bekommt hier seine Konstante, nie ein Literal am Call-Site
- `src/lib/utils.ts` — `buildWearPairs()`, `wearingHoursFromPairs()`, `isTimeCorrected()`, `formatDuration()`, `formatDateTime()`, `toDatetimeLocal()`, `tzOffsetMsAt()` (TZ-Offset-Mess-Primitiv, gecachte Formatter), `decomposeMs()` (ms → Tage/Std/Min/Sek) — **nie** wieder `Intl…formatToParts` für Offsets oder `% 86_400_000` von Hand
- `src/lib/delayedTrigger.ts` — `computeDelayedTrigger()`: die `{wirksamAb, benachrichtigtAt}`-Konvention für terminierte Anforderungen (Kontrolle + Verschluss); `isHiddenFromSub()` die Lese-Seite dazu; `deadlineFromDispatch()` verschiebt die geplante Frist-SPANNE auf den tatsächlichen Zustell-Zeitpunkt (ein verspäteter Poller-Tick darf keine unerfüllbare Frist zustellen) — **nie** eine Frist gegen `wirksamAb` rechnen, wenn der Sub sie erst jetzt erfährt
- `src/lib/deviceCheckService.ts` — der Kontroll-Geräte-Check als EIN Vorgang: `deviceCheckApplies()` entscheidet Startwert UND Lauf (eine Bedingung, nicht zwei), `runDeviceCheck()` ersetzt das beim Anlegen gesetzte `deviceCheck: "pending"` in JEDEM Ausgang durch einen Endzustand (ein gescheitertes Schreiben bleibt als Logzeile sichtbar). Neue asynchrone Nach-Commit-Prüfungen folgen diesem Muster, statt Startwert und Ergebnis über die Route zu verteilen
- `src/lib/verifyReason.ts` — `VerifyReason`-Codes eines fehlgeschlagenen Foto-Checks; `formatVerifyReason()` für die UI, `toVerifyFailure()` für die Maschinen-Sichten (MCP). Ein `verifikationStatus: null` ohne Grund ist eine Sackgasse — **nie** den Rohwert casten, immer über `toVerifyFailure()` (härtet gegen Alt-/Fremdwerte)
- `src/lib/queries.ts` — `getIsLocked()`, `getActiveVorgabe()`
- `src/lib/kontrollePills.ts` — `ANFORDERUNG_PILLS`, `getKombinierterPill()`
- `src/lib/compressImage.ts` — Client-seitige Bildkomprimierung vor Upload
- `src/lib/haptics.ts` — Haptisches Feedback (Vibration API)
- `src/lib/swMessages.ts` — Service-Worker-Kommunikation: `postSwMessage()`, `clearSwUserCache()`, `activateWaitingSw()` (wartenden SW aktivieren + auf Übernahme warten), `setAppBadgeSafe()` (App-Badge = ungelesene Nachrichten; nativ über `@capawesome/capacitor-badge`, im Browser über `navigator.setAppBadge`). **Jeder SW-Zugriff gehört hierher** — `navigator.serviceWorker` fehlt in der iOS-WKWebView der Capacitor-App und in Privatfenstern komplett; ein ungeschützter Zugriff wirft dort und verschluckt die Aktion drumherum
- `src/lib/idb.ts` — IndexedDB-Wrapper (Offline-Cache)
- `src/lib/rate-limit.ts` — DB-basiertes Rate Limiting Helper
- `src/lib/login-attempts.ts` — Login-Versuchs-Tracking
- `src/lib/vorgaben.ts` — Trainings-Vorgaben Berechnungslogik
- `src/app/dashboard/EntryActions.tsx` — Drei-Punkte-Menü (Edit + optional Delete)

### MCP schemaVersion-Disziplin
- Jede MCP-Deep-View trägt eine `schemaVersion`. **Ändert sich Semantik eines Felds oder fällt ein Feld weg, MUSS die schemaVersion des betroffenen Tools erhöht werden** — sonst sind historische Werte rückwirkend uninterpretierbar (Vorfall 16.07.2026: `hardwareEnforced` zweimal umgedeutet bei unveränderter Version 2). Rein additive Felder brauchen keinen Bump.

### Changelog
- Erlaubte `type`-Werte: `feat`, `fix`, `security`, `perf`, `chore`, `ui` — **nicht** `refactor`
- **Ab v5 bekommt nicht jeder Commit eine eigene Versionsnummer.** Gebumpt wird gebündelt, wenn ein zusammenhängender Stand fertig ist. Ein Commit ohne Bump bekommt auch **keinen** Changelog-Eintrag — seine Details stehen in der Commit-Message.
- **Wenn** gebumpt wird: Version + Changelog im **gleichen Commit** wie die Änderung
- **Einträge sind knapp — ein bis zwei Sätze.** Was sich für den Nutzer geändert hat, nicht jede Bedingung und jeder Sonderfall. Wer erklärt, welcher Knopf wohin führt, schreibt eine Bedienungsanleitung statt eines Changelogs.

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
