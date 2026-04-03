# UX-Inventar & Navigationsstruktur

Stand: 2026-04-03 | chastitytracker v3.0.0

---

## 1. Navigationsstruktur

### 1.1 Layout-Hierarchie

```
RootLayout (globals.css, Fonts, ToastProvider, i18n)
 ├─ /login                          (kein Layout-Chrome)
 ├─ /forgot-password                (kein Layout-Chrome)
 ├─ /reset-password                 (kein Layout-Chrome)
 ├─ /info/[lang]                    (kein Layout-Chrome)
 │
 ├─ DashboardLayout                 [data-theme="user"]
 │   ├─ Header (sticky)
 │   ├─ DesktopSidebar (lg+)
 │   ├─ BottomNav (mobile)
 │   ├─ InstallBanner (PWA)
 │   └─ Content-Slot
 │       ├─ /dashboard
 │       ├─ /dashboard/eintraege
 │       ├─ /dashboard/stats
 │       ├─ /dashboard/settings
 │       ├─ /dashboard/changelog
 │       └─ /dashboard/new/*
 │
 └─ AdminLayout                     [data-theme="admin"]
     ├─ AdminHeader (sticky)
     ├─ AdminDesktopSidebar (lg+)
     ├─ AdminBottomNav (mobile)
     └─ Content-Slot
         ├─ /admin
         ├─ /admin/kontrollen
         ├─ /admin/settings
         ├─ /admin/dev/components
         ├─ /admin/users/new
         │
         └─ UserDetailLayout          (nested)
             ├─ UserContextBar (sticky, unter Header)
             ├─ UserSubNav (sticky, unter ContextBar)
             └─ Content-Slot
                 ├─ /admin/users/[id]
                 ├─ /admin/users/[id]/aktionen/*
                 ├─ /admin/users/[id]/eintraege
                 ├─ /admin/users/[id]/kontrollen
                 ├─ /admin/users/[id]/einstellungen
                 ├─ /admin/users/[id]/stats
                 └─ /admin/users/[id]/strafbuch
```

### 1.2 Feste Layout-Masse

| Element | Höhe | Breite | Position | Breakpoint |
|---------|------|--------|----------|------------|
| Header / AdminHeader | 3.5rem (56px) | 100% | sticky top-0, z-30 | immer |
| DesktopSidebar / AdminDesktopSidebar | 100vh - 56px | 16rem (256px) | fixed left-0 top-14, z-20 | lg+ (1024px) |
| BottomNav / AdminBottomNav | 5rem + safe-area | 100% | fixed bottom-0, z-40 | < lg |
| UserContextBar | 52px | 100% | sticky top-14, z-20 | immer |
| UserSubNav | ~40px | 100% | sticky top-[calc(3.5rem+52px)], z-10 | immer |

Content-Offset: Desktop `ml-64`, Mobile `pb-[calc(5rem+safe-area)]`.

### 1.3 Navigation nach Rolle

#### User-Navigation

**Desktop-Sidebar:**
| Eintrag | Icon | Ziel | Bedingung |
|---------|------|------|-----------|
| Übersicht | Home | `/dashboard` | — |
| Einträge | ClipboardList | `/dashboard/eintraege` | — |
| Statistik | BarChart2 | `/dashboard/stats` | — |
| Admin | ShieldCheck | `/admin` | nur wenn `role=admin` |
| **[Neu]** (Primary-Button) | Plus | Sheet: NewEntrySheet | — |

**Mobile-BottomNav:**
| Übersicht | Einträge | **[+Neu]** | Statistik | (Admin) |

Aktiver Tab: `bg-nav-active-bg text-nav-active-text`.

#### Admin-Navigation

