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

## Git-Absender — VOR dem ersten Commit prüfen

Jeder Commit in diesem Repo muss als `trublue-2 <info@trublue.ch>` entstehen, Autor **und** Committer. Die Konfiguration ist repo-lokal und wird **nicht** mitgeklont:

```bash
git config user.name  # muss: trublue-2
git config user.email # muss: info@trublue.ch
```

Stimmt etwas nicht, zuerst setzen:

```bash
git config user.name "trublue-2"
git config user.email "info@trublue.ch"
```

**Cloud- und Remote-Sessions sind der Regelfall für diesen Fehler.** Sie arbeiten in einem frischen Klon ohne lokale Config und committen dann als `Claude <noreply@anthropic.com>` — ohne Warnung, ohne dass es beim Review auffällt. Genau so entstand `docs(aufgaben): Übergabe-Papier für die Etappen 1-4` (16.08.2026); die Korrektur kostete einen `filter-branch` über 21 Commits und einen Force-Push auf einen bereits veröffentlichten Branch. In `main` stehen aus demselben Grund 26 Commits mit falschem Absender, die dort bleiben müssen — ein Rewrite der Hauptlinie träfe die ausgerollten Instanzen, den `release`-Tag und jeden Fork.

Dasselbe gilt für **Worktrees**: `git worktree add` erbt die Config des Repos, ein frisch geklontes Verzeichnis nicht.

**Warum das kein Formalismus ist:** Dieses Repo ist öffentlich, und der Absender darf niemals auf den System-Benutzer oder eine private Adresse zeigen. Die Prüfung gehört vor den ersten Commit, nicht danach — hinterher ist sie ein Rewrite.

### Pushen

Gepusht wird ausschliesslich über das Konto `trublue-2`. Auf trublues Maschine ist das verkabelt und nicht wählbar: die Remote-URL lautet `git@github-trublue:…`, ein SSH-Alias auf den Key dieses Kontos. Wer eine andere Remote-URL setzt, umgeht das — also keine setzen.

Dort greifen zusätzlich globale Hooks (`core.hooksPath`): `pre-commit` und `pre-push` erzwingen `info@trublue.ch` / `trublue-2` als Absender und weisen ausserdem **Inhalte** ab, die auf die Person hinter trublue zeigen — privater Benutzername und private Domains, in Dateitext wie in Dateipfaden. Die Muster stehen in `identity-rules.sh` und gehören bewusst NICHT in eine eingecheckte Datei. Die Zuordnung hängt an der Remote-URL, damit sie auch in einem Klon ohne lokale Config greift.

**In Cloud- und Remote-Umgebungen existieren diese Hooks NICHT.** Ein Hook wirkt nur dort, wo er installiert ist. Dort ist dieser Abschnitt die einzige Sperre — die Prüfung von Absender und Inhalt ist dann Handarbeit und muss vor dem Push passieren, nicht danach.

---

## Deployment

Drei Workflows, alle `workflow_dispatch` (kein Auto-Deploy bei Push):

- **`.github/workflows/docker.yml`** — baut das Image, pusht es nach GHCR, ruft danach den Deploy auf.
- **`.github/workflows/promote.yml`** — befördert ein **bestehendes** Image in einen Kanal (Retag über die Registry, **kein Rebuild**). Der einzige Weg zu `:latest`.
- **`.github/workflows/deploy.yml`** — das Deploy-Skript selbst (`workflow_call`), von beiden oben genutzt. Nicht direkt dispatchbar.

**Drei Ringe — `:feature` → `:portal` → `:latest`:**

| Tag | Für wen | Wann er wandert |
|-----|---------|-----------------|
| `:feature` | trublues Instanz **und mittestende Fremd-Instanzen**, Tests vor dem Merge | Feature-Branch-Build, oder `main`-Build mit `tagFeature=true` |
| `:portal` | die Portal-Instanzen | jeder `main`-Build |
| `:latest` | alle, inkl. Self-Hoster — der **offizielle Release** | nur durch `promote.yml` |
| `:v<version>`, `:sha-<sha>` | unveränderliche Referenz zum Pinnen, Promoten, Rollback | pro `main`-Build (`v…`) bzw. pro Build (`sha-…`) |

**Daneben: Seitenkanäle (`publishAs`).** Ein Build von einem Nicht-`main`-Zweig taggt normalerweise `:feature` — und trifft damit ALLE, die dort mittesten. Für Arbeit, die über längere Zeit getestet werden soll, ohne den Ring zu belegen, veröffentlicht `-f publishAs=<name>` **statt** `:feature` einen eigenen rollenden Kanal:

```bash
# Erstmalig: Kanal bauen UND die eigene Instanz darauf umpinnen.
# `pinnedTo` nennt den ALTEN Pin — ohne ihn schlägt der Lauf fehl, siehe unten.
gh workflow run docker.yml --ref <branch> -f publishAs=<kanal> \
  -f channel=<kanal> -f instances=trublue -f pinnedTo=feature

# Danach: nur bauen, die gepinnte Instanz zieht mit
gh workflow run docker.yml --ref <branch> -f publishAs=<kanal>
```

**Zurzeit gibt es keinen Seitenkanal.** `:design` war der einzige und wird seit dem 31.08.2026 nicht
mehr gebraucht; die beiden Testinstanzen stehen wieder auf `:feature`. Der Mechanismus bleibt hier
beschrieben, weil er jederzeit wieder taugt — aber wer `publishAs` nimmt, legt damit einen NEUEN
Kanal an, auf dem erst einmal niemand steht (siehe die Erstbefehl-Falle gleich darunter).

