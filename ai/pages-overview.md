# ChastityTracker — Seiten & Zustands-Übersicht

**Version**: 1.0 | **Datum**: 2026-03-27 | **Basis**: Code-Stand + redesign-spec.md v2.0 + DESIGN_SPEC.md v1.0

Dieses Dokument beschreibt alle Seiten und Zustände der App **nach dem Redesign**. Es kombiniert
das Ist (aktueller Code) mit den Soll-Entscheidungen aus der Redesign-Spezifikation.
Abweichungen zwischen Ist und Soll sind explizit markiert.

---

## Legende

### Rollen
- **BENUTZER** — erfasst eigene Einschlüsse, Prüfungen, Orgasmen; sieht nur eigene Daten
- **ADMIN** — verwaltet Benutzer, setzt Vorgaben, fordert Kontrollen an; kein FAB

### Themes
- **Helles Theme** (`data-theme="user"`) — alle `/dashboard/*` und `/login` Seiten
  - Hintergrund: `#f8f9fb`, Karten: `#ffffff`, Text: `#111827`
- **Dunkles Theme** (`data-theme="admin"`) — alle `/admin/*` Seiten
  - Hintergrund: `#0d0f14`, Karten: `#1c1f2a`, Text: `#f1f5f9`

### Semantische Farben (theme-unabhängige Bedeutung)
| Bedeutung | User-Theme | Admin-Theme |
|---|---|---|
| VERSCHLOSSEN | emerald-600 `#059669` | emerald-400 `#34d399` |
| OFFEN | gray-700 `#374151` | slate-400 `#94a3b8` |
| PRUEFUNG ausstehend | orange-600 `#ea580c` | amber-500 `#f59e0b` |
| PRUEFUNG überfällig | red-600 | red-400 `#f87171` |
| ORGASMUS | rose-600 `#e11d48` | rose-400 `#fb7185` |
| ANFORDERUNG (Verschluss angefordert) | indigo-600 `#4f46e5` | indigo-400 `#818cf8` |
| SPERRZEIT (Öffnen verboten) | rose-700 `#be123c` | rose-400 `#fb7185` |
| Warnung / überfällig | amber-600 `#d97706` | red-400 `#f87171` |
| Konform / erfüllt | emerald-600 | emerald-400 `#34d399` |

### Alarm-Prioritätsreihenfolge (Benutzer-Dashboard, von oben nach unten)
1. Prüfung ausstehend, Frist < 1h → rotes pulsierendes Banner
2. Prüfung ausstehend, Frist > 1h → oranges Banner
3. Verschlussanforderung (ANFORDERUNG) → indigofarbenes Banner
4. Sperrzeit aktiv (wenn nicht gesperrt) → rosefarbenes Banner
5. Trainingsziel nicht erfüllt → gelb-oranger Hinweis in Statuskarte

### Layout-Struktur (Redesign)
```
src/app/
├── (user)/layout.tsx       — helles Theme, Benutzer-BottomNav, Benutzer-DesktopSidebar
│   └── dashboard/
├── (admin)/layout.tsx      — dunkles Theme, Admin-BottomNav, Admin-DesktopSidebar
│   └── admin/
└── (auth)/layout.tsx       — minimales Layout, keine Navigation
    └── login/, forgot-password/, reset-password/
```

> **Ist-Zustand**: Aktuell existiert ein gemeinsames Layout mit bedingter `isAdmin`-Logik.
> Die Route-Group-Aufteilung ist per Spec beschlossen, aber noch nicht implementiert.

---

## NUTZER-MODUS (helles Theme)

### Navigation (Bottom Nav + FAB)

**Bottom Nav (mobil, 3 Tabs + FAB):**
| Position | Icon | Route | Aktiv wenn |
|---|---|---|---|
| Tab 1 | LayoutDashboard | /dashboard | exakte Übereinstimmung |
| Tab 2 | BarChart2 | /dashboard/stats | startsWith |
| Tab 3 | (freier Slot) | — | — |
| FAB (schwebt über Nav) | kontextabhängig (siehe unten) | kontextabhängig | immer sichtbar |

**FAB-Zustände:**
| Aktueller Status | FAB-Icon | FAB-Farbe | Ziel |
|---|---|---|---|
| Aktuell offen (kein aktives Paar) | Lock | emerald-600 (grün) | /dashboard/new/verschluss |
| Aktuell gesperrt (aktives Paar) | LockOpen | gray-900 (dunkel) | /dashboard/new/oeffnen |
| Prüfung ausstehend (höchste Priorität) | ClipboardList (pulsierend) | orange-500 | /dashboard/new/pruefung?code=... |
| Frist abgelaufen (überfällig) | X | red-600 | Toast "Frist abgelaufen" |

**Einstellungen** sind nicht als Tab sichtbar — Zugriff über Avatar-Menü im Header (NEU, noch nicht implementiert).