**Desktop-Sidebar:**
| Eintrag | Icon | Ziel | Bedingung |
|---------|------|------|-----------|
| Übersicht | Home | `/admin` | — |
| Benutzer | Users | `/dashboard` | — |
| Kontrollen | ClipboardCheck | `/admin/kontrollen` | — |
| Einstellungen | Settings | `/admin/settings` | — |
| **[Neu]** (Primary-Button) | Plus | Sheet: User-Picker → Aktionen | — |

**Mobile-BottomNav:**
| Übersicht | Kontrollen | **[FAB +]** | Benutzer | Einstellungen |

#### Admin User-Detail SubNav

Horizontal-Tabs (Desktop) / Select-Dropdown (Mobile):

| Tab | Ziel |
|-----|------|
| Übersicht | `/admin/users/[id]` |
| Aktionen | `/admin/users/[id]/aktionen` |
| Einträge | `/admin/users/[id]/eintraege` |
| Kontrollen | `/admin/users/[id]/kontrollen` |
| Einstellungen | `/admin/users/[id]/einstellungen` |
| Statistik | `/admin/users/[id]/stats` |
| Strafbuch | `/admin/users/[id]/strafbuch` |

---

## 2. Design-System (Tokens)

### 2.1 Dual-Theme

Umschaltung via `data-theme` Attribut auf dem Layout-Container.

| Token | User-Theme (hell) | Admin-Theme (dunkel) |
|-------|-------------------|---------------------|
| `--background` | #f8f9fb | #0d0f14 |
| `--surface` | #ffffff | #1c1f2a |
| `--surface-raised` | #f1f3f7 | #23273a |
| `--foreground` | #111827 | #e5e7eb |
| `--nav-bg` | #ffffff | #151821 |

### 2.2 Semantische Farben (Aktion-basiert)

| Semantik | CSS-Variable | Hex (User) | Verwendung |
|----------|-------------|------------|------------|
| lock | `--color-lock` | #0d9151 | VERSCHLUSS-Einträge, Buttons |
| unlock | `--color-unlock` | #0369a1 | OEFFNEN-Einträge |
| inspect | `--color-inspect` | #c2610a | PRUEFUNG-Einträge, Kontrolle |
| orgasm | `--color-orgasm` | #be185d | ORGASMUS-Einträge |
| request | `--color-request` | #4338ca | Verschluss-Anforderungen |
| sperrzeit | `--color-sperrzeit` | #7c3aed | Sperrzeiten |
| warn | `--color-warn` | #c2410c | Überfällige Elemente |
| ok | `--color-ok` | #16a34a | Erfolg, erfüllt |

Jede semantische Farbe hat zusätzlich: `-bg`, `-border`, `-text` Varianten.

### 2.3 Typografie

| Rolle | Font |
|-------|------|
| Body / UI | Geist Sans (Google Fonts) |
| Monospace (Version, Code) | JetBrains Mono |

### 2.4 Responsive Breakpoint

Einziger relevanter Breakpoint: **lg (1024px)** — schaltet zwischen Sidebar + BottomNav.

---

## 3. Komponenteninventar

### 3.1 Primitive (Design-System-Basis)

| Komponente | Typ | Varianten / Props | Beschreibung |
|------------|-----|-------------------|--------------|
| **Button** | Client | `primary`, `secondary`, `ghost`, `danger`, `semantic`; Sizes: `sm`, `default`, `lg`; `loading`, `fullWidth`, `icon` | Universeller Button mit semantischen Farben (lock/unlock/inspect/...) |
| **Card** | Server | `default`, `outlined`, `semantic`, `interactive`; Padding: `default`, `compact`, `none` | Container-Element, unterstützt semantische Einfärbung |
| **Input** | Client | `label`, `error`, `hint`, `icon` | Text-Eingabefeld mit Validierungsstatus |
| **Textarea** | Client | `label`, `error`, `hint`, `maxLength` (mit Zeichenzähler) | Mehrzeilige Eingabe |
| **Select** | Client | `label`, `options`, `error`, `hint`, `placeholder` | Dropdown-Auswahl |
| **Checkbox** | Client | `label`, `disabled` | Checkbox mit Custom-Styling |
| **Toggle** | Client | `label`, `description`, `disabled` | Switch mit optionaler Beschreibung |
| **Badge** | Server | Varianten wie semantische Farben + `neutral`; Sizes: `sm`, `default`; optional `icon` | Status-Kennzeichnung |
| **Pill** | Client | `label`, `variant`, `onRemove` | Entfernbares Tag-Element |
| **Divider** | Server | `default`, `strong`, `labeled` | Trennlinie, optional mit Label |
| **Skeleton** | Server | `text`, `text-block`, `card`, `avatar`, `image`, `stat`; `count` | Lade-Platzhalter |
| **Spinner** | Client | `sm`, `default`, `lg` | Animierter Lade-Indikator |
| **EmptyState** | Server | `icon`, `title`, `description`, `action` | Leerzustand mit CTA |