⚠ **Beim ERSTEN Mal gehört `pinnedTo` dazu, und zwar mit dem ALTEN Pin.** Der Pin-Filter läuft
*vor* dem Umpinnen — er wählt nach dem Tag, auf dem die Instanz gerade steht, und erst danach
schreibt `channel` den neuen hinein (`deploy.yml`, „Pin-Filter"). Ohne `pinnedTo` leitet der
Workflow den Filter aus den GEBAUTEN Tags ab, also aus dem Kanal, auf dem noch niemand steht:

```
→ Pin-Filter :<kanal> — 0 von 1 Instanzen betroffen.
⚠ Keine Instanz passt auf die Auswahl — es wurde NICHTS deployt.
```

Das Image ist dann trotzdem gebaut und gepusht — nur deployt wurde nichts. Dasselbe Muster
bewegt die ganze Flotte von einem Ring zum nächsten: `-f channel=portal -f pinnedTo=latest`.

*Vorfall 25.08.2026:* zwei Läufe genau daran verbrannt, weil dieser Abschnitt den Erstbefehl ohne
`pinnedTo` nannte.

⚠️ **Wer auf einem Kanal steht, sagt NUR der Pin — nicht diese Datei.** Ein Seitenkanal bleibt nicht
privat: `:design` trug beim Anlegen die eigene Instanz, zeitweise eine zweite mit echten Nutzern,
und am Ende keine mehr. Jeder Satz darüber, den jemand hier hinschreibt, ist ab dem nächsten
Umpinnen falsch — und zwar lautlos. Vor einem Dispatch also fragen:

```bash
ssh www-data@kink 'grep -h "image:" ~/instances/*/docker-compose.yml | sed "s/.*chastitytracker://" | sort | uniq -c'
```

*Vorfall 31.08.2026:* eine Sitzung dispatchte nach `:feature` und `:design`, las hier „inzwischen ist
eine zweite Instanz darauf gepinnt, mit echten Nutzern" und warnte den Nutzer entsprechend. In
Wahrheit stand niemand mehr auf `:design`, der Deploy scheiterte an `0 von 23 Instanzen` — die
Warnung war so falsch wie die Zeile, aus der sie stammte. Die Abfrage oben hätte zwei Sekunden
gekostet. **Eine Warnung, die zu viel behauptet, wird beim nächsten Mal genauso geglaubt wie diesmal.**

*Vorfall 27.08.2026:* der v6-Umbau nahm der Keyholder-Übersicht die Schnellaktionen für alle
ruhigen Subs. Gemeldet hat es nicht der Autor, sondern die Keyholderin einer Fremd-Instanz, die
damals auf `:design` mittestete — sie brauchte „Kontrolle anfordern" und kam nicht mehr daran. Der
Kanal ist inzwischen leer, der Lehrsatz nicht: ein Seitenkanal kann Nutzer haben, von denen der
Autor nichts weiss.

`publishAs` ERSETZT `:feature` für diesen Build — sonst wäre nichts gewonnen. Reservierte Namen (`portal`, `latest`, `feature`, `v*`, `sha-*`) und alles ausserhalb von `[a-z0-9-]` brechen den Lauf ab: ohne diese Schranke veröffentlichte ein beliebiger Zweig direkt nach `:portal` oder `:latest` und höbe damit die einzige Garantie der Ringe auf.

`deploy.yml` brauchte dafür keine Änderung — es nimmt jeden validen Kanalnamen entgegen.

Ein `main`-Build veröffentlicht also **nichts** an Self-Hoster — das ist der Punkt der Kanäle. `:latest` bewegt sich erst, wenn du promotest, und dann per Digest-Retag: der Release ist bitgleich das Image, das die Portal-Flotte schon fährt.

⚠️ **`:feature` ist nicht mehr nur die eigene Instanz.** Auf dem Kanal sitzen inzwischen auch Nutzer, die freiwillig mittesten. Ein Feature-Dispatch startet damit fremde Produktiv-Instanzen neu und spielt ihnen unfertigen Stand ein — das ist gewollt, aber es ist kein folgenloser Test mehr. Wer hier dispatcht, tut es im Wissen, dass nicht nur der eigene Container betroffen ist; welche Instanzen das sind, sagt der Pin in ihrer `docker-compose.yml`, nicht diese Datei (Instanznamen Dritter gehören nicht ins öffentliche Repo).

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
- `User` – username, email, passwordHash, role (`user`/`admin`), cleaningAllowed, mobileDesktopUpload
- `Entry` – type (`VERSCHLUSS`|`OEFFNEN`|`PRUEFUNG`|`ORGASMUS`), startTime, imageUrl, imageExifTime, note, orgasmusArt, kontrollCode, verifikationStatus, oeffnenGrund
- `TrainingVorgabe` – Zeitraum mit min. Tragedauer pro Tag/Woche/Monat, pro User
- `KontrollAnforderung` – code (5-stellig), deadline (Vorgabe 1h, im Formular in Stunden oder Minuten wählbar), userId, fulfilledAt, withdrawnAt, kommentar
- `VerschlussAnforderung` – art (`ANFORDERUNG`/`SPERRZEIT`), userId, message, endsAt, minDurationHours, fulfilledAt, withdrawnAt
- `OrgasmusAnforderung` – art, userId, message, beginsAt, endsAt, requiredType, openingAllowed
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
- `src/lib/appMeta.ts` – `deployCutoff()`: Deploy-Stichtag „ab wann gilt das auf DIESER Instanz" (ENV-Override → `AppMeta`-Zeile aus der Migration → sicherer Fallback `now`); genutzt von der Reinigungsfenster-Regel und den Vergehens-Meldungen — ein DRITTER Stichtag nimmt ihn, statt die Schritte erneut abzuschreiben. Dazu `touchAppMeta()`/`markLastAction()`: Fire-and-forget-Zeitstempel in `AppMeta`, gelesen vom Portal-`sync-activity`-Cron (`lastUsedAt` in `proxy.ts`, `lastActionAt` bei echten Business-Aktionen)
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
- `POST /api/admin/kontrolle` – Kontrolle anfordern: sendet 5-stelligen Code per E-Mail, Frist per `deadlineH` (Vorgabe 1h, Bruchteile erlaubt) (nur Admin, User muss verschlossen sein)
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
# OVERRIDE des Melde-Stichtags der Vergehens-Nachrichten (ISO-8601). Gleiche Mechanik und gleiche
# Warnung wie oben: den Stichtag schreibt die Migration `20260811150000_offense_announce_from` beim
# ersten Boot jeder Instanz selbst. Abgeleitete Vergehen mit einer Tatzeit DAVOR werden dem Träger
# nie gemeldet — sonst kippte der erste Lauf nach dem Deploy seine ganze Historie in den Posteingang.
# AUSGENOMMEN sind von Hand notierte Vergehen: die schreibt die Keyholderin fast immer über etwas
# Vergangenes und würden sonst nie ankommen. Nur zum bewussten Rückdatieren.
OFFENSE_ANNOUNCE_FROM=<iso-date>           # optional
# Aufbewahrung des Posteingangs: gelesene Meldungen jenseits dieser Frist werden einmal täglich
# gelöscht (Vorgabe 365). `0` schaltet das Beschneiden ab. UNGELESENE bleiben immer liegen — eine
# Zustellung, die nie jemand gesehen hat, darf nicht folgenlos verschwinden.
MESSAGE_RETENTION_DAYS=365         # optional
# Gewichtstracking (docs/gewicht-konzept.md). OPT-IN wie der Bildersafe: Default AUS, nur ein
# exaktes `true` schaltet ein. Danach muss die Keyholderin es zusätzlich je Träger freischalten
# (User.weightTrackingEnabled, ebenfalls Default aus). Ohne diesen Schalter gibt es das Feature auf
# der Instanz nicht — weder in der Oberfläche noch in den Routen noch im MCP.
ENABLE_WEIGHT_TRACKING=true        # optional
# Aufbewahrung der Waagen-Fotos in Tagen (Vorgabe 60). `0` schaltet das Beschneiden ab. Gelöscht wird
# nur die DATEI — die Messung bleibt, und `imagePrunedAt` hält fest, dass es einmal ein Foto gab.
WEIGHT_PHOTO_RETENTION_DAYS=60     # optional
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
- `src/app/components/DashboardBlock.tsx` — ein gestapelter Block der Dashboard-Spalte. Breite und Seitenrand kommen aus `--block-col`/`--block-gutter` mit der Sub-Dashboard-Spalte als Vorgabe (`max-w-2xl`/`px-4`); eine Seite, die ihre Spalte selbst aufspannt, überschreibt sie auf ihrem Container (heute nur `admin/users/[id]/layout.tsx`). **Trägt bewusst KEINE vertikalen Abstände** — der Abstand kommt vom `gap` des Elters (`blockStackCls` in `inputStyles.ts`, heute `gap-8 sm:gap-10`), damit sich selbst ausblendende Blöcke ihren Abstand automatisch überspringen. Neue Dashboard-Blöcke nutzen ihn und ergänzen **kein** `pt-`/`pb-`/`py-`
- `src/app/components/DateTimePicker.tsx` — Datetime-Input mit Label, Error, Hint, ARIA (statt `<Input type="datetime-local">`)
- `src/app/components/ScheduleFields.tsx` — die TERMINIERUNG einer Direktive (sofort / verzögert / Zeitpunkt) samt `initialSchedule()`, `scheduleIsPast()` und `schedulePayload()` (→ `delayMinutes`/`wirksamAbAt`). Geteilt von Verschluss-Anforderung und Aufgabe; nur die beiden Hinweis-Sätze kommen als Prop, weil sie die Direktive benennen. **Ein drittes terminierbares Formular nimmt dieses Bauteil**, statt die drei Modi erneut herzuleiten
- `src/app/components/DetailField.tsx` — beschriftetes Feld im Detail-Panel (Label über dem Wert, `tone="warn"` für Warn-Label); der Wert kommt als `children` und bleibt bewusst frei gestaltbar
- `src/app/components/InlineSettingRow.tsx` — eine Zeile der Admin-Settings: Beschriftung – Eingabe(n) – Einheit. Zusammen mit `inputStyles.ts` (`inlineInputCls`/`inlineLabelCls`) die einzige Quelle dieses Zeilen-Layouts
- `src/app/components/NumberInput.tsx` — schmale Zahl-Eingabe der Admin-Settings, klemmt und committet erst beim Verlassen des Feldes (statt `<input type="number">` mit Klemmen je Tastendruck — das macht das Feld auf dem Handy unleerbar)
- `src/app/components/TimeInput.tsx` — „HH:MM"-Eingabe; `TimeInput` committet beim Verlassen des Feldes, `TimeField` ist die rohe Variante für Formulare mit eigenem Speichern-Knopf
- `src/app/components/MessageList.tsx` + `MessageRow.tsx` + `MessageFilterBar.tsx` — der Posteingang, geteilt vom Träger (`/dashboard/messages`) und der Keyholderin (`/admin/messages`). Der Unterschied ist EIN Prop (`scope`), aus dem die Liste ihre Endpunkt-Familie ableitet (`messageScope.ts`) — **nie** eine zweite Liste für eine zweite Sicht. Dazu `MessageBell.tsx` (Glocke, Ziel aus derselben Tabelle) und `HeaderMessages.tsx` (Glocke + App-Badge als ein Kopfzeilen-Element: die Glocke zeigt den Bereich, das Badge die Summe)
- `src/app/components/KontrolleBanner.tsx` — Kontroll-Status-Banner (compact + large)
- `src/app/components/LockRequestBanner.tsx` — Verschluss-Anforderung-Banner
- `src/app/components/FormError.tsx` — Styled Error-Card für Formulare
- `src/app/components/FormSuccess.tsx` — Styled Success-Card
- `src/app/components/Section.tsx` — **die Vorgabe-Figur eines Blocks**: leise Rubrik, Haarlinie darunter, Inhalt. KEIN Kasten. Die Linie gehört dazu und ist nicht Zierde — ohne sie war die Grenze zwischen zwei Blöcken kleiner als der Zeilenabstand INNERHALB eines Blocks, und die Blöcke flossen ineinander. Zwei Linienwerte, streng getrennt: `--border` nur als Rubrik-Unterstreichung eines Blocks, `--border-subtle` nur zwischen gleichwertigen Zeilen darin
- `src/app/components/Card.tsx` — eine Fläche ist die AUSNAHME, nicht die Vorgabe: sie steht einem einzelnen adressierbaren Objekt in einem Stapel gleichartiger zu (`CARD_BODY_STRIPED`), einer Fläche, die selbst die Aussage ist (`variant="semantic"`), und dem Sonderfall, wo eine Umrandung WENIGER bedeutet (`variant="outlined"`, archivierte Geräte). Ein Block nimmt `Section`
- `src/app/components/Button.tsx` — Button mit Loading-State und Icon
- `src/app/components/CategoryIcon.tsx` + `deviceIcons.ts` — das Zeichen einer Geräte-Kategorie. `CategoryIconRender` löst den in `DeviceCategory.icon` GESPEICHERTEN Namen über `ICON_MAP` auf; die erlaubten Namen stehen in `CATEGORY_ICONS` (`lib/categoryConstants.ts`) und sind zugleich das Zod-Enum des MCP. **Ein neues Kategorie-Zeichen entsteht als eigene Zeichnung in `deviceIcons.ts`** (`createLucideIcon`, 24×24, Strichstärke 2, runde Enden) — nicht als weitere lucide-Anleihe, deren Bedeutung nur ungefähr passt. Einen Namen NIE entfernen oder umbenennen: er steht in den Datensätzen der Nutzer und fiele dort still auf `Tag` zurück
- `src/app/components/lockIcons.ts` — **das Schlosspaar**, geschlossen und offen, eigene Zeichnungen. **Nie `Lock`/`LockOpen` aus lucide nehmen** (`Unlock` ist nur ein anderer Name für `LockOpen`): die beiden unterscheiden sich dort allein durch einen fehlenden Stummel von 5 Einheiten und sind bei den hier üblichen 11–18 px nicht auseinanderzuhalten. Diese Fassung schwenkt den Bügel heraus, sein freies Ende hängt LINKS NEBEN dem Korpus — dafür ist der Korpus schmaler als lucides. Beide teilen sich Korpus und Bügelform Zeichen für Zeichen und werden nur zusammen geändert; `lockIcons.test.ts` erzwingt das
- `src/app/entries/actionSign.tsx` — **die eine Registratur „Art → Zeichen (+ Farbe)"**. `actionSign(key)` liefert Zeichen und Farbe fertig für eine Formular-Hülle, `actionIcon(key)` nur das Zeichen für Listen mit eigener Farbgebung. Es gab dafür drei Tabellen, und sie waren bereits auseinandergelaufen (die Prüfung trug einmal `ClipboardCheck`, einmal `ClipboardList` — dasselbe Zeichen wie eine Aufgabe). Wer eine Art umzeichnet, tut es hier
- `src/app/components/ImageViewer.tsx` — Bild-Anzeige + Vollbild-Modal
- `src/app/components/Input.tsx` — Styled Text-Input
- `src/app/components/Select.tsx` — Styled Select-Dropdown
- `src/app/components/Textarea.tsx` — Styled Textarea
- `src/app/components/Checkbox.tsx` — Styled Checkbox
- `src/app/components/Toggle.tsx` — Styled Toggle-Switch
- `src/app/components/SettingLabel.tsx` — Beschriftung einer Einstellungs-Zeile (Name + leise Erklärung darunter); von `Toggle` und von Zeilen mit anderer Bedienung (Auswahl statt Schalter) geteilt
- `src/app/components/Badge.tsx` — Status-Badge
- `src/app/components/Pill.tsx` — Pill-Label
- `src/app/components/Sheet.tsx` — Bottom-Sheet / Slide-up Panel
- `src/app/components/ActionModal.tsx` — Bestätigungs-/Aktions-Modal
- `src/app/hooks/useDialogBehaviour.ts` — was einen modalen Dialog bedienbar macht: Fokus hinein, Fokus-Falle, Escape, Fokus zurück an den Auslöser, Scroll-Sperre. **Jeder** Dialog nimmt ihn; vier hatten die Mechanik einmal selbst gebaut und jeder andere Teile davon vergessen. Er zählt die offenen Dialoge an EINER Stelle — nur der oberste hört auf Escape und Tab, und die Scroll-Sperre gehört dem Stapel, nicht dem einzelnen Dialog
- `src/app/components/LiveStatus.tsx` + `useAnnouncement()` — die `sr-only`-Zeile, die eine Zustandsänderung ansagt (Auswahlmodus, Trefferzahl, neue Position). **Ihr Inhalt darf sich NIE im Takt ändern** — ein `aria-live` auf einer tickenden Zahl lässt den Screenreader sich endlos selbst unterbrechen (Vorfall `TimerDisplay`). Der Hook bringt den Zähler mit, ohne den dieselbe Meldung zweimal hintereinander stumm bliebe
- `src/app/components/SkipLink.tsx` — „Zum Inhalt springen", hängt in beiden Kopfzeilen und sucht die `<main>`-Landmarke beim Klick
- `src/lib/theme.ts` — **welche Farbwelt gilt, und zwar abgeleitet statt gewählt.** `subWorld(isLocked)` → `sub-locked` (grün) oder `sub-open` (rosa), `keyholderWorld()` → `keyholder` (indigo), `DEFAULT_WORLD` für Bildschirme ohne Zustand (Anmeldung, `/info`). Alle drei sind DUNKEL; einen hellen Modus und einen Umschalter gibt es seit v6 nicht mehr. Gesetzt wird beim Rendern im Bereichs-Layout, `ThemeRootSync` trägt die Welt an ZWEI Abnehmer nach, die den Bereichs-Wrapper nicht lesen: an `<html>` (für alles, was per Portal am Body hängt) und über `nativeWorld.ts` an den nativen Sperrbildschirm. **Eine neue Welt braucht vier Dinge:** einen Eintrag in `WELTEN` (`docs/design/tokens.mjs`), einen in `World`/`WORLDS` — `theme.test.ts` hält die beiden gegeneinander —, einen Lauf von `node docs/design/tokens.mjs --write` und eine Farbtafel in `LockPalette` (`ios/App/App/AppDelegate.swift`, **nicht versioniert** — dort fällt das Fehlen niemandem auf, der nur dieses Repo liest)
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
- `src/app/hooks/useUserSettingsSave.ts` — `useSettingsSave(url, {refresh})`: PATCH + Toast/`saving`/`router.refresh()` für die Admin-Settings-Abschnitte; `useUserSettingsSave(userId)` ist die Fassung auf der Sammel-Route `/api/admin/users/[id]`, die die meisten Abschnitte nehmen. Ein Abschnitt mit eigener Route ruft `useSettingsSave` direkt (`refresh: false`, wenn seine Anzeige rein lokal ist)

**Utilities:**
- `src/lib/authGuards.ts` — `requireApi()` (Plain-Session-Guard, gibt die Session zurück), `requireAdminApi()`, `requireKeyholderOrAdminApi()` (erlaubt/lehnt ab), `requireKeyholderOrAdminActor()` (dasselbe, gibt die SESSION zurück — für Routen, die den Handelnden brauchen, statt eines zweiten `auth()`), `requireControllerApi()` / `assertController()` (Keyholder-Sicht OHNE einzelnen Träger — für Sammel-Routen und -Seiten wie den Keyholder-Posteingang, wo es kein `targetUserId` gibt: beide geben Session + die `{id, username}[]` zurück, die der Handelnde kontrollieren darf, beide über denselben Resolver und dieselbe gecachte Abfrage; ein Sub ohne Subs bekommt 403 bzw. eine Umleitung, nicht eine leere Liste), `assertAdmin()`, `assertKeyholderOrAdmin()`
- `src/lib/keyholder.ts` — `getControllableSubsCached()`: `getControllableSubs()` pro Request memoisiert (`cache()`). Seiten-Guard, Kopfzeilen-Zähler und die Seite selbst teilen sich damit EINE Abfrage. Argumente bewusst primitiv — `cache()` schlägt über ihre Identität nach, ein frisch gebautes Array/Objekt träfe nie denselben Eintrag. Nicht für Schreibpfade
- `src/lib/messageInboxRoutes.ts` — `makeInboxRoutes(resolveScope)`: die Endpunkte EINES Posteingangs (`list`, `remove`, `markRead`, `markUnread`, `bulk`) als ein Bauplan. Daraus `ownInboxRoutes` (`/api/messages/*`, Scope aus der Session) und `keyholderInboxRoutes` (`/api/admin/messages/*`, Scope aus `requireControllerApi()`); die Route-Dateien sind nur noch `export const GET = …`. Eine neue Sicht auf den Posteingang bekommt einen Scope-Resolver, keine fünf neuen Dateien
- `src/lib/messageBulk.ts` — `parseMessageBulkBody()`: der Body von `POST …/messages/bulk`, geteilt von beiden Posteingängen. Obergrenze (= eine Seite) und erlaubte Aktionen stehen hier, nicht in den Routen
- `src/lib/messageScope.ts` — `MESSAGE_SCOPES`: Ziel, API-Basis, Titel- und Intro-Schlüssel je Posteingang (`"own"` / `"keyholder"`) in EINER Tabelle. Importfrei, damit Glocke (Server) und Liste (Client) sie teilen — **nie** eine zweite Union oder einen zweiten Pfad danebenschreiben
- `src/lib/userSelfField.ts` — `userSelfFieldRoute()` für „User ändert EIN eigenes Feld"-PATCH-Routen (nur `SELF_EDITABLE_USER_FIELDS`)
- `src/lib/apiClient.ts` — Client-seitig: `parseApiErrorCode()` (stabiler Fehler-Code aus einer Antwort, nie werfend → via `useApiError()` auflösen), `parseApiError()` (nur für Routen, deren `error` schon eine anzeigbare Meldung ist), `entryRequest()` (URL+Init für POST/PATCH `/api/entries`), `postAdminEntry()`/`submitAdminEntry()` — **nie** wieder `res.json().catch(() => ({}))` von Hand
- `src/lib/codedError.ts` — `codedError(code)`/`codeOf(e)`: Fehler mit stabilem `_code`-Tag, um eine Transaktion abzubrechen und den Code AUSSERHALB (auch über Modulgrenzen) wieder einzufangen. Bewusst **importfrei** (per Test abgesichert), damit es aus client-erreichbaren Modulen benutzbar bleibt (`constants.ts` → `entryErrors.ts` → hier) — **nie** wieder `Object.assign(new Error(…), { _code })` oder `(e as {_code?: string})?._code` von Hand
- `src/lib/serviceResult.ts` — `ServiceResult<T>` + `serviceResponse()` (Result → `NextResponse`). Dazu die HTTP-förmige Fehler-Schicht über `codedError`: `serviceErrors(table)` bindet Wurf- und Fang-Seite an EINE Tabelle (nur Tabellen-Keys sind werfbar → Tippfehler = Compile-Fehler statt stillem 500), `mapServiceError(e, table)` übersetzt einen erwarteten Code in ein `ServiceResult` (`null` = echter Defekt, weiterwerfen)
- `src/lib/taskService.ts` — `checkTask()`/`mergeTaskPatch()`/`checkTaskUpdate()` sind PRÜFEND und schreibfrei, getrennt vom Schreiben (`writeTask()` bzw. dem `updateMany` in `updateTask()`). Genau deshalb ruft die MCP-dryRun-Vorschau sie auf (`mcpCreateTask`: `checkTask` · `mcpEditTask`: `mergeTaskPatch` + `checkTaskUpdate`), statt ihre Schranken abzuschreiben — eine zweite Nachrechnung in der Vorschau läuft irgendwann auseinander und verspricht Erfolg für einen Commit, der mit 400 endet. **Eine neue Schranke gehört in `checkTask`/`checkTaskUpdate`, nicht in die Vorschau**; von dort erbt sie diese mit
- `src/lib/taskProofService.ts` — derselbe Schnitt für den Nachweis: `proofSubmitBlockedReason()` (Einreichen — geteilt von Formular-Seite und Service) und `proofReviewBlockedReason()` (Sichten — geteilt vom Service und der dryRun-Vorschau `mcpReviewTaskProof`). Beide rein und schreibfrei; **eine neue Schranke gehört in sie**, nicht in die zweite Bedingungskette daneben
- `src/lib/entryErrors.ts` — Stabile Fehler-Codes der Entry-Routen (`ENTRY_GUARD_CODES`, `ENTRY_VALIDATION_CODES`, `ENTRY_ROUTE_CODES`) + `entryGuardError()`/`entryGuardCode()` (auf `codedError.ts` aufgesetzt, mit getypter Code-Whitelist). Jeder Code braucht einen Key im `errors`-Namespace beider `messages/*.json` — `entryErrors.test.ts` erzwingt das
- `src/lib/entryFormRoute.ts` — die Routen der Erfassungs-Formulare: `isEntryFormRoute()` (Bottom-Nav weicht der Formular-Aktionsleiste) und `inspectionHref(code, { kommentar })` — der EINE Bauplatz des Prüfungs-Links (Dashboard, Session-Listen, Sheet, Mail, Push). Die Query kommt immer aus `URLSearchParams`, leere Werte fallen weg — **nie** wieder `?code=${…}` von Hand. Rückgabe ist RELATIV: die Mail stellt `appBaseUrl()` davor, der Push nicht (`NativePushRouter` nimmt nur `/…`). Das Modul ist bewusst **importfrei** (per Test abgesichert), weil Client-Komponenten und server-only Code es teilen
- `src/app/components/ChangeoverNoticeGate.tsx` — entscheidet, ob der einmalige Umstellungs-Hinweis erscheint; hängt in BEIDEN Bereichs-Layouts (nicht auf den Übersichts-Seiten: `landing.ts` kennt fünf Einstiege, zwei davon führen daran vorbei). Liest den Merker aus `userRowCached`, nicht mit eigener Abfrage
- `src/lib/notice.ts` — `NOTICE_VERSION` + die Regel, wann der Umstellungs-Hinweis fällig ist. **Importfrei** (geprüft), weil die Client-Komponente die Konstante liest. **Der Wert wandert VON HAND**, nicht mit `package.json` — wer den Text unter `notice.*` ändert, muss ihn mitziehen, sonst sieht den neuen Hinweis niemand; `notice.test.ts` hält beides zusammen
- `src/lib/constants.ts` → `SELF_EDITABLE_USER_FIELDS` — die Whitelist der Felder, die ein Nutzer über `userSelfFieldRoute()` selbst ändern darf. Ein neues Self-Feld braucht einen Eintrag HIER und die Route dort; die Compiler-Sperre in `userSelfField.ts` erzwingt das (`userSelfFieldRoute("role", …)` kompiliert nicht)
- `src/lib/constants.ts` → `APP_NAME` — **wie die App heisst, EINE Quelle.** Nicht übersetzt (deshalb Konstante statt i18n-Schlüssel). Drei Träger können sie nicht importieren und führen den Wert als Literal — `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`; `appName.test.ts` hält sie dagegen. Beim ersten Umbau waren genau die drei übersehen worden, und der Nutzer las den alten Namen im Installations-Dialog
- `src/lib/deviceCategories.ts` — die EINGEBAUTE Kategorie: `KG_BUILTIN_SLUG` (`"kg"`, Identität — nie ändern), `KG_BUILTIN_NAME` (Anzeigename, nur VORGABE beim Anlegen), `KG_CATEGORY_META` (Zeichen/Farbe/Name für Umschalter ohne DB-Zugriff), `ensureKgCategory()`. **Das Modul zieht Prisma nach sich** — eine Client-Komponente darf es nicht importieren; der Name kommt dort als Prop vom Server (`CategoryGoalsToday` → `CategoryGoalsLive`). Wo der Name eines KONKRETEN Nutzers gemeint ist, gehört er aus der `DeviceCategory`-Zeile, nicht aus der Konstanten: er ist editierbar
- `src/lib/constants.ts` — `VALID_TYPES`, `OEFFNEN_GRUENDE`, `ORGASMUS_ARTEN`, `isValidImageUrl()`, `validatePassword()`, `parseOrgasmusArtBase()`, `PASSWORD_MIN_LENGTH`, `BCRYPT_MAX_BYTES`; dazu `NumberRange` + die `*_RANGE`-Konstanten der Admin-Settings (Reinigung/Eskalation/Auto-Kontrollen) — **eine** Quelle für das `clamp()` im Service UND das `range`-Prop von `NumberInput`. Ein neues geklemmtes Zahlen-Feld bekommt hier seine Konstante, nie ein Literal am Call-Site
- `src/lib/utils.ts` — `buildWearPairs()`, `wearingHoursFromPairs()`, `isTimeCorrected()`, `formatDuration()`, `formatDateTime()`, `toDatetimeLocal()`, `tzOffsetMsAt()` (TZ-Offset-Mess-Primitiv, gecachte Formatter), `decomposeMs()` (ms → Tage/Std/Min/Sek) — **nie** wieder `Intl…formatToParts` für Offsets oder `% 86_400_000` von Hand
- `src/lib/delayedTrigger.ts` — `computeDelayedTrigger()`: die `{wirksamAb, benachrichtigtAt}`-Konvention für terminierte Direktiven (Kontrolle, Verschluss **und Aufgabe**); `isHiddenFromSub()` die Lese-Seite dazu; `deadlineFromDispatch()` verschiebt die geplante Frist-SPANNE auf den tatsächlichen Zustell-Zeitpunkt (ein verspäteter Poller-Tick darf keine unerfüllbare Frist zustellen) — **nie** eine Frist gegen `wirksamAb` rechnen, wenn der Sub sie erst jetzt erfährt
- `src/lib/entryFulfilment.ts` — was ein neuer Eintrag ABHAKT (Verschluss-Anforderungen samt Sperrzeiten, Orgasmus-Anforderung und — nur auf dem Sub-Pfad — die Kontroll-Anforderung), geteilt von BEIDEN Erfassungs-Routen. Der Parameter `at` ist Stichtag der Auswahl UND Erfüllungs-Zeitstempel: Sub-Pfad `new Date()` (die Eintrags-Zeit ist frei wählbar — mit ihr datierte sich jeder Sub aus jeder Frist heraus), Keyholder-Pfad `entry.startTime` (dort ist Rückdatieren erlaubt; erfasst jemand für SICH SELBST, gilt wieder die Server-Uhr). Die Auswahl ist zusätzlich auf `createdAt <= at` beschränkt — ein Nachtrag erfüllt nur, was es zu seinem Zeitpunkt schon gab. Diese Asymmetrie ist Absicht, **nicht** „vereinheitlichen". Dazu `punishWrongDevice()` — nur der Sub-Pfad ahndet automatisch; liest die Vergehens-Regel SELBST (die Ahndung wird sofort als erledigt geschrieben, der nachgelagerte Regel-Filter griffe für sie nie) und meldet dem Träger, weil eine erledigte Strafe in keiner seiner beiden Sichten erscheint
- `src/lib/deviceCheckService.ts` — der Kontroll-Geräte-Check als EIN Vorgang: `deviceCheckApplies()` entscheidet Startwert UND Lauf (eine Bedingung, nicht zwei), `runDeviceCheck()` ersetzt das beim Anlegen gesetzte `deviceCheck: "pending"` in JEDEM Ausgang durch einen Endzustand (ein gescheitertes Schreiben bleibt als Logzeile sichtbar). Neue asynchrone Nach-Commit-Prüfungen folgen diesem Muster, statt Startwert und Ergebnis über die Route zu verteilen
- `src/lib/verifyReason.ts` — `VerifyReason`-Codes eines fehlgeschlagenen Foto-Checks; `formatVerifyReason()` für die UI, `toVerifyFailure()` für die Maschinen-Sichten (MCP). Ein `verifikationStatus: null` ohne Grund ist eine Sackgasse — **nie** den Rohwert casten, immer über `toVerifyFailure()` (härtet gegen Alt-/Fremdwerte)
- `src/lib/queries.ts` — `getIsLocked()`, `getActiveVorgabe()`
- `src/lib/kontrollePills.ts` — `ANFORDERUNG_PILLS`, `getKombinierterPill()`
- `src/lib/compressImage.ts` — Client-seitige Bildkomprimierung vor Upload
- `src/lib/capacitorPrefs.ts` — `prefGet`/`prefSet`: der EINE gekapselte Zugriff auf Capacitor Preferences (dynamischer Import, `catch` statt Plattform-Abfrage — im Server-Rendering und im reinen Browser soll er still nichts tun). **Jeder Preferences-Zugriff gehört hierher.** Auf iOS liegen die Werte in `UserDefaults.standard` unter `CapacitorStorage.<key>`
- `src/lib/nativeWorld.ts` — `rememberWorld(world)`: hinterlegt die Farbwelt für den nativen iOS-Sperrbildschirm, der VOR der WebView zeichnet und sie deshalb nicht erfragen kann. Der Wert ist ein Gedächtnis, keine Auskunft — die Grenzen stehen dort. Gerufen von `ThemeRootSync`
- `src/lib/haptics.ts` — Haptisches Feedback (Vibration API)
- `src/lib/swMessages.ts` — Service-Worker-Kommunikation: `postSwMessage()`, `clearSwUserCache()`, `activateWaitingSw()` (wartenden SW aktivieren + auf Übernahme warten), `setAppBadgeSafe()` (App-Badge = ungelesene Nachrichten; nativ über `@capawesome/capacitor-badge`, im Browser über `navigator.setAppBadge`). **Jeder SW-Zugriff gehört hierher** — `navigator.serviceWorker` fehlt in der iOS-WKWebView der Capacitor-App und in Privatfenstern komplett; ein ungeschützter Zugriff wirft dort und verschluckt die Aktion drumherum
- `src/lib/idb.ts` — IndexedDB-Wrapper (Offline-Cache)
- `src/lib/rate-limit.ts` — DB-basiertes Rate Limiting Helper
- `src/lib/login-attempts.ts` — Login-Versuchs-Tracking
- `src/lib/vorgaben.ts` — Trainings-Vorgaben Berechnungslogik
- `src/lib/mcp/toolSurface.ts` — Fingerabdruck der MCP-Werkzeug-Oberfläche: EIN Wert, den zwei weit auseinanderliegende Stellen teilen — der gecachte Instructions-Text (`route.ts`) und der Envelope jeder Antwort (`mcp/common.ts`, `mcp/writeFramework.ts`). Weichen sie voneinander ab, ist die Werkzeugliste einer laufenden Sitzung überholt. **Eine neue Antwort-Form trägt ihn mit**, sonst liest ein Agent sein Fehlen als „weicht ab" und schlägt grundlos Alarm
- `src/app/components/WeightRow.tsx` — eine WIEGUNG als Zeile, geteilt von der Liste in der Statistik-Karte (Träger) und der Eintragsliste der Keyholderin, in die die Messungen chronologisch eingemischt sind. Dazu `src/lib/weightRows.ts` (`loadWeightRows`/`withDeltas`): das Laden samt Veränderung zum Vorwert — **nie** eine zweite Delta-Rechnung je Anzeige, sie liefe an einem der beiden Orte auseinander
- `src/app/components/inputStyles.ts` → `busyDimCls` — die Dämpfung eines Bedienelements, das `aria-disabled` statt `disabled` trägt. **Die Bauform ist die Regel, nicht die Ausnahme:** ein `disabled` schaltet auch das Element ab, das gerade den Fokus hält (der letzte Klick auf „Weiter", der Pfeil, der einen Block ganz nach oben schiebt) — der Fokus fällt dann an den Dokumentanfang. Die Schranke gehört dabei IMMER in den Handler; ein `aria-disabled`-Knopf bleibt klickbar
- `src/app/components/inputStyles.ts` → `iconButtonCls` — Trefferfläche eines Symbol-Knopfes (24 px, das AA-Minimum aus WCAG 2.5.8), als `min-*`, damit die Zeilenhöhe sich nicht bewegt
- `src/app/components/inputStyles.ts` → `listRowCls`/`listRowButtonCls` — Mass und Klickfläche EINER Verlaufs-Zeile, geteilt von `EntryRow` und `WeightRow`. Beide stehen in der Eintragsliste unmittelbar untereinander; driften Polsterung oder Hover-Fläche, sieht man es nicht in der Zeile, sondern im Rhythmus der Liste
- `src/lib/weightSeries.ts` → `withinRange()` — der Zeitraum-Ausschnitt über den Tagesschlüssel, geteilt von Diagramm und Liste
- `src/lib/weightRelease.ts` + `weightReleaseService.ts` — die Freigabe-Vorgabe (docs/gewicht-freigabe-konzept.md): das Gewicht öffnet das nächste Orgasmus-Fenster. Der RECHENKERN ist datenbankfrei (Schwelle des Tages, Mittel-Prüfung), der Dienst hält alles, was den Bestand braucht — derselbe Schnitt wie zwischen `checkTask()` und `writeTask()`. **Eine neue Schranke gehört in `evaluateRelease`**, nicht in eine zweite Bedingungskette daneben; die MCP-Vorschau ruft dieselbe Funktion. Ausgewertet wird NUR die erste Messung eines Tages (`recordWeight`: `replaced === false`) — sonst wiegt der Träger so lange nach, bis das Mittel passt
- `src/app/dashboard/EntryActions.tsx` — Drei-Punkte-Menü (Edit + optional Delete)

### MCP-Vollständigkeit — was die Keyholderin kann, kann die KI

**Jede Einstellung und jede Handlung, die einem Keyholder in der Oberfläche offensteht, MUSS auch
über den MCP erreichbar sein.** Die KI-Keyholderin ist kein Beobachter mit Leserechten, sondern eine
zweite Keyholderin; eine Fähigkeit, die nur im Browser existiert, zwingt sie, den Menschen um etwas
zu bitten, das sie selbst tun könnte.

**Warum die Lücke so schwer auffällt:** Sie zeigt sich nicht beim Bauen, sondern erst, wenn jemand
die KI darum bittet — und dann als Absage. Der Nutzer erfährt die Grenze also im ungünstigsten
Moment und hält sie leicht für einen Defekt. Genau so kam es beim Gewichtstracking heraus: das
Zielgewicht war über den MCP setzbar, die Freischaltung und die Wiege-Fenster aber nicht (23.08.2026).

Daraus folgt für jede Änderung:

- **Eine neue Keyholder-Einstellung bekommt ihren MCP-Schreibweg im SELBEN Zweig.** Nachgereicht
  wird sie erfahrungsgemäss nicht — sie fällt ja niemandem auf
- **Ein Werkzeug je Einstellungs-Familie, nicht je Feld.** Vorbild `set_cleaning`: es deckt ALLE
  Reinigungs-Regeln ab, samt der Tages-Fenster, statt einen Hauptschalter freizugeben und den Rest
  in der Oberfläche zu lassen. Dasselbe bei `set_auto_inspections`
- **Was nachgeholt wird, ist ein `fix`**, kein `feat` — siehe „Welche Stelle wandert" weiter unten:
  die Schnittstelle zieht mit einer anderen gleich, statt etwas hinzuzufügen
- **Ein neues Werkzeug macht jeden Satz falsch, der seine Abwesenheit behauptet — und diese Sätze
  stehen woanders.** Wer ein Tool ergänzt, greppt nach der Verneinung („kein Tool", „nur lesbar",
  „das entscheidet der Mensch") und räumt sie mit ab. Sonst liest die KI weiter, dass es die
  Fähigkeit nicht gibt, die sie hat — und benutzt sie nicht.

  *Vorfall 01.09.2026:* die KI-Keyholderin meldete selbst, dass `get_context` zu `offenseRules`
  „NUR LESBAR, es gibt bewusst kein Tool zum Umlegen … suche also nicht danach" sagte, während
  `set_offense_rules` längst existierte und ihr offenstand. Dieselbe überholte Behauptung stand an
  VIER Stellen — in der Tool-Beschreibung (`route.ts`), im Modell-Text (`mcpModelDoc.ts`, dort 15
  Zeilen unter der richtigen Aussage), in `docs/mcp-keyholder-guide.md` und in
  `docs/funktionsmodell/50-strafbuch.md`. Die vierte fand kein Mensch, sondern
  `mcpModelDoc.test.ts`, das Modell-Text und Guide gegeneinander hält — der einzige der vier Orte,
  der einen Wächter hat, war auch der einzige, der sich selbst meldete. Das
  Funktionsmodell führte die Fähigkeit die ganze Zeit korrekt mit `writers: ["admin", "mcp"]`; der
  geprüfte Teil stimmte, die Prosa nicht. **Eine Fähigkeit, von der die KI nichts weiss, ist so gut
  wie nicht vorhanden** — der Rückstand kostet dasselbe wie eine echte Lücke, fällt aber nicht
  einmal beim Bauen auf.

**Die Ausnahmen stehen an EINER Stelle, und die wird geprüft:** `FM_MCP_EXEMPT` in
`src/lib/funktionsmodellCapabilities.ts`. Jeder Eintrag braucht einen Grund, der mit `Absicht:`
(bleibt so — Passwörter, Konten, Keyholder-Zuordnung, Uploads) oder `OFFEN:` (Rückstand, noch zu
schliessen) beginnt; `funktionsmodellDoc.test.ts` erzwingt beides und meldet ausserdem jede
Keyholder-Fähigkeit, die weder einen MCP-Weg noch einen Eintrag hat. Eine zweite Liste in Prosa
hier wäre die halbe Wahrheit — sie liefe der geprüften davon.

### MCP schemaVersion-Disziplin
- Jede MCP-Deep-View trägt eine `schemaVersion`. **Ändert sich Semantik eines Felds oder fällt ein Feld weg, MUSS die schemaVersion des betroffenen Tools erhöht werden** — sonst sind historische Werte rückwirkend uninterpretierbar (Vorfall 16.07.2026: `hardwareEnforced` zweimal umgedeutet bei unveränderter Version 2). Rein additive Felder brauchen keinen Bump.

### Changelog
- Erlaubte `type`-Werte: `feat`, `fix`, `security`, `perf`, `chore`, `ui` — **nicht** `refactor`
- **Ab v5 bekommt nicht jeder Commit eine eigene Versionsnummer.** Gebumpt wird gebündelt, wenn ein zusammenhängender Stand fertig ist. Ein Commit ohne Bump bekommt auch **keinen** Changelog-Eintrag — seine Details stehen in der Commit-Message.
- **Wenn** gebumpt wird: Version + Changelog im **gleichen Commit** wie die Änderung
- **Einträge sind knapp — ein bis zwei Sätze.** Was sich für den Nutzer geändert hat, nicht jede Bedingung und jeder Sonderfall. Wer erklärt, welcher Knopf wohin führt, schreibt eine Bedienungsanleitung statt eines Changelogs.

### Welche Stelle wandert — und wer sie bewegt

**Sitzungen bumpen ausschliesslich die Patch-Stelle (`0.0.X`).** Die Minor-Stelle zieht trublue
selbst, wenn ein Stand für ihn ein Meilenstein ist. Ein `feat`-Eintrag im Changelog ist dafür
**kein** hinreichender Grund — er sagt, wie die Änderung einzuordnen ist, nicht wie gross sie ist.

**Was eine Schnittstelle nachholt, um mit einer anderen gleichzuziehen, ist ein `fix`.** Der
Anspruch ist, dass die KI-Keyholderin über den MCP alles kann, was die Keyholderin in der
Oberfläche kann. Eine MCP-Fähigkeit, die es dort längst gibt, schliesst also eine Lücke, statt
etwas hinzuzufügen — auch wenn sie sich beim Bauen wie ein Feature anfühlt und ein ganzes Bündel
neuer Werkzeuge mitbringt.

*Vorfall 22.08.2026:* zwei Sitzungen legten die Regel an einem Tag verschieden aus. v5.2.6 trug
vier Einträge, darunter drei `feat`, und blieb Patch; v5.3.0 zog für die MCP-Schreibrechte an
Geräten und Kategorien die Minor-Stelle. Korrigiert durch Umnummerierung auf v5.2.7/v5.2.8 samt
`feat` → `fix` — ein Force-Push auf die veröffentlichte Hauptlinie, den es ohne diese Regel nicht
gebraucht hätte. Er war nur deshalb vertretbar, weil kein `:v5.3.x`-Image existierte und der
`release`-Tag unberührt blieb; beim nächsten Mal stimmt beides womöglich nicht mehr.

## Design System – Shared Primitives

Alle UI-Elemente MÜSSEN auf den gemeinsamen Shared Primitives basieren. Erfinde NIEMALS neue Farben, Abstände, Schriftgrössen, Schatten oder Border-Radii. Verwende ausschliesslich die definierten Tokens.

### Regeln

0. **Die Farbwelt sagt den Zustand, nicht eine Vorliebe.** Grün heisst verschlossen, Rosa heisst offen, Indigo ist der Keyholder-Bereich. Es gibt keinen hellen Modus und keinen Umschalter. Daraus folgt für jede neue Anzeige: **`unlock` ist eine Aussage, kein Ersatz-Neutral.** Wer eine Farbe braucht, die nichts bedeutet, nimmt `neutral`/`foreground-muted` — `unlock` war einmal grau und wurde deshalb dreimal geliehen (Info-Toast, Vergehens-Chip, Zustands-Held); alle drei behaupteten nach dem Wechsel „geöffnet". Und ein dritter Ausgang ist Pflicht, wo es ihn gibt: „kein Eintrag vorhanden" ist NICHT „offen" und bleibt grau.
1. **Keine Magic Numbers:** Jeder Wert (Farbe, Abstand, Radius, Schatten, Schriftgrösse) muss aus den definierten Primitives stammen. Hardcodierte Werte wie `padding: 13px` oder `color: #3b82f6` sind verboten.
   **Auch benannte Tailwind-Farben zählen dazu** — `text-white`, `bg-white`, `*-gray-*`, `bg-black/x` lesen sich nicht wie Magic Numbers, sind aber genau das. Die Schrift auf einer gefüllten Bedeutungsfläche kommt IMMER aus `--btn-primary-text`; der Token kennt je Welt die Farbe, die dort trägt. Weiss ist nur über echtem Schwarz erlaubt (Kamera-Overlay, Bild-Betrachter) und auf `/info`, das ausserhalb des Token-Systems steht.
   *Warum das eine eigene Zeile braucht:* aus „es gibt keinen hellen Modus mehr" folgt naheliegend, aber falsch, dass Weiss immer trägt. Gemessen wurde der Gegenbeweis — weisse Schrift auf `--color-inspect` liegt bei 2,3:1, auf `--color-ok` bei 1,9:1, und der Aktualisieren-Knopf des Versions-Banners war weiss auf weiss. Der Token gibt an denselben Stellen 8,0 bzw. 9,8.
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