**Desktop Sidebar:**
- Breite: `w-52` (208px)
- Aktiver Tab: `bg-gray-100`, Icon + Text in emerald-600
- Inaktiver Tab: `text-gray-400`, Hover: `text-gray-700`

---

### /dashboard — Haupt-Dashboard

**Route**: `/dashboard` | **Theme**: hell | **Auth**: Benutzer erforderlich

**Header:**
- Links: Logo "KG-Tracker"
- Rechts: Avatar-Circle mit Initiale (Tap → Avatar-Menü mit Einstellungen + Abmelden)

**Navigation:** Bottom Nav Tab 1 aktiv

**Hauptinhalt (von oben nach unten, alle Zustände):**

---

#### Zustand A: Erste Nutzung (noch nie ein Eintrag)

**Sichtbare Elemente:**
1. Seitentitel: "Dashboard" (`h1`)
2. Onboarding-Karte (ersetzt StatusBanner):
   - Text: "Willkommen, [Name]" + "Noch keine Sessions erfasst. Tippe auf + um zu beginnen."
   - CTA-Button: "Ersten Verschluss eintragen" → /dashboard/new/verschluss

**FAB**: Lock-Icon, grün, Ziel: /dashboard/new/verschluss

**Stats-Grid**: Einträge: 0 / Gesamtdauer: –

**Keine** Session-Liste, keine Kontrollen, keine Orgasmus-Liste

---

#### Zustand B: Zuletzt geöffnet (kein aktives Paar, mindestens 1 abgeschlossenes Paar)

**Sichtbare Elemente:**
1. Seitentitel: "Dashboard"
2. **StatusBanner** (kleines Banner, ~48px):
   - Grauer Punkt ○
   - "OFFEN seit [Dauer]"
3. *(optional)* **Verschlussanforderungs-Banner** (indigofarbenes Banner), wenn `offeneVerschlussAnf` vorhanden:
   - Lock-Icon, fetter Text "Verschluss angefordert"
   - Optionale Nachricht des Admins
   - Optionale Frist ("Bis: [Datum]")
4. *(optional)* **Sperrzeit-Banner** (rosefarbenes Banner), wenn `activeSperrzeit` vorhanden UND Benutzer aktuell geöffnet ist:
   - Lock-Icon, "Gesperrt"
   - Optionale Nachricht
   - Optionale Endzeit
5. *(optional)* **Kontroll-Banner** (orangefarbenes Banner), wenn offene Kontrolle ausstehend:
   - Frist und Code sichtbar
   - "Jetzt einreichen →" Link zu /dashboard/new/pruefung?code=...
6. **Stats-Grid** (2 Spalten):
   - "Einschlüsse" = Anzahl Paare
   - "Gesamtdauer" = Summe aller abgeschlossenen Sessions
7. *(optional)* **Trainingsvorgabe-Card** (nur wenn aktive Vorgabe vorhanden UND kein aktives Paar):
   - Pill "aktiv"
   - Zeitraum gültig ab/bis
   - Zielwerte pro Tag / Woche / Monat mit Prozentwert
   - Optionale Notiz
8. **SessionList** — Alle Paare, neueste zuerst
9. *(optional)* **Offene Anforderungen-Liste** — KontrollAnforderungen ohne verknüpften Entry
10. *(optional)* **Prüfungen-Liste** — erfüllte Kontrollen + standalone PRUEFUNG-Einträge
11. *(optional)* **Orgasmus-Liste** — alle ORGASMUS-Einträge, neueste zuerst

**FAB**: Lock-Icon, grün

**Aktionen**: FAB tippen → /dashboard/new/verschluss

---

#### Zustand C: Aktiv gesperrt (aktives Paar vorhanden)

**Sichtbare Elemente:**
1. Seitentitel: "Dashboard"
2. **LaufendeSessionCard** (expandiert, ~200px+):
   - Grüner Punkt ● VERSCHLOSSEN
   - Live-Timer seit Verschluss-Zeitpunkt (läuft aufwärts)
   - *(wenn Sperrzeit aktiv)* "Sperrzeit bis [Datum]" direkt in der Karte
   - Kompakte Konformitätsbalken (wenn aktive Trainingsvorgabe):
     - Heute ████░░ 58%
     - Woche ██████░ 91%
     - Monat ████░░ 63%
     - Farbschwellen: < 50% rot, 50–79% orange, >= 80% grün, >= 100% sattes grün
   - Timeline der Session-Events (chronologisch):
     - Verschluss-Event (Zeit, Foto-Vorschau, Notiz)
     - *(falls vorhanden)* Kontroll-Events (Zeit, Foto, Code, Status-Pill)
     - *(falls vorhanden)* Orgasmus-Events (Zeit, Art, Notiz)
     - *(falls vorhanden)* Reinigung-Events (Zeit, Dauer der Pause)