### 3.2 Formular-Komponenten

| Komponente | Typ | Beschreibung |
|------------|-----|--------------|
| **FormField** | Server | Label-Wrapper für Formularfelder |
| **FormError** | Server | Fehleranzeige; Varianten: `card`, `inline`, `compact` |
| **DateTimePicker** | Client | `datetime-local` Input mit Label/Error/Hint |
| **PhotoCapture** | Client | Foto-Upload mit Kamera-Support; Mobile: Direktaufnahme, Desktop: Datei + Webcam-Modal; Varianten: `emerald`, `orange` |

### 3.3 Modale / Overlays

| Komponente | Typ | Beschreibung |
|------------|-----|--------------|
| **Sheet** | Client | Bottom-Sheet mit Drag-Handle, Focus-Trap, ESC-Close |
| **ActionModal** | Server-rendered Portal | Zentrierter Dialog mit Icon-Header; Theme: `admin`/`user` |
| **Toast** | Client | Auto-Dismiss-Notification; Types: `success`, `error`, `warning`, `info` |
| **ToastProvider** | Client | Context-Provider; API: `success()`, `error()`, `warning()`, `info()`; Max 3 sichtbar |
| **NewEntrySheet** | Client | Sheet mit Eintragstyp-Auswahl (Verschluss/Öffnen/Prüfung/Orgasmus); aktiviert/deaktiviert je nach Schloss-Status |
| **ImageViewer / FullscreenImageModal** | Client | Thumbnail → Fullscreen mit Pinch-Zoom, Kommentar-Panel |

### 3.4 Navigation & Chrome

| Komponente | Typ | Kontext | Beschreibung |
|------------|-----|---------|--------------|
| **Header** | Server | Dashboard-Layout | Logo + AvatarMenu, sticky |
| **AdminHeader** | Server | Admin-Layout | Logo + "ADMIN"-Badge + AvatarMenu |
| **DesktopSidebar** | Client | Dashboard-Layout | User-Sidebar mit Nav-Items + Neu-Button + Sign-Out |
| **AdminDesktopSidebar** | Client | Admin-Layout | Admin-Sidebar mit User-Picker-Sheet |
| **BottomNav** | Client | Dashboard-Layout | Mobile-Navigation mit zentralem Neu-Button |
| **AdminBottomNav** | Client | Admin-Layout | Mobile-Navigation mit FAB |
| **AdminFAB** | Client | AdminBottomNav | Floating Action Button → User-Picker |
| **AvatarMenu** | Client | Header/AdminHeader | Dropdown: Username, Settings, Sign-Out |
| **UserContextBar** | Server | User-Detail-Layout | Zeigt User + Lock-Status + User-Wechsel |
| **UserSubNav** | Client | User-Detail-Layout | Tabs (Desktop) / Dropdown (Mobile) |
| **ModeSwitchSheet** | Client | Sidebar | Wechsel User ↔ Admin Modus (Dual-Role) |
| **LocaleSwitcher** | Client | Login-Seite | DE/EN Toggle, speichert in Cookie |

### 3.5 Daten-Darstellung

| Komponente | Typ | Beschreibung |
|------------|-----|--------------|
| **LaufendeSessionCard** | Server (async) | Session-Hero-Karte: Lock-Status, Live-Timer (SessionDurationBadge), Trainingsvorgaben-Progress, Timeline (SessionEventRow), Sperrzeit-Footer |
| **SessionDurationBadge** | Client | Live-aktualisierter Dauer-Counter (minutengenau), Sub-Komponente von LaufendeSessionCard |
| **SessionEventRow** | Client | Einzelne Timeline-Zeile mit Icon, Datum, Bild-Modal, Kontrolle-Pills; Sub-Komponente von LaufendeSessionCard |
| **EntryRow** | Server | Einzelner Eintrag: Typ-Icon, Zeit, Metadata, optionales Aktions-Menü |
| **SessionTimeline** | Server | Vertikale Timeline: Verschluss→Öffnen-Paare mit Prüfungen/Orgasmen dazwischen; Badges, Thumbnails |
| **StatsCard** | Server | Einzelne Metrik-Karte; Varianten: `default`, `progress` (Balken), `trend` (Pfeil) |
| **StatusBadge** | Client | Schloss-Status mit Live-Timer; Sizes: `large`, `compact` |
| **TimerDisplay** | Client | Live-Timer (Countdown/Countup) mit Phasen-Farben und Warning-Thresholds |
| **CalendarContainer** | Client | Monats-Kalender mit farbkodierten Tragetagen, Tages-Detail-Modal |
| **CalendarExpand** | Client | Wrapper um CalendarContainer mit Show-More |
| **MonthStats** | Client | Tabelle: Monatliche Tragestatistik mit Zielen, Show-More |
| **StatsMain** | Server | Haupt-Statistik-Block: Kalender + MonthStats + Timeline + Vorgaben |
| **KontrolleItemListClient** | Client | Paginierte Liste von Kontrollen mit Thumbnails |
| **OrgasmenListClient** | Client | Paginierte Liste von Orgasmen |

### 3.6 Banner / Hinweise

| Komponente | Typ | Beschreibung |
|------------|-----|--------------|
| **KontrolleBanner** | Server | Kontrolle-Frist-Banner; `compact` (inline) / `large` (mit Link); Orange (offen) / Rot (überfällig) |
| **LockRequestBanner** | Server | Verschluss-Anforderung / Sperrzeit-Banner; `compact` / `large` |
| **InstallBanner** | Client | PWA-Installationsaufforderung; erkennt Plattform (Android/iOS); localStorage-Dismiss |
| **VersionChecker** | Client | Prüft alle 5 Min auf App-Update via `/api/version` |

### 3.7 Hooks

| Hook | Beschreibung |
|------|--------------|
| **useToast** | Zugriff auf Toast-API aus ToastContext |
| **usePhotoUpload** | Upload + EXIF-Validierung + Siegel-Erkennung (Claude Vision); Returns: imageUrl, exifWarning, sealNumber |

---

## 4. Seiteninventar mit Komponentenverwendung

### 4.1 Öffentliche Seiten

#### `/login` — Login
| Element | Komponente |
|---------|-----------|
| Sprachauswahl | LocaleSwitcher |
| Formular | Input (username), Input (password) |
| Fehleranzeige | Inline-Fehler (kein FormError) |
| Aktion | Button (primary) |
| Link | Passwort vergessen → `/forgot-password` |

#### `/forgot-password` — Passwort vergessen
| Element | Komponente |
|---------|-----------|
| Formular | Input (username) |
| Feedback | Erfolgs-/Fehlermeldung inline |
| Aktion | Button (primary) |

#### `/reset-password` — Passwort zurücksetzen
| Element | Komponente |
|---------|-----------|
| Formular | Input (neues Passwort), Input (Bestätigung) |
| Validierung | Passwort-Match-Prüfung |
| Aktion | Button (primary) |