3. *(wenn offene Verschlussanforderung vorhanden)* Indigofarbenes Banner
4. *(wenn Prüfung ausstehend)* Orangefarbenes Kontroll-Banner (höchste Priorität — vor Verschlussanforderungs-Banner)
5. Stats-Grid (2 Spalten)
6. **Kein** Trainingsvorgabe-Block (da Vorgabe bereits in der LaufendeSessionCard kompakt angezeigt)
7. SessionList, Offene Anforderungen, Prüfungen, Orgasmus-Liste (wie Zustand B)

**FAB**: LockOpen-Icon, dunkel (gray-900), Ziel: /dashboard/new/oeffnen
**FAB** (bei ausstehender Prüfung): ClipboardList (pulsierend), orange, Ziel: /dashboard/new/pruefung?code=...

**Bedingungen / Sonderfälle:**
- Sperrzeit-Banner erscheint NICHT separat, wenn gesperrt — wird in LaufendeSessionCard integriert
- Wenn die Prüfungsfrist abgelaufen ist: Banner rot, kein "Jetzt einreichen"-Link; FAB zeigt X und Tap → Toast

---

#### Zustand D: Prüfung überfällig (Frist abgelaufen)

Wie Zustand B oder C, aber:
- **Kontroll-Banner**: roter Hintergrund, "Prüfungsfrist abgelaufen" — kein Einreichen-Link
- **FAB**: X-Icon, rot; Tap → Toast "Frist abgelaufen — wende dich an deinen Keyholder"

---

### /dashboard/new — Eintrag-Hub

**Route**: `/dashboard/new` | **Theme**: hell

**Header-Inhalt:** Standard (Logo + Avatar)

**Navigation:** Kein Tab aktiv (Hub liegt oberhalb der Navigation)

**Hauptinhalt:**
- Seitentitel: "Neuer Eintrag"
- Kontextabhängiges Aktionsraster (4 Kacheln, vertikal gestapelt auf mobil):

| Element | Wenn geöffnet | Wenn gesperrt |
|---|---|---|
| VERSCHLUSS | Grüne Kachel, klickbar → /dashboard/new/verschluss | Graue Kachel, disabled, Text "Bereits verschlossen" |
| OEFFNEN | Graue Kachel, disabled, Text "Aktuell offen" | Dunkle Kachel, klickbar → /dashboard/new/oeffnen |
| PRUEFUNG | Orange, immer klickbar → /dashboard/new/pruefung | Orange, immer klickbar |
| ORGASMUS | Rose, immer klickbar → /dashboard/new/orgasmus | Rose, immer klickbar |

**Bestimmung des Zustands**: Letzter VERSCHLUSS/OEFFNEN-Eintrag → `isLocked = latest.type === "VERSCHLUSS"`

**Aktionen:** Tippen auf aktive Kachel navigiert zur jeweiligen Unterseite

---

### /dashboard/new/verschluss — Verschluss erfassen

**Route**: `/dashboard/new/verschluss` | **Theme**: hell

**Redirect**: Wenn bereits gesperrt → redirect nach `/dashboard/new`

**Hauptinhalt:**
- Zurück-Link: "← Zurück"
- Seitentitel: "Verschluss eintragen"
- Formular (`VerschlussForm`, max-w-lg):
  - Zeitstempel (datetime-local, vorausgefüllt mit jetzt)
  - Foto-Upload (optional)
  - Notiz (Textarea, optional)
  - Submit-Button

**Aktionen:** Formular absenden → POST /api/entries → Redirect nach /dashboard

---

### /dashboard/new/oeffnen — Öffnen erfassen

**Route**: `/dashboard/new/oeffnen` | **Theme**: hell

**Redirect**: Wenn nicht gesperrt → redirect nach `/dashboard/new`

**Hauptinhalt:**
- Zurück-Link
- Seitentitel: "Öffnen eintragen"
- Formular (`OeffnenForm`, max-w-lg):
  - Zeitstempel (datetime-local)
  - Grund / Notiz
  - Foto-Upload (optional)
  - Submit-Button
  - *(wenn Sperrzeit aktiv)* Warnhinweis "Sperrzeit aktiv bis [Datum]" — Öffnen trotzdem möglich, aber sichtbarer Hinweis

**Props vom Server:**
- `sperrzeitEndetAt` — Endzeit der aktiven Sperrzeit (oder null)
- `sperrzeitUnbefristet` — ob die Sperrzeit unbefristet ist

---

### /dashboard/new/pruefung — Prüfung einreichen

**Route**: `/dashboard/new/pruefung` | **Theme**: hell | **Query-Params**: `?code=[CODE]&kommentar=[TEXT]`