#### `/info/[lang]` — Öffentliche Info-Seite
| Element | Beschreibung |
|---------|-------------|
| Hero-Bereich | Feature-Beschreibung, CTA |
| Feature-Sektionen | Dashboard, Einträge, Statistik, Kontrollen, Admin |
| Screenshots | Statische Bilder der App |

---

### 4.2 Dashboard-Seiten (User)

#### `/dashboard` — Übersicht
| Element | Komponente |
|---------|-----------|
| Laufende Session | LaufendeSessionCard (Card + StatusBadge + TimerDisplay) |
| Kontrolle-Hinweis | KontrolleBanner (large) |
| Verschluss-Anforderung | LockRequestBanner (large) |
| Eintrags-Liste | DashboardClient → EntryRow + EntryActions |
| Session-Paare | SessionList → SessionTimeline |
| Trainingsziel | StatsCard (progress) |

#### `/dashboard/eintraege` — Alle Einträge
| Element | Komponente |
|---------|-----------|
| Eintrags-Liste | EntryRow (paginiert, 100/Seite) |
| Aktions-Menü je Eintrag | EntryActions (Edit, Delete) |
| Paginierung | Prev/Next Links |
| Leerzustand | EmptyState |
| Lade-Skeleton | Loading.tsx → Skeleton |

#### `/dashboard/stats` — Statistik
| Element | Komponente |
|---------|-----------|
| Statistik-Block | StatsMain (Server) |
| → Kalender | CalendarExpand → CalendarContainer |
| → Monatsübersicht | MonthStats |
| → Timeline | SessionTimeline |
| → Trainingsziele | StatsCard (progress) |

#### `/dashboard/settings` — Einstellungen
| Element | Komponente |
|---------|-----------|
| Passwort ändern | SettingsForm → Input, Button |
| E-Mail ändern | Input, Button |
| Upload-Modus | Toggle (mobileDesktopUpload) |
| Push-Benachrichtigungen | PushManager |
| Version | Monospace-Text |

#### `/dashboard/changelog` — Changelog
| Element | Beschreibung |
|---------|-------------|
| Timeline | Version + Datum + Änderungsliste |
| Typ-Icons | feat/fix/security/perf/chore/ui |
| Daten | changelog.json |

#### `/dashboard/new` — Neuer Eintrag (Typ-Auswahl)
| Element | Komponente |
|---------|-----------|
| 4 Aktions-Karten | Card (semantic, interactive) |
| Bedingte Anzeige | Verschluss nur wenn offen, Öffnen nur wenn verschlossen |

#### `/dashboard/new/verschluss` — Verschluss-Formular
| Element | Komponente |
|---------|-----------|
| Zeitstempel | DateTimePicker |
| Foto | PhotoCapture (emerald) → usePhotoUpload |
| EXIF-Warnung | Inline-Warnung |
| Siegel-Erkennung | Badge mit erkannter Nummer |
| Notiz | Textarea |
| Submit | Button (semantic: lock) |

#### `/dashboard/new/oeffnen` — Öffnen-Formular
| Element | Komponente |
|---------|-----------|
| Grund | Select (OEFFNEN_GRUENDE) |
| Zeitstempel | DateTimePicker |
| Foto | PhotoCapture (orange) → usePhotoUpload |
| Notiz | Textarea |
| Submit | Button (semantic: unlock) |

#### `/dashboard/new/pruefung` — Prüfung-Formular
| Element | Komponente |
|---------|-----------|
| Zeitstempel | DateTimePicker |
| Foto | PhotoCapture → usePhotoUpload |
| Code (vorausgefüllt bei Kontrolle) | Input (readonly wenn von Kontrolle) |
| Kommentar | Textarea |
| Code-Verifikation | Automatisch via `/api/verify-kontrolle` |
| Submit | Button (semantic: inspect) |

#### `/dashboard/new/orgasmus` — Orgasmus-Formular
| Element | Komponente |
|---------|-----------|
| Art | Select (ORGASMUS_ARTEN) |
| Zeitstempel | DateTimePicker |
| Notiz | Textarea |
| Submit | Button (semantic: orgasm) |

#### `/dashboard/edit/[id]` — Eintrag bearbeiten
Rendert das passende Formular (Verschluss/Öffnen/Prüfung/Orgasmus) mit vorausgefüllten Werten. Gleiche Komponenten wie `/dashboard/new/*`.

---

### 4.3 Admin-Seiten

#### `/admin` — Admin-Dashboard
| Element | Komponente |
|---------|-----------|
| User-Karten (Grid) | Card (interactive) mit StatusBadge, Tragezeit |
| Offene Kontrollen | KontrolleBanner (compact) pro User |
| Offene Anforderungen | LockRequestBanner (compact) pro User |
| Quick-Actions | Buttons pro User (Kontrolle, Verschluss-Anforderung) |

#### `/admin/kontrollen` — Alle Kontrollen
| Element | Komponente |
|---------|-----------|
| Filter | Optional userId-Filter |
| Kontrolle-Liste | AdminKontrolleListClient |
| Status-Pills | Pill (aus kontrollePills.ts) |
| Aktionen | Zurückziehen / Manuell verifizieren Buttons |

#### `/admin/settings` — Admin-Einstellungen
| Element | Komponente |
|---------|-----------|
| E-Mail ändern | ChangeEmailButton → ActionModal |
| Passwort ändern | ChangePasswordButton → ActionModal |

#### `/admin/users/new` — Neuer User
| Element | Komponente |
|---------|-----------|
| Formular | Input (username, password, email), Select (role) |
| Fehler | FormError |
| Submit | Button (primary) |

#### `/admin/dev/components` — Komponenten-Showcase
Zeigt alle 29 Shared Primitives als Live-Beispiele. Nur Admin-Zugang.

---

### 4.4 Admin User-Detail-Seiten

Alle unter `/admin/users/[id]/` — eingerahmt von UserContextBar + UserSubNav.

#### `.../[id]` — User-Übersicht
| Element | Komponente |
|---------|-----------|
| Aktive Session | LaufendeSessionCard (Card + StatusBadge + TimerDisplay) |
| Kontrolle-Banner | KontrolleBanner (large, mit Admin-Aktionen) |
| Anforderung-Banner | LockRequestBanner (large) |
| Trainingsziel | StatsCard (progress) |
| Letzte Sessions | SessionTimeline (limit 5) |
| Letzte Kontrollen | KontrolleItemListClient (limit 5) |
| Letzte Orgasmen | OrgasmenListClient (limit 5) |

#### `.../aktionen` — Aktionen-Menü
| Element | Komponente |
|---------|-----------|
| Aktions-Links | Card (interactive, semantic) — bedingt angezeigt |
| Kontrolle anfordern | Nur wenn: verschlossen + E-Mail vorhanden |
| Verschluss anfordern | Nur wenn: offen + E-Mail + keine offene Anforderung |
| Sperrdauer setzen | Nur wenn: verschlossen + keine aktive Sperrzeit |
| Einträge erstellen | Verschluss/Öffnen/Prüfung/Orgasmus (bedingt) |

#### `.../aktionen/kontrolle` — Kontrolle anfordern
| Element | Komponente |
|---------|-----------|
| Formular | KontrolleForm (Kommentar-Textarea) |
| Submit | Button (semantic: inspect) |

#### `.../aktionen/verschluss-anforderung` — Verschluss anfordern / Sperrzeit
| Element | Komponente |
|---------|-----------|
| Formular | VerschlussAnforderungForm |
| Art-Switch | ANFORDERUNG (offen→verschliessen) vs. SPERRZEIT (verschlossen→nicht öffnen) |
| Dauer | Input/DateTimePicker |
| Nachricht | Textarea |