**Hauptinhalt:**
- Zurück-Link
- Seitentitel: "Prüfung einreichen"
- Formular (`PruefungForm`, max-w-lg):
  - Code-Feld (vorausgefüllt wenn `?code=` vorhanden)
  - Zeitstempel (datetime-local)
  - Foto-Upload (Pflicht für Prüfungen mit Code)
  - Notiz (optional)
  - *(wenn Kommentar via Query-Param)* Admin-Anweisung sichtbar angezeigt
  - Submit-Button

**Verhalten:** Foto-Upload → Claude Vision erkennt Code automatisch (POST /api/verify-kontrolle)

---

### /dashboard/new/orgasmus — Orgasmus erfassen

**Route**: `/dashboard/new/orgasmus` | **Theme**: hell

**Hauptinhalt:**
- Zurück-Link
- Seitentitel: "Orgasmus eintragen"
- Formular (`OrgasmusForm`, max-w-lg):
  - Zeitstempel (datetime-local)
  - Art (Auswahl: z.B. solo, Partner, erzwungen — gemäss Enum)
  - Notiz (optional)
  - Submit-Button

---

### /dashboard/edit/[id] — Eintrag bearbeiten

**Route**: `/dashboard/edit/[id]` | **Theme**: hell

**Hauptinhalt:**
- Zurück-Link
- Seitentitel: "Eintrag bearbeiten"
- Formular (je nach Eintrag-Typ: Verschluss/Oeffnen/Pruefung/Orgasmus)
- Löschen-Button (destructive)

**Aktionen:**
- Speichern → PATCH /api/entries/[id]
- Löschen → DELETE /api/entries/[id]

---

### /dashboard/stats — Statistiken

**Route**: `/dashboard/stats` | **Theme**: hell

**Navigation:** Bottom Nav Tab 2 aktiv

**Hauptinhalt** (über `StatsMain`-Komponente, SSR):
- Seitentitel: "Statistiken"
- **Kalender-Heatmap**: Monatsansicht mit farbigen Tagen (Tragedauer-Intensität)
- **Monatsübersicht**: Balkendiagramm oder Tabelle der Stunden pro Monat
- **Trainingsziel-Konformität** (vollständige Variante, wenn aktive Vorgabe):
  ```
  Trainingsziel (01.02.2026 – offen)
  Täglich     ████████░░  58%   4.6h / 8h    △ -3.4h
  Wöchentlich ██████████  91%  38h / 42h    ✓ +0h Ziel erreicht
  Monatlich   ████████░░  63%  126h / 200h  △ -74h verbleibend
  ```
- Gleiche `StatsMain`-Komponente wird auch in `/admin/users/[id]/stats` verwendet

**Zustände:**
- Ohne Daten: Leer-Zustand mit Hinweistext
- Mit Daten: Volle Statistik-Ansicht

---

### /dashboard/settings — Einstellungen

**Route**: `/dashboard/settings` | **Theme**: hell

**Zugang** (Redesign): Primär über Avatar-Menü im Header, nicht über Bottom Nav Tab

**Hauptinhalt** (über `SettingsForm`-Komponente):
- Passwort ändern (aktuelles PW, neues PW, Bestätigung)
- E-Mail ändern (neues E-Mail-Feld)
- App-Info (Version, Build-Datum) + Link zum Changelog

**Aktionen:**
- Passwort speichern → PATCH /api/settings/password
- E-Mail speichern → PATCH /api/settings/email (oder äquivalent)

---

### /dashboard/changelog — Changelog (geplant)

**Route**: `/dashboard/changelog` | **Theme**: hell

**Status**: In Spec erwähnt, Route existiert im Routing, Inhalt noch nicht detailliert.

**Hauptinhalt:**
- Versionsliste mit Änderungen
- Link von `/dashboard/settings` aus

---

## ADMIN-MODUS (dunkles Theme)

### Navigation (Bottom Nav Admin)

**Bottom Nav (mobil, 3 Tabs):**
| Position | Icon | Route | Aktiv wenn |
|---|---|---|---|
| Tab 1 | Users2 | /admin | startsWith("/admin"), aber nicht /admin/kontrollen |
| Tab 2 | Activity | /admin/kontrollen | startsWith("/admin/kontrollen") |
| Tab 3 | (freier Slot) | — | — |

> **Ist-Zustand**: Aktuell teilen Admin und Benutzer eine BottomNav-Komponente mit `isAdmin`-Prop.
> Die Admin-Tab-Struktur (3 Tabs ohne FAB) ist per Spec beschlossen.

**Einstellungen**: Avatar-Menü im Header → /admin/settings (NEU)

**Desktop Sidebar (Admin-Dunkel):**
- Breite: `w-60` (240px), Hintergrund: `--surface` (#1c1f2a)
- Abschnitt "BENUTZER" mit Benutzerliste (Statuspunkte)
- Aktiver Nav-Eintrag: `border-l-2 border-[--color-request]` (indigo-400) + `bg-[--surface-raised]`
- Wenn Benutzerkontext aktiv: Unternavigation inline in Sidebar

---

### Admin Context Bar (sticky, alle /admin/users/[id]/* Seiten)

Erscheint unterhalb der Admin-Hauptnavigationsleiste auf allen `/admin/users/[id]/*`-Routen.
Höhe: 52px mobil, 44px Desktop. Haftet unterhalb des Headers.

```
┌─────────────────────────────────────────────────────┐
│  ◀ Alle Benutzer     [alice]     [Benutzer wechseln ↕] │
│                      LOCKED · 14h 23m               │
└─────────────────────────────────────────────────────┘
```

- **Links**: "◀ Alle Benutzer" → /admin
- **Mitte**: Benutzername + aktueller Sperrstatus + Laufzeit
- **Rechts**: Schaltfläche "Benutzer wechseln" → öffnet Bottom Sheet mit Benutzerliste

> **Ist-Zustand**: Aktuell zeigt ein simpler Context-Bar auf mobil nur den Admin-Benutzernamen.
> Die volle Context Bar (mit Benutzer-Kontext, Status, Wechsel-Button) ist per Spec beschlossen.

---

### /admin — Benutzer-Übersicht (Admin-Startseite)

**Route**: `/admin` | **Theme**: dunkel | **Auth**: Admin erforderlich

**Header-Inhalt:**
- Logo "KG-Tracker" + kleines "Admin"-Badge in indigo-400
- Rechts: Avatar-Circle (Tap → Avatar-Menü)

**Navigation:** Bottom Nav Tab 1 aktiv

**Hauptinhalt (von oben nach unten):**

---

#### Zustand A: Keine Benutzer (leerer Zustand)

```
┌─────────────────────────────────┐
│       Noch keine Benutzer       │
│  Lege den ersten Benutzer an,   │
│  um mit der Betreuung zu        │
│  beginnen.                      │
│       [ + Benutzer anlegen ]    │
└─────────────────────────────────┘
```

---

#### Zustand B: Benutzer vorhanden

1. **Header-Zeile**:
   - Links: "Benutzerverwaltung" (h1) + "X Benutzer registriert" (Subtext)
   - Rechts: "[+ Neuer Benutzer]"-Button → /admin/users/new

2. *(optional)* **Demo-User-Button** (nur wenn kein "DemoUser" existiert):
   - "Demo-Benutzer erstellen" → POST /api/admin/demo

3. *(optional)* **Handlungsbedarf-Leiste** (Alarmleiste, nur wenn Alarme vorhanden):
   ```
   ┌──────────────────────────────────────────────┐
   │ ⚠ alice — Kontrolle überfällig seit 2h      │  rot, Link → /admin/users/[id]/kontrollen
   │ ℹ carol — Prüfung ausstehend                │  orange, Link → /admin/users/[id]/kontrollen
   │ ↓ bob — Verschluss angefordert, noch offen  │  indigo, Link → /admin/users/[id]
   └──────────────────────────────────────────────┘
   ```
   Admin-Alarm-Hierarchie nach Priorität:
   - P1: Überfällige Prüfung → rotes Badge
   - P2: Eingereichte, ungeprüfte Prüfung → oranges Badge
   - P3: Benutzer offen, aber Sperrzeit aktiv → rose Badge
   - P4: Ausstehende nicht erfüllte ANFORDERUNG → indigo Badge

4. **Benutzerkartenraster** (2-spaltig ab sm+):

   **Benutzerkarte — Zustand: Verschlossen:**
   ```
   ┌──────────────────────────────────────┐
   │ [●] alice              [Löschen ×]  │  ● = emerald Punkt
   │ Rolle: user ▾                        │
   │ [Übersicht] [Stats] [Vorgaben]       │
   │ [Kontrollen] [+Kontrolle]            │
   │                                      │
   │ STATUS          EINSCHLÜSSE          │
   │ Verschlossen    47                   │
   │ seit 14:22 [Datum]                   │
   │                                      │
   │ *(wenn offene Kontrolle)*            │
   │ ⚠ Kontrolle: Code 47291 · Frist 2h  │  amber Banner
   │ *(wenn Anforderung ausstehend)*      │
   │ 🔒 Verschluss angefordert            │  indigo Banner + [Zurückziehen]
   │ *(wenn Sperrzeit aktiv)*             │
   │ 🔒 Gesperrt bis 26.03 08:00          │  rose Banner + [Aufheben]
   └──────────────────────────────────────┘
   ```

   **Benutzerkarte — Zustand: Offen:**
   - Status-Icon: grauer Kreis ○
   - Text "Geöffnet" in slate-400
   - Kein Kontrolle-anfordern-Button (deaktiviert, nur wenn gesperrt sichtbar)

   **Benutzerkarte — Zustand: Noch nie Einträge:**
   - Status: "–" (kein Status)

**Status-Punkt-Semantik** auf Benutzerkartenraster:
- Grün (emerald): GESPERRT, konform
- Amber pulsierend: GESPERRT + Kontrolle überfällig
- Grau (Ring, hollow): GEÖFFNET
- Indigo (Ring + Leuchten): OFFEN + Verschluss angefordert
- Rose (ausgefüllt + Schloss): Sperrzeit aktiv
- Zinc-600: noch keine Einträge

**Aktionen je Benutzerkarte:**
- [Übersicht] → /admin/users/[id]
- [Stats] → /admin/users/[id]/stats
- [Vorgaben] → /admin/users/[id]/vorgaben
- [Kontrollen] → /admin/users/[id]/kontrollen
- [+Kontrolle] (nur wenn gesperrt) → POST /api/admin/kontrolle (mit Bestätigung)
- VerschlussAnforderungButton → kontextabhängig (anfordern / sperrzeit setzen / zurückziehen)
- [Rolle ändern] → PATCH /api/admin/users/[id]
- [Löschen] → DELETE /api/admin/users/[id]

---

### /admin/users/new — Neuen Benutzer anlegen

**Route**: `/admin/users/new` | **Theme**: dunkel (Admin-Layout)

**Hauptinhalt:**
- Zurück-Link: "← Zurück zu Benutzern"
- Seitentitel: "Neuer Benutzer"
- Formular (Client-Komponente, max-w-lg):
  - Benutzername (required)
  - Passwort (required, Passwort-Anzeige-Toggle)
  - E-Mail (optional)
  - Rolle (Select: user / admin)
  - Error-Anzeige bei Fehler
  - Submit: "Benutzer erstellen" → POST /api/admin/users → Redirect nach /admin

---

### /admin/users/[id] — Benutzer-Übersicht (Section-Page)

**Route**: `/admin/users/[id]` | **Theme**: dunkel

**Ist-Zustand**: Momentan Tab-Navigation (`UserNav` Komponente mit 4 Tabs). Enthält bereits alle Inhalte die auch das Benutzer-Dashboard hat (LaufendeSessionCard, StatusBanner, KontrolleBanner, SessionList, etc.)

**Soll-Zustand (Redesign)**: Scrollbare Section-Page, kein Tab-System. Alle Sektionen als Cards auf einer Seite.

**Context Bar**: Admin Context Bar sichtbar (sticky, mit Benutzername + Status + Wechsel-Button)

**Hauptinhalt (Section-Page, von oben nach unten):**

1. **Benutzer-Header** (Name + Zurück-Link) ← wird durch Context Bar abgelöst im Redesign

2. **Status-Card** (Verschlossen / Offen + Live-Timer):
   - Wenn gesperrt: `LaufendeSessionCard` (dieselbe Komponente wie im Benutzer-Dashboard)
   - Wenn geöffnet: `StatusBanner`
   - Grüner linker Rand bei gesperrt; grauer linker Rand bei geöffnet

3. **Schnellaktionen-Panel**:
   | Aktion | Zustand | Sichtbarkeit |
   |---|---|---|
   | [Prüfung anfordern] | nur aktiv wenn gesperrt | immer sichtbar, bedingt deaktiviert |
   | [Verschluss anfordern] | aktiv wenn offen + keine ausstehende Anforderung | immer sichtbar |
   | [Sperrzeit setzen] | immer verfügbar | immer sichtbar |
   | [Sperrzeit aufheben] | nur wenn aktive Sperrzeit vorhanden | nur dann sichtbar |
   | [Anforderung zurückziehen] | ersetzt "Verschluss anfordern" wenn ausstehend | kontextabhängig |

4. **Aktive Trainingsvorgabe** (kompakte Karte, falls vorhanden):
   - Zeitraum + Zielwerte pro Tag/Woche/Monat

5. **Compliance-Übersicht** (Tag/Woche/Monat Bars):
   - Kompakte Variante (nur Prozent, keine Stundenwerte)
   - Farb-Schwellen wie Benutzer-Dashboard

6. *(wenn vorhanden)* **Ausstehende Kontrolle** (prominent, amber Hintergrund):
   - Code + Frist
   - Status (ausstehend / überfällig)

7. **Letzte Einträge** (letzten 10 Sessions):
   - SessionList-Komponente (geteilt mit Benutzer-Dashboard)
   - Link "[→ Kontrollen-History]"

8. **Subpage-Links**:
   - [→ Stats] / [→ Alle Vorgaben] / [→ Kontrollen-History]

9. **Account-Einstellungen** (aktuell in Overview-Page integriert):
   - Passwort ändern (ChangePasswordButton)
   - E-Mail ändern (ChangeEmailButton)
   - Reinigung erlaubt Toggle (ReinigungToggle)

10. *(optional)* Offene Anforderungen-Liste, Prüfungen-Liste, Orgasmus-Liste (wie Benutzer-Dashboard)

**Aktionen:**
- Alle Schnellaktionen (Prüfung / Verschluss / Sperrzeit anfordern)
- Zu Subpages navigieren

---

### /admin/users/[id]/stats — Benutzer-Statistiken

**Route**: `/admin/users/[id]/stats` | **Theme**: dunkel

**Context Bar**: sichtbar

**Hauptinhalt:**
- `UserNav` (aktuell Tab-System → im Redesign: nur Context Bar)
- `StatsMain userId=[id]` — dieselbe Komponente wie /dashboard/stats, aber mit fremder userId

**Zustände:**
- Ohne Daten: Leer-Zustand
- Mit Daten: Kalender-Heatmap, Monatsübersicht, Trainingsziel-Konformität

---

### /admin/users/[id]/vorgaben — Trainingsvorgaben

**Route**: `/admin/users/[id]/vorgaben` | **Theme**: dunkel

**Context Bar**: sichtbar

**Hauptinhalt (von oben nach unten):**
1. `UserNav` (Tab-Navigation, aktuell "Vorgaben" aktiv)
2. **VorgabeForm** (Formular für neue Vorgabe):
   - Gültig ab (date-input)
   - Gültig bis (date-input, optional)
   - Min. pro Tag / Woche / Monat in Stunden (optional)
   - Notiz (optional)
   - Submit: POST /api/admin/vorgaben
3. **Alle Vorgaben** (Liste, neueste zuerst):
   - Aktive Vorgabe hervorgehoben
   - Jede Zeile (`VorgabeRow`): Zeitraum, Zielwerte, Notiz + [Bearbeiten] / [Löschen]

**Zustände:**
- Ohne Vorgaben: Nur Formular sichtbar
- Mit Vorgaben: Formular + sortierte Liste

---

### /admin/users/[id]/kontrollen — Kontrollen-History

**Route**: `/admin/users/[id]/kontrollen` | **Theme**: dunkel

**Context Bar**: sichtbar

**Hauptinhalt (von oben nach unten):**
1. `UserNav` (Tab-Navigation, aktuell "Kontrollen" aktiv)
2. *(wenn gesperrt)* `KontrolleButton` → Bestätigungs-Dialog → POST /api/admin/kontrolle
3. **Offene Anforderungen** (nur wenn vorhanden):
   - KontrollAnforderungen ohne verknüpften Entry
   - Status-Pill, Code, Frist, Erstellungsdatum
   - Aktions-Buttons: [Zurückziehen] / [Manuell bestätigen]
4. **Prüfungen** (alle PRUEFUNG-Einträge, neueste zuerst):
   - Foto-Vorschau
   - Status-Pill (kombiniert: AnforderungStatus + VerifikationStatus)
   - Code (orange, monospace)
   - Zeitstempel Erfassung, Frist, Erstellungsdatum
   - *(wenn Zeitkorrektur)* Amber-Hinweis "Zeit korrigiert"
   - Admin-Anweisung (Kommentar)
   - Notiz des Benutzers
   - Aktions-Buttons: [Manuell bestätigen] / [Ablehnen] / [Zurückziehen]

**Zustände:**
- Leerer Zustand: "Noch keine Kontrollen."
- Nur offene Anforderungen (keine Prüfungen eingereicht)
- Mit erledigten Prüfungen

---

### /admin/kontrollen — Globaler Prüfungs-Feed

**Route**: `/admin/kontrollen` | **Theme**: dunkel | **Optional Query**: `?userId=[id]`

**Navigation:** Bottom Nav Tab 2 aktiv

**Hauptinhalt:**
- Seitentitel: "Kontrollen" (+ optional Benutzername wenn gefiltert)
- Alle Prüfungen aller Benutzer (oder gefiltert nach userId)
- Jede Zeile enthält: Benutzername, Foto, Status-Pills, Code, Zeitstempel, Frist, Notiz
- Aktionen pro Zeile: [Manuell bestätigen] / [Ablehnen] / [Zurückziehen]
- Separate Abschnitte: "Offene Anforderungen" + "Prüfungen"

**Zustände:**
- Leer: "Noch keine Kontrollen."
- Mit Einträgen: sortiert nach Zeit (neueste zuerst)

---

### /admin/settings — Admin-Einstellungen (NEU)

**Route**: `/admin/settings` | **Theme**: dunkel

**Status**: In Spec als neue Route beschlossen, noch nicht implementiert.

**Hauptinhalt:**
- Passwort ändern
- E-Mail ändern
- App-Info (Version, Build-Datum)

---

## GEMEINSAME ZUSTÄNDE / OVERLAYS

### Bottom Sheet: Benutzer wechseln (Admin → anderer Benutzer)

**Auslöser**: "Benutzer wechseln"-Button in der Admin Context Bar
**Inhalt**: Vollständige Benutzerliste mit Statuspunkten
**Aktion**: Tippen → navigiert zu /admin/users/[neu-id], Bottom Sheet schließt sich

### Bottom Sheet: Avatar-Menü

**Auslöser**: Tap auf Avatar-Circle im Header (Benutzer-Modus)
**Inhalt**:
- Benutzername
- [Einstellungen] → /dashboard/settings
- [Abmelden] → POST /api/auth/signout

**Admin-Variante**: Auslöser Avatar im Admin-Header
- [Admin-Einstellungen] → /admin/settings
- [Abmelden]

> **Ist-Zustand**: Noch nicht implementiert. Aktuell kein Avatar-Menü; Einstellungen sind über
> BottomNav / DesktopSidebar erreichbar.

### Kontroll-Bestätigungs-Dialog (Admin)

**Auslöser**: [Prüfung anfordern]-Button auf Benutzerkarte oder Schnellaktionen-Panel
**Inhalt**:
- "Code: 47291 · Frist: 4 Stunden"
- [Senden]-Button
**Aktion**: POST /api/admin/kontrolle → Code per E-Mail, KontrollAnforderung erstellt

### Verschlussanforderungs-Sheet (Admin)

**Auslöser**: [Verschluss anfordern] oder [Sperrzeit setzen]
**Inhalt**:
- Optionales Nachrichtenfeld (Textarea)
- Optionaler Frist-Auswähler (datetime-local)
- Umschalter (nur bei Sperrzeit): Dauer vs. festes Enddatum
- [Senden]-Button
**Aktion**: POST /api/admin/verschlussanforderung

---

## AUTH-SEITEN

### /login

**Route**: `/login` | **Theme**: hell (minimales Layout, keine Navigation)

**Hauptinhalt:**
- Logo / App-Name
- Benutzername-Feld
- Passwort-Feld (mit Anzeige-Toggle)
- [Anmelden]-Button
- Link "Passwort vergessen?" → /forgot-password
- Error-Anzeige bei falschen Credentials

**Redirect nach Login:**
- Benutzer → /dashboard
- Admin → /admin

---

### /forgot-password

**Route**: `/forgot-password` | **Theme**: hell (minimales Layout)

**Hauptinhalt:**
- E-Mail-Feld
- [Link anfordern]-Button → POST /api/auth/forgot-password
- Bestätigungsmeldung nach Absenden

---

### /reset-password

**Route**: `/reset-password?token=[TOKEN]` | **Theme**: hell (minimales Layout)

**Hauptinhalt:**
- Neues Passwort + Bestätigung
- [Passwort zurücksetzen]-Button → POST /api/auth/reset-password
- Token wird validiert (abgelaufen nach 1h)
- Erfolgs- oder Fehler-Zustand

---

## SEITENSTATUS-ZUSAMMENFASSUNG

| Seite | Implementiert | Redesign-Änderungen ausstehend |
|---|---|---|
| /login | ✓ | Minimales Layout trennen |
| /forgot-password | ✓ | — |
| /reset-password | ✓ | — |
| /dashboard | ✓ | FAB, Avatar-Menü, neue Nav-Struktur |
| /dashboard/new | ✓ | FAB-Integration verbessern |
| /dashboard/new/verschluss | ✓ | — |
| /dashboard/new/oeffnen | ✓ | — |
| /dashboard/new/pruefung | ✓ | — |
| /dashboard/new/orgasmus | ✓ | — |
| /dashboard/edit/[id] | ✓ | — |
| /dashboard/stats | ✓ | — |
| /dashboard/settings | ✓ | Zugang via Avatar-Menü |
| /dashboard/changelog | Teilweise | Inhalt definieren |
| /admin | ✓ | Dunkles Theme, Handlungsbedarf-Leiste, Kartenstruktur |
| /admin/users/new | ✓ | Dunkles Theme |
| /admin/users/[id] | ✓ (Tabs) | → Section-Page (kein Tab-System) |
| /admin/users/[id]/stats | ✓ | Context Bar, dunkles Theme |
| /admin/users/[id]/vorgaben | ✓ | Context Bar, dunkles Theme |
| /admin/users/[id]/kontrollen | ✓ | Context Bar, dunkles Theme |
| /admin/kontrollen | ✓ | Dunkles Theme |
| /admin/settings | ✗ (neu) | Implementierung ausstehend |
| Admin Context Bar | ✗ (neu) | Implementierung ausstehend |
| Avatar-Menü | ✗ (neu) | Implementierung ausstehend |
| Route Groups (user)/(admin)/(auth) | ✗ (neu) | Architektur-Refactor ausstehend |
| CSS Custom Properties / Theme-System | ✗ (neu) | globals.css Refactor ausstehend |