#### `.../aktionen/verschluss|oeffnen|pruefung|orgasmus`
Gleiche Formulare wie User-Dashboard `/new/*`, aber mit `userId`-Prop (Admin erstellt Eintrag für User).

#### `.../eintraege` — User-Einträge
| Element | Komponente |
|---------|-----------|
| Eintrags-Liste | EntryRow (paginiert, 100/Seite) |
| Paginierung | Prev/Next Links |

#### `.../kontrollen` — User-Kontrollen
| Element | Komponente |
|---------|-----------|
| Offene Anforderungen | KontrolleBanner + Admin-Aktionen |
| Kontrolle-Liste | AdminKontrolleListClient |
| Kontrolle anfordern | Button (wenn verschlossen) |

#### `.../einstellungen` — User-Einstellungen
| Element | Komponente |
|---------|-----------|
| Account-Daten | Input (username, email), Button (Passwort setzen) |
| Rolle | Select (user/admin) |
| Reinigung | Input (Pausendauer) |
| App-Einstellungen | Toggle (mobileDesktopUpload) |
| Trainingsvorgaben | VorgabeForm + VorgabeRow-Liste |

#### `.../stats` — User-Statistik
Identisch mit `/dashboard/stats` — rendert StatsMain mit userId.

#### `.../strafbuch` — Strafbuch
| Element | Komponente |
|---------|-----------|
| Verstösse-Liste | StrafbuchClient |
| Kategorien | Unerlaubte Öffnungen, Zu-Spät-Kontrollen, Abgelehnte Kontrollen |
| Strafen | StrafeRecord-Einträge |

---

## 5. Interaktionsmuster

### 5.1 Eintrag erstellen (User-Flow)

```
BottomNav [+] / Sidebar [Neu]
  → NewEntrySheet (Bottom-Sheet)
    → Typ wählen (bedingt aktiv/inaktiv)
      → /dashboard/new/[typ]
        → Formular ausfüllen (Foto, Zeit, Notiz)
        → Submit → Toast (success/error)
        → Redirect → /dashboard
```

### 5.2 Kontrolle-Flow (Admin → User)

```
Admin: /admin/users/[id]/aktionen/kontrolle
  → KontrolleForm absenden
  → E-Mail mit 5-stelligem Code an User
  → KontrolleBanner erscheint bei User

User: Klick auf KontrolleBanner
  → /dashboard/new/pruefung?code=XXXXX
  → Foto mit handgeschriebenem Code aufnehmen
  → Claude Vision verifiziert Code
  → Toast mit Ergebnis
```

### 5.3 Sheet/Modal-Pattern

Sheets (Bottom-Sheets) für kontextuelle Aktionen:
- **NewEntrySheet**: Typ-Auswahl für neuen Eintrag
- **User-Picker-Sheet**: Admin wählt User für Aktion
- **ModeSwitchSheet**: User/Admin-Modus wechseln
- **Sign-Out-Bestätigung**: Confirmation vor Logout

ActionModal für Einstellungen:
- **ChangeEmailButton**: E-Mail ändern
- **ChangePasswordButton**: Passwort ändern

### 5.4 Formular-Konventionen

| Aspekt | Pattern |
|--------|---------|
| Loading-State | `saving` (nicht `loading`) |
| Fehler-Anzeige | FormError (`card`-Variante) oder styled Card mit `text-warn` |
| Netzwerk-Fehler | `try/catch` mit Toast-Feedback |
| Nach Submit | `router.push(redirectTo ?? "/dashboard")` |
| Validierung | Zentrale Konstanten aus `lib/constants.ts` |

### 5.5 Loading-States

8 Seiten haben dedizierte `loading.tsx` mit Skeleton-Komponenten:
- Dashboard, Einträge, Stats (User)
- Admin-Dashboard, Kontrollen (Admin)
- User-Detail, User-Einstellungen, User-Stats (Admin)
