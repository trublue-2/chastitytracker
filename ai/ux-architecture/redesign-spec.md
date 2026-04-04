# ChastityTracker — UX-Architektur & Redesign-Spezifikation

**Autor**: ArchitectUX
**Datum**: 2026-03-27
**Status**: Spezifikation v2.0 — 3 Erweiterungen eingearbeitet (Navigation, Datenmodell)
**Ziel**: Next.js 16, App Router, Tailwind CSS v4, mobile-first

---

## 0. Designprinzipien

Diese fünf Prinzipien leiten jede Entscheidung in dieser Spezifikation.

1. **Rollenidentität durch visuelle Sprache** — Benutzer und Admin müssen das Gefühl haben, verschiedene Apps zu nutzen, die gemeinsame Daten teilen — nicht dieselbe App mit einem Umschalter. Helles Theme für den Benutzer, dunkles Theme für den Admin.
2. **Primäraktion in einem Tippen** — das Erfassen eines neuen Eintrags (die häufigste Aktion des Benutzers) muss ohne Menü von jedem Bildschirm aus erreichbar sein.
3. **Dauerhafter Kontext des betreuten Benutzers** — sobald der Admin einen Benutzer auswählt, bleibt diese Auswahl über die gesamte Admin-Navigation erhalten, bis sie ausdrücklich geändert wird. Kein erneutes Auswählen nach jedem Tab-Wechsel.
4. **Dringlichkeit ist sofort sichtbar** — ausstehende Prüfungsanforderungen und Nicht-Konformitätsindikatoren müssen sichtbar sein, ohne dass der Benutzer oder Admin irgendwo navigieren muss.
5. **Mobile-first, dann Desktop** — alle Layout-Entscheidungen beginnen bei 375px und skalieren nach oben. Desktop ist eine Erweiterung, nicht das primäre Ziel.

---

## 1. Routen- / Seitenstruktur

### 1.1 Aktuell vs. Vorgeschlagen

```
AKTUELL                                VORGESCHLAGEN
───────────────────────────────────    ────────────────────────────────────────
/login                                 /login
/forgot-password                       /forgot-password
/reset-password                        /reset-password
/info/[lang]                           /info/[lang]

/dashboard                             /dashboard
/dashboard/new                         /dashboard/new        (kombinierter Aktions-Hub)
/dashboard/new/verschluss              /dashboard/new/verschluss
/dashboard/new/oeffnen                 /dashboard/new/oeffnen
/dashboard/new/pruefung                /dashboard/new/pruefung
/dashboard/new/orgasmus                /dashboard/new/orgasmus
/dashboard/stats                       /dashboard/stats
/dashboard/edit/[id]                   /dashboard/edit/[id]
/dashboard/settings                    /dashboard/settings
/dashboard/changelog                   /dashboard/changelog

/admin                                 /admin                (Benutzerliste / Startseite)
/admin/users                           — entfernt (in /admin zusammengeführt)
/admin/users/new                       /admin/users/new
/admin/users/[id]                      /admin/users/[id]     (Section-Page — scrollbar, kein Tab-System)
/admin/users/[id]/stats                /admin/users/[id]/stats
/admin/users/[id]/vorgaben             /admin/users/[id]/vorgaben
/admin/users/[id]/kontrollen           /admin/users/[id]/kontrollen
/admin/kontrollen                      /admin/kontrollen     (globaler Prüfungs-Feed)
                                       /admin/settings       (NEU — Admin-Kontoeinstellungen)
```

**Wesentliche Strukturänderungen:**
- Die `/admin/users`-Liste wird in `/admin` zusammengeführt — eine Navigationsebene weniger.
- `/admin/kontrollen` bleibt als globaler Feed aller Prüfungen für alle Benutzer erhalten.
- `/admin/settings` wird hinzugefügt, damit der Admin eine eigene Einstellungsseite hat (derzeit fehlend).
- `/admin/users/[id]` wird als scrollbare Section-Page implementiert (kein Tab-System). Subpages (`stats`, `vorgaben`, `kontrollen`) bleiben als eigenständige Routen erhalten und sind über Links aus der Section-Page erreichbar.

---

## 2. Informationsarchitektur je Rolle

### 2.1 Benutzer-IA

```
BENUTZER-BEREICH  (helles Theme, bg-white / bg-gray-50)
│
├── Dashboard  /dashboard
│   ├── Sperrstatus-Banner  (VERSCHLOSSEN / OFFEN / noch nie gesperrt)
│   ├── Aktive-Session-Karte  (Live-Timer, kompakte Konformitätsbalken)
│   ├── Prüfungsalarm ausstehend  (orange — höchste Dringlichkeit; wird nach oben geschoben)
│   ├── Ausstehende Verschlussanforderung  (indigofarbenes Banner)
│   ├── Sperrzeit-Banner  (rose — nur wenn nicht gesperrt)
│   ├── Quick-Action FAB  (floating action button — primärer CTA)
│   ├── Trainingsziel-Mini-Karte  (Tag/Woche/Monat-Fortschrittsbalken)
│   └── Liste der letzten Sessions  (letzte 5–10, erweiterbar)
│
├── Eintrag erfassen  /dashboard/new
│   ├── Kontextabhängiges Aktionsraster:
│   │   ├── Wenn geöffnet → VERSCHLUSS (primär, volle Breite, grün)
│   │   ├── Wenn gesperrt → OEFFNEN (primär, volle Breite, dunkel)
│   │   ├── PRUEFUNG  (immer verfügbar, orange)
│   │   └── ORGASMUS  (immer verfügbar, rose)
│   └── Unterseiten: /verschluss  /oeffnen  /pruefung  /orgasmus
│
├── Statistiken  /dashboard/stats
│   ├── Kalenderansicht
│   ├── Monatsübersicht
│   └── Trainingsziel-Verlauf
│
└── Einstellungen  /dashboard/settings
    ├── Passwort ändern
    ├── E-Mail ändern
    └── App-Info / Changelog-Link
```

### 2.2 Admin-IA

```
ADMIN-BEREICH  (dunkles Theme, bg-zinc-950 / bg-zinc-900)
│
├── Benutzerliste  /admin                     ← STARTSEITE nach Login
│   ├── Zusammenfassungskopf: X Benutzer, Y gesperrt, Z Alarme
│   ├── Alarmleiste: Benutzer, die Aufmerksamkeit benötigen (überfällige Prüfungen, Sperrverstöße)
│   ├── Benutzerkartenraster
│   │   ├── Sperrstatus-Indikator (gesperrt / geöffnet / unbekannt)
│   │   ├── Aktive Alarme-Badge
│   │   └── Schnellauswahl → aktiviert Benutzerkontext
│   └── [+ Neuer Benutzer]-Aktion
│
├── BENUTZERKONTEXT  /admin/users/[id]/*     ← dauerhaft nach Auswahl
│   ├── Kontextkopfleiste: "Angezeigt: [Benutzername]" + Benutzer-wechseln-Schaltfläche
│   │
│   ├── Section-Page  /admin/users/[id]      (scrollbare Einzelseite, keine Tabs)
│   │   ├── Status-Card (Verschlossen/Offen + Live-Timer)
│   │   ├── Schnellaktionen (Prüfung anfordern / Verschluss anfordern / Sperrzeit)
│   │   ├── Aktive Trainingsvorgabe (kompakt)
│   │   ├── Compliance-Übersicht (Tag/Woche/Monat Bars)
│   │   ├── Ausstehende Kontrolle (nur wenn vorhanden — prominent)
│   │   ├── Letzte Einträge (letzten 10, mit Link zu Vollansicht)
│   │   └── Links zu Subpages: [→ Stats] [→ Alle Vorgaben] [→ Kontrollen-History]
│   │
│   ├── Statistiken  /admin/users/[id]/stats
│   │   ├── Kalender-Heatmap
│   │   ├── Monatsübersicht
│   │   └── Trainingsziel-Konformitätsdiagramm
│   │
│   ├── Trainingsvorgaben  /admin/users/[id]/vorgaben
│   │   ├── Aktives Ziel (hervorgehoben)
│   │   ├── Zielverlauf
│   │   └── [Neue Vorgabe]-Formular (inline oder modal)
│   │
│   └── Kontrollen  /admin/users/[id]/kontrollen
│       ├── Ausstehende Prüfung (falls vorhanden) — prominente Karte oben
│       ├── Vergangene Prüfungen (Zeitleiste)
│       └── [Prüfung anfordern]-Schaltfläche
│
├── Globaler Prüfungs-Feed  /admin/kontrollen
│   ├── Alle ausstehenden Prüfungen für alle Benutzer
│   ├── Alle aktuellen Prüfungsergebnisse
│   └── Manuell bestätigen / ablehnen Aktionen
│
└── Admin-Einstellungen  /admin/settings
    ├── Passwort ändern
    └── E-Mail ändern
```

---

## 3. Admin-Benutzerauswahlprozess

### 3.1 Ablaufdiagramm

```
Admin meldet sich an
      │
      ▼
/admin  (Benutzerliste)
  ┌─────────────────────────────────┐
  │  [Benutzerkarte: alice]  LOCKED ●   │  ← Tippen auf Karte = Auswahl
  │  [Benutzerkarte: bob]    OPEN   ○   │
  │  [Benutzerkarte: carol]  LOCKED ●  ⚠│  ← ⚠ = hat Alarm
  └─────────────────────────────────┘
      │  Tippen auf "alice"-Karte
      ▼
/admin/users/[alice-id]   (Benutzerkontext aktiviert)
  ┌─────────────────────────────────────────┐
  │  ◀ Benutzer   [alice]   ↕ Benutzer wechseln      │  ← Kontextleiste
  ├─────────────────────────────────────────┤
  │  [scrollbare Section-Page — keine Tabs]          │
  └─────────────────────────────────────────┘
      │  Section-Page hält Kontext (alice bleibt ausgewählt)
      │  "Benutzer wechseln" → aufgleitende bottom sheet oder zurück zu /admin
      │
      ▼
Admin tippt "Benutzer wechseln" oder Zurück-Pfeil
      │
      ▼
/admin  (Benutzerliste — alice-Karte als "zuletzt angesehen" hervorgehoben)
```

### 3.2 Dauerhafte Kontextleiste

Wenn eine `/admin/users/[id]/*`-Route aktiv ist, erscheint eine fixierte Kontextleiste unterhalb der Admin-Hauptnavigationsleiste. Sie ist innerhalb des Benutzerkontexts immer sichtbar.

```
┌─────────────────────────────────────────────────────┐
│  ◀  Alle Benutzer     alice          [Benutzer wechseln ↕]    │
│                       LOCKED · 14h 23m                  │
└─────────────────────────────────────────────────────┘
```

- Links: Zurück-Pfeil zu `/admin`
- Mitte: Benutzername + aktueller Sperrstatus in Echtzeit
- Rechts: Schaltfläche "Benutzer wechseln" — öffnet eine bottom sheet mit der vollständigen Benutzerliste, sodass der Admin wechseln kann, ohne zu `/admin` zurückzukehren

Die Höhe der Kontextleiste beträgt 52px auf mobilen Geräten, 44px auf dem Desktop. Sie stapelt sich unterhalb der Hauptnavigationsleiste.

### 3.3 Leerer Zustand der Admin-Startseite

Wenn noch keine Benutzer vorhanden sind:
```
┌─────────────────────────────────┐
│       Noch keine Benutzer       │
│                                 │
│  Lege den ersten Benutzer an,   │
│  um mit der Betreuung zu        │
│  beginnen.                      │
│                                 │
│       [ + Benutzer anlegen ]    │
└─────────────────────────────────┘
```

---

## 4. Benutzer-Dashboard-UX

### 4.1 Bildschirmlayout (375px mobil)

```
┌─────────────────────────────┐
│  HEADER (56px)               │  Benutzername + Theme-Indikator
├─────────────────────────────┤
│                             │
│  [STATUSKARTE]              │  48px hoch im Ruhezustand, expandiert auf ~200px wenn gesperrt
│  VERSCHLOSSEN · 14h 23m 11s │  (Live-Timer via Client-Komponente)
│  ████████░░  58% heute      │
│  ██████████  91% Woche      │
│  ████████░░  63% Monat      │
│                             │
│  [PRÜFUNGSALARM]            │  orange Karte — nur bei ausstehender Prüfung
│  Prüfung erforderlich       │  großes Tippziel → /dashboard/new/pruefung?code=...
│  Code: 47291  Frist: 2h 15m │
│  [Jetzt einreichen →]       │
│                             │
│  [VERSCHLUSSANFORDERUNGS-BANNER]  │  indigo — nur bei ausstehender ANFORDERUNG
│                             │
│  [TRAININGSZIEL-KARTE]      │  wird angezeigt, wenn aktive Vorgabe vorhanden
│                             │
│  [LETZTE SESSIONS]          │  letzte 5 Sessions, jede erweiterbar
│  Session #12 · Fr 14:30     │
│  Session #11 · Do 09:15     │
│  ...                        │
│                             │
│  [Mehr laden]               │
│                             │
├─────────────────────────────┤
│  BOTTOM NAV (64px)          │  4 Tabs
└─────────────────────────────┘

FAB: fixiert unten rechts, oberhalb der bottom nav
     ╔═══╗
     ║ + ║  (56px Kreis, bg-gray-900, weißes Icon)
     ╚═══╝
```

### 4.2 FAB-Verhalten

Der FAB ist der primäre Einstiegspunkt zum Erfassen. Sein Icon und seine Farbe ändern sich je nach aktuellem Zustand:

| Zustand | FAB-Icon | FAB-Farbe | Ziel beim Tippen |
|---|---|---|---|
| Aktuell geöffnet | Schloss-Icon | Grün (emerald-600) | /dashboard/new/verschluss |
| Aktuell gesperrt | Entsperren-Icon | Dunkel (gray-900) | /dashboard/new/oeffnen |
| Prüfung ausstehend | ClipboardList (pulsierend) | Orange (orange-500) | /dashboard/new/pruefung?code=... |

Der FAB ermöglicht die wichtigste Aktion mit einem einzigen Tippen vom Dashboard aus. Die `/dashboard/new`-Hub-Seite bleibt für sekundäre Aktionen (Prüfung, Orgasmus) erhalten.

### 4.3 Anatomie der Statuskarte

**Wenn gesperrt (aktive Session):**
```
┌──────────────────────────────────┐
│ ● VERSCHLOSSEN                   │  grüner Punkt, fett
│ seit 14h 23m 11s                 │  läuft live aufwärts
│ ───────────────────────────────  │
│ Heute    ████████░░  58% / 8h    │
│ Woche    ██████████  91% / 56h   │
│ Monat    ████████░░  63% / 200h  │
│ ───────────────────────────────  │
│ Sperrzeit bis 25.03 18:00        │  nur bei aktiver Sperrzeit
└──────────────────────────────────┘
```

**Wenn geöffnet:**
```
┌──────────────────────────────────┐
│ ○ OFFEN                          │  grauer Punkt
│ seit 2h 15m                      │
└──────────────────────────────────┘
```

**Noch nie erfasst:**
```
┌──────────────────────────────────┐
│  Noch keine Einträge             │
│  Starte deine erste Session      │
│  [Jetzt verschliessen →]         │
└──────────────────────────────────┘
```

### 4.4 Trainingsziel-Fortschrittsbalken

Wird sowohl in der Statuskarte (kompakt) als auch auf der Statistikseite (vollständig) verwendet. Design-Spezifikation:

```
Heute    ████████░░░  58%   Ziel: 8h/Tag
         [tatsächlich: 4.6h]
```

- Balken füllt sich von links nach rechts
- Farbe: grün wenn >= 100%, gelb-orange wenn >= 66%, rot wenn < 66%
- Wenn aktuell gesperrt, animiert der Balken (Schimmer/Pulsieren) um anzuzeigen, dass er noch wächst
- Keine Prozentbeschriftung in der kompakten Variante (Dashboard) — nur auf der Statistikseite

---

## 5. Admin-Dashboard-UX (Ansicht pro Benutzer)

### 5.1 Bildschirmlayout (375px mobil, dunkles Theme)

```
┌─────────────────────────────┐
│  ADMIN NAV BAR (56px dunkel)  │
├─────────────────────────────┤
│  CONTEXT BAR (52px dunkel)    │  "alice  ·  LOCKED 14h"  [Wechseln]
├─────────────────────────────┤
│  [STATUSKARTE]              │  Status-Card (Verschlossen/Offen + Live-Timer)
├─────────────────────────────┤
│                             │
│  [SCHNELLAKTIONEN]          │  Prüfung anfordern / Verschluss anfordern / Sperrzeit
│  [Prüfung anfordern]        │  destruktiv-primär (orange) — deaktiviert wenn geöffnet
│  [Verschluss anfordern]     │  sekundär (indigo) — deaktiviert wenn gesperrt oder ausstehend
│  [Sperrzeit setzen]         │  sekundär (rose)
│  [Sperrzeit aufheben]       │  nur angezeigt bei aktiver Sperrzeit
│                             │
│  [AKTIVE TRAININGSVORGABE]  │  kompakte Karte, falls vorhanden
│                             │
│  [COMPLIANCE-ÜBERSICHT]     │  Tag/Woche/Monat Bars
│                             │
│  [AUSSTEHENDE KONTROLLE]    │  prominent — nur wenn vorhanden
│                             │
│  [LETZTE EINTRÄGE]          │  letzten 10, mit [→ Kontrollen-History] Link
│                             │
│  [→ Stats] [→ Alle Vorgaben] [→ Kontrollen-History]   (Subpage-Links)
│                             │
├─────────────────────────────┤
│  BOTTOM NAV (64px dunkel)   │  3 Tabs (siehe Abschnitt 6)
└─────────────────────────────┘
```

Die User-Detail-Seite (`/admin/users/[id]`) wird als **scrollbare Section-Page** implementiert statt als Tab-System. Alle Sektionen sind als Cards auf einer Seite sichtbar und scrollen vertikal:

1. Status-Card (Verschlossen/Offen + Live-Timer)
2. Schnellaktionen (Prüfung anfordern / Verschluss anfordern / Sperrzeit)
3. Aktive Trainingsvorgabe (kompakt)
4. Compliance-Übersicht (Tag/Woche/Monat Bars)
5. Ausstehende Kontrolle (nur wenn vorhanden — prominent)
6. Letzte Einträge (letzten 10, mit Link zu Vollansicht)

Für detailliertere Ansichten (alle Vorgaben verwalten, Kontrollen-History, Stats-Kalender) navigiert man via [→ Alle Vorgaben] / [→ Kontrollen-History] / [→ Stats] Links aus der Section-Page heraus. Diese Subpages existieren weiterhin als eigenständige Routen:
- `/admin/users/[id]/stats`
- `/admin/users/[id]/vorgaben`
- `/admin/users/[id]/kontrollen`

**Warum:** Ein Tab-System auf Ebene 2 (unter Bottom Nav) skaliert nicht über 4-5 Tabs hinaus. Die Section-Page skaliert auf beliebig viele zukünftige Features ohne Umbau.

### 5.2 Quick-Actions-Panel

Das Quick-Actions-Panel ist eine dauerhafte Card auf der Section-Page. Aktionen werden je nach Zustand bedingt angezeigt und deaktiviert:

```
SCHNELLAKTIONEN
─────────────────────────────────────────
[Prüfung anfordern]    → nur aktiviert wenn Benutzer GESPERRT ist
[Verschluss anfordern] → aktiviert wenn OFFEN und keine ausstehende ANFORDERUNG
[Sperrzeit setzen]     → immer verfügbar (erstellt neue Sperrzeit)
[Sperrzeit aufheben]   → nur angezeigt wenn aktive Sperrzeit vorhanden

Zustand: Benutzer ist aktuell OFFEN mit ausstehender ANFORDERUNG
→ [Verschluss anfordern] ist deaktiviert + zeigt Tooltip: "Anforderung läuft noch"
→ [Anforderung zurückziehen] ersetzt sie
```

### 5.3 Admin-Benutzerlistenkarten

Jede Benutzerkarte auf `/admin` vermittelt maximale Informationen auf einen Blick:

```
┌──────────────────────────────────────┐
│ alice                    LOCKED ●    │
│ VERSCHLOSSEN · 14h 23m              │
│ ─────────────────────────────────── │
│ ⚠ Prüfung angefordert · Frist 1h   │  orange — nur bei ausstehender Kontrolle
│ ─────────────────────────────────── │
│ Einschlüsse: 47   Vorgabe: aktiv ✓  │
└──────────────────────────────────────┘
```

Farbcodierung für den Sperrstatus-Indikatorpunkt:
- Grün (emerald): GESPERRT
- Grau: GEÖFFNET (hat frühere Einträge)
- Zinc-600: noch keine Einträge

---

## 6. Navigationsstruktur

### 6.1 Benutzer-bottom nav (3 Tabs + FAB)

```
┌──────┬──────┬──────┬──────┐
│  ⌂   │  ▣   │  +   │  ░░  │
│ Start│Stat. │ FAB  │(frei)│
└──────┴──────┴──────┴──────┘
```

| Tab | Icon | Route | Aktiv wenn |
|---|---|---|---|
| Start | LayoutDashboard | /dashboard | exakte Übereinstimmung |
| Statistiken | BarChart2 | /dashboard/stats | startsWith |
| [freier Slot für zukünftige Features] | — | — | — |

Der FAB (`+`) ist kein Nav-Tab, sondern ein floating action button oberhalb der bottom nav (siehe Abschnitt 4.2).

Einstellungen werden über das Avatar-Menü im Header erreichbar (Tap auf Avatar-Circle → Popover/Sheet mit Einstellungen + Abmelden). Dies gibt beiden Navs dauerhaft einen freien Slot für zukünftige Feature-Tabs.

Begründung für das Entfernen des Admin-Tabs aus der Benutzer-bottom nav: Benutzer mit Admin-Rolle greifen über ihren eigenen `/admin`-Bereich auf die Administration zu. Wenn dieselbe Person sowohl Admin als auch Benutzer ist (ein Produktrandalfall, technisch jedoch möglich), kann sie nach dem Login basierend auf der Rolle weitergeleitet werden. Die bottom nav bedient die aktuell aktive Rolle der Sitzung.

Wenn ein Admin sein eigenes `/dashboard` aufruft, zeigt die bottom nav die 3 Benutzer-Tabs; Einstellungen sind über das Header-Avatar-Menü erreichbar.

### 6.2 Admin-Navigation

**Bottom Nav (3 Tabs auf mobilen Geräten):**

```
┌─────────┬─────────┬─────────┬─────────┐
│   ◫     │   ⊞     │   ▣     │   ░░    │
│Benutzer │  Feed   │  Stats  │ (frei)  │
└─────────┴─────────┴─────────┴─────────┘
```

| Tab | Icon | Route | Aktiv wenn |
|---|---|---|---|
| Benutzer | Users2 | /admin | startsWith("/admin"), aber nicht kontrollen/stats |
| Kontrollen | Activity | /admin/kontrollen | startsWith |
| Stats | BarChart2 | /admin/stats | startsWith |
| [freier Slot für zukünftige Features] | — | — | — |

Einstellungen werden über das Avatar-Menü im Header erreichbar (Tap auf Avatar-Circle → Popover/Sheet mit Einstellungen + Abmelden). Dies gibt beiden Navs dauerhaft einen freien Slot für zukünftige Feature-Tabs.

**Desktop sidebar (Admin, dunkel):**

```
┌────────────────┐
│ ADMIN PANEL    │
│ ─────────────  │
│ ◫  Benutzer    │  ← zeigt immer Badge mit aktueller Benutzeranzahl
│ ──────────── ← Benutzerkontext-Abschnitt, wenn Benutzer ausgewählt
│   alice        │  ← Benutzername mit Statuspunkt
│   Übersicht    │
│   Statistiken  │
│   Vorgaben     │
│   Kontrollen   │
│ ──────────────  │
│ ⊞  Feed        │
│ ⚙  Einstellungen │
│ ──────────────  │
│ → Abmelden     │
└────────────────┘
```

Die Desktop sidebar im Admin-Kontext zeigt die Unternavigation des ausgewählten Benutzers direkt inline und macht eine separate tab bar auf dem Desktop überflüssig.

### 6.3 Keine gemeinsamen Layout-Komponenten

Das Benutzer-layout und das Admin-layout müssen vollständig getrennte Next.js-Layouts sein:

```
src/app/
├── (user)/              ← neue route group
│   ├── layout.tsx       ← helles Theme, Benutzer-BottomNav, Benutzer-DesktopSidebar
│   └── dashboard/
│       └── ...
├── (admin)/             ← neue route group
│   ├── layout.tsx       ← dunkles Theme, Admin-BottomNav, Admin-DesktopSidebar
│   └── admin/
│       └── ...
└── (auth)/              ← login, forgot-password usw.
    ├── layout.tsx        ← minimales layout, keine Navigation
    └── login/
        └── ...
```

Diese route group-Struktur stellt sicher, dass Themes und Navigation nicht zwischen den Rollen vermischt werden. Das aktuelle einzelne `layout.tsx` mit bedingter `isAdmin`-Logik sollte aufgeteilt werden.

---

## 7. Kritische Interaktionsspezifikationen

### 7.1 Prüfungsanforderungs-Ablauf

```
ADMIN-SEITE                          BENUTZER-SEITE
─────────────────                    ─────────────────
Admin öffnet /admin/users/[id]
Admin tippt [Prüfung anfordern]
  → Bestätigungs-modal:
    "Code: 47291  Frist: 4 Stunden"
    [Senden]
Admin bestätigt
  → POST /api/admin/kontrolle
  → Code wird per E-Mail gesendet
  → KontrollAnforderung erstellt
                                     Benutzer öffnet App
                                     → Dashboard zeigt:
                                       ┌──────────────────────────┐
                                       │ ⚠ PRÜFUNG ERFORDERLICH   │
                                       │ Code: 47291              │
                                       │ Frist: 3h 42m            │
                                       │ [Jetzt einreichen →]     │
                                       └──────────────────────────┘
                                     Benutzer tippt [Jetzt einreichen]
                                     → /dashboard/new/pruefung?code=47291
                                     Benutzer macht/lädt Foto hoch
                                     → Claude Vision erkennt Code im Foto
                                     → Eintrag erstellt, KontrollAnforderung
                                       fulfilledAt aktualisiert

Admin lädt /admin/users/[id]/kontrollen neu
  → Prüfungskarte zeigt:
    Code: 47291 · Eingereicht ✓
    Foto-Vorschau
    KI-Verifizierung: ÜBEREINSTIMMUNG / KEINE_ÜBEREINSTIMMUNG
    [Manuell bestätigen] [Ablehnen]
```

**Dringlichkeitsstufen für den Benutzer:**
- Ausstehend, > 2h verbleibend: oranges Banner, normales Gewicht
- Ausstehend, < 2h verbleibend: oranges Banner, fett + pulsierender Rahmen
- Überfällig (Frist abgelaufen): rotes Banner, kann nicht mehr eingereicht werden (zeigt "Frist abgelaufen")

### 7.2 Verschlussanforderungs-Ablauf

```
ADMIN: tippt [Verschluss anfordern]
  → sheet/modal mit:
    - Optionales Nachrichtenfeld (Textarea)
    - Optionaler Frist-Auswähler (datetime-local)
    - [Anforderung senden]-Schaltfläche

ADMIN: tippt alternativ [Sperrzeit setzen]
  → selbe sheet, enthält jedoch:
    - Umschalter Dauer vs. festes Endzeitpunkt
    - Der Unterschied: ANFORDERUNG = Benutzer muss bald verschließen;
      SPERRZEIT = Benutzer muss bis [Zeitpunkt] gesperrt bleiben

BENUTZER: sieht beim nächsten Dashboard-Laden:
  ┌──────────────────────────────────┐
  │ 🔒 Verschluss angefordert        │  indigo (ANFORDERUNG)
  │ "Bitte sofort verschliessen"     │
  │ Bis: 25.03 20:00                 │
  └──────────────────────────────────┘

  ODER:
  ┌──────────────────────────────────┐
  │ 🔒 Gesperrt bis 26.03 08:00      │  rose (SPERRZEIT)
  │ "Keine Genehmigung zum Öffnen"   │
  └──────────────────────────────────┘
```

Wenn der Benutzer aktuell gesperrt ist und eine SPERRZEIT aktiv wird, zeigt die aktive Session-Karte die Sperrzeit direkt an (bereits implementiert, dieses Verhalten beibehalten).

### 7.3 Visualisierung der Trainingsziel-Konformität

Zwei Varianten: kompakt (Dashboard/Admin-Übersicht) und vollständig (Statistikseite).

**Kompakte Variante — 3 Zeilen, verwendet in der aktiven Session-Karte und Admin-Übersicht:**
```
Heute    ████████░░  58%
Woche    ██████████  91%
Monat    ████████░░  63%
```
- Fortschrittsbalken: 100% Breite des Containers
- Farbschwellenwerte: < 50% rot, 50–79% gelb-orange, >= 80% grün, >= 100% green-600 (gesättigt)
- Zahlen: nur Prozentsatz (keine Stundenwerte) in der kompakten Variante
- Wenn keine Vorgabe aktiv ist: Abschnitt wird ausgeblendet

**Vollständige Variante — Statistikseite, Admin-Statistik-Tab:**
```
Trainingsziel  (01.02.2026 – offen)
────────────────────────────────────
Täglich    ████████░░  58%   4.6h / 8h    △ -3.4h
Wöchentlich ██████████  91%  38h / 42h    ✓ +0h Ziel erreicht
Monatlich  ████████░░  63%  126h / 200h  △ -74h verbleibend
```
- Zeigt tatsächliche Stunden vs. Zielstunden
- Deltaspalte gibt an, wie weit das Ziel verfehlt wird (oder Überschuss)
- Farbcodierung entspricht der kompakten Variante

**Admin-Konformitätsübersicht auf Benutzerlistenkarte (minimal):**
```
Vorgabe: aktiv  ✓ konform  (grün)
Vorgabe: aktiv  △ nicht konform  (gelb-orange)
Vorgabe: aktiv  ✗ überfällig  (rot)
Vorgabe: keine
```

---

## 8. Benachrichtigungen / Alarme

### 8.1 Benutzer-Alarm-Hierarchie (nach Priorität von oben nach unten)

| Priorität | Bedingung | Komponente | Position |
|---|---|---|---|
| 1 (höchste) | Ausstehende Prüfung, Frist < 1h | Rotes pulsierendes Banner | Dashboard, oben im Inhalt |
| 2 | Ausstehende Prüfung, Frist > 1h | Oranges Banner | Dashboard, oben im Inhalt |
| 3 | Verschlussanforderung (ANFORDERUNG) ausstehend | Indigofarbenes Banner | Dashboard, unterhalb Status |
| 4 | Sperrzeit aktiv (und Benutzer ist geöffnet) | Rosefarbenes Banner | Dashboard, unterhalb Status |
| 5 | Trainingsziel nicht erfüllt | Gelb-orangener Abschnitt in Statuskarte | Dashboard, in Statuskarte |

Alle Alarme oberhalb Priorität 3 wirken sich auch auf den FAB aus — der FAB ändert sich, um die dringendste erforderliche Aktion widerzuspiegeln.

**FAB-Zustand bei ausstehender Prüfung:**
- Icon: ClipboardList (pulsierende Animation)
- Farbe: orange-500
- Tippen: geht direkt zum Prüfungsformular, vorausgefüllt mit dem ausstehenden Code

### 8.2 Admin-Alarm-Hierarchie

| Priorität | Bedingung | Wo es erscheint |
|---|---|---|
| 1 | Benutzer hat überfällige Prüfung | Rotes Badge auf Benutzerkarte, Alarmleiste oben auf /admin |
| 2 | Benutzer hat eingereichte, ungeprüfte Prüfung | Oranges Badge auf Benutzerkarte |
| 3 | Benutzer ist nicht gesperrt, hat aber aktive SPERRZEIT | Rosefarbenes Badge auf Benutzerkarte |
| 4 | Benutzer hat ausstehende, noch nicht erfüllte ANFORDERUNG | Indigofarbenes Badge auf Benutzerkarte |
| 5 | Benutzer hat keine Trainingsvorgabe | Grauer Indikator (niedrige Priorität) |

**Alarmleiste oben auf `/admin`:**
```
┌────────────────────────────────────────────┐
│ ⚠ 1 Prüfung abgelaufen: alice             │  rot, tippbar → geht zur alice-Übersicht
│ ℹ 1 Prüfung ausstehend: carol             │  orange
└────────────────────────────────────────────┘
```
Leiste wird ausgeblendet, wenn keine Alarme vorhanden sind.

### 8.3 Echtzeit-Überlegungen

Die App ist SSR-first (Next.js App Router, kein WebSocket). Empfehlungen:
- Benutzer-Dashboard: der Live-Session-Timer (LaufendeSessionCard) ist bereits eine Client-Komponente mit Ticker — so beibehalten.
- Prüfungsfrist-Countdown: als Client-Komponente implementieren, die `deadline` als Prop entgegennimmt und herunterzählt. Bereits teilweise umgesetzt.
- Admin benötigt keine Live-Updates — Seitenaktualisierung bei der Navigation ist akzeptabel.
- Erwäge das Hinzufügen eines `revalidatePath`-Aufrufs nach wichtigen Mutationen (POST kontrolle, POST verschluss-anforderung), um sicherzustellen, dass der Admin beim Navigieren aktuelle Daten sieht.

---

## 9. Randfälle & Zustände

### 9.1 Benutzer aktuell nicht gesperrt (Admin-Perspektive)

In der Benutzerübersicht, wenn der Benutzer geöffnet ist:
- Statuskarte zeigt "OFFEN · seit [Zeitpunkt]" mit grauem Indikator
- Schaltfläche "Prüfung anfordern" ist **deaktiviert und ausgegraut** mit Tooltip: "Nur möglich wenn verschlossen"
- Schaltfläche "Verschluss anfordern" ist **aktiv und hervorgehoben**

Visuell: Der Hintergrund der Statuskarte wechselt zu zinc-800 (etwas heller als Seitenhintergrund) mit einem grauen linken Rand bei geöffnetem Zustand, im Gegensatz zu einem grünen linken Rand bei gesperrtem Zustand.

### 9.2 Überfällige Prüfung

**Benutzer-Perspektive:**
- Dashboard zeigt rotes Banner: "Prüfungsfrist abgelaufen" — keine Einreichen-Schaltfläche (Frist abgelaufen)
- FAB ist rot mit X-Icon; beim Tippen erscheint ein Toast: "Frist abgelaufen — wende dich an deinen Keyholder"

**Admin-Perspektive:**
- Benutzerkarte zeigt rotes Badge "Prüfung überfällig"
- Im Kontrollen-Tab: überfälliges Element hat roten Hintergrund, "ÜBERFÄLLIG"-Pill und zeigt [Manuell bestätigen] / [Zurückziehen] Aktionen

### 9.3 Admin hat keine Benutzer

Wie in Abschnitt 3.3 beschrieben — leerer Zustand mit ganzseitiger Illustration und einzigem CTA.

### 9.4 Erster-Login-Ablauf

**Neuer Benutzer (noch nie gesperrt):**
Dashboard zeigt Onboarding-Zustand anstelle einer leeren Sessionliste:
```
┌──────────────────────────────────┐
│  Willkommen, alice               │
│                                  │
│  Noch keine Sessions erfasst.    │
│  Tippe auf + um zu beginnen.     │
│                                  │
│  [Ersten Verschluss eintragen]   │
└──────────────────────────────────┘
```
Die Onboarding-Karte wird angezeigt, wenn `pairs.length === 0`, und ersetzt das Statusbanner.

**Neuer Admin (keine Benutzer angelegt):**
Siehe leerer Zustand in Abschnitt 3.3.

### 9.5 Mehrere ausstehende Prüfungen

Technisch erlaubt das Datenmodell mehrere KontrollAnforderungen. Die UX sollte nur die dringendste (nächste Frist) im Alarmschnitt anzeigen und die vollständige Liste im Kontrollen-Tab/Abschnitt zeigen.

### 9.6 Admin, der eigenes Benutzerkonto einsieht

Wenn ein Admin auch ein Benutzerkonto hat (Rolle = "admin", aber auch eigene Einträge), greift er über die Standard-`/dashboard`-Route auf seine Einträge zu. Die Benutzer-bottom nav bedient `/dashboard`. Die Admin-Navigation bedient `/admin`. Auf Navigationsebene ist keine Quervernetzung erforderlich — beide Bereiche sind nach dem Login über die jeweilige URL zugänglich.

---

## 10. CSS-Architektur & Theme-System

### 10.1 Design-Tokens

```css
/* src/app/globals.css — Bestehendes erweitern, Tokens hinzufügen */

:root {
  /* ─── Benutzer-Theme (hell) ─── */
  --color-bg: theme(colors.white);
  --color-bg-secondary: theme(colors.gray.50);
  --color-bg-card: theme(colors.white);
  --color-border: theme(colors.gray.100);
  --color-border-medium: theme(colors.gray.200);
  --color-text-primary: theme(colors.gray.900);
  --color-text-secondary: theme(colors.gray.500);
  --color-text-muted: theme(colors.gray.400);

  /* ─── Semantische Statusfarben ─── */
  --color-locked: theme(colors.emerald.600);       /* VERSCHLOSSEN */
  --color-locked-bg: theme(colors.emerald.50);
  --color-unlocked: theme(colors.gray.500);        /* OFFEN */
  --color-inspection: theme(colors.orange.500);    /* PRUEFUNG ausstehend */
  --color-inspection-bg: theme(colors.orange.50);
  --color-lock-req: theme(colors.indigo.600);      /* ANFORDERUNG */
  --color-lock-req-bg: theme(colors.indigo.50);
  --color-sperrzeit: theme(colors.rose.600);       /* SPERRZEIT */
  --color-sperrzeit-bg: theme(colors.rose.50);
  --color-warning: theme(colors.amber.500);        /* Konformitätswarnung */
  --color-danger: theme(colors.red.600);           /* überfällig */

  /* ─── Abstands-Skala (8-Punkt-Raster) ─── */
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */

  /* ─── Typografie ─── */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
}

/* Admin-Dunkel-Theme — angewendet via data-theme oder route group layout */
[data-theme="admin"],
.admin-shell {
  --color-bg: theme(colors.zinc.950);
  --color-bg-secondary: theme(colors.zinc.900);
  --color-bg-card: theme(colors.zinc.900);
  --color-border: theme(colors.zinc.800);
  --color-border-medium: theme(colors.zinc.700);
  --color-text-primary: theme(colors.zinc.100);
  --color-text-secondary: theme(colors.zinc.400);
  --color-text-muted: theme(colors.zinc.600);
}
```

### 10.2 Layout-Komponenten

**Seiten-Shells:**
- Benutzer-Shell: `bg-white` / `bg-gray-50`, Inhalts-Maximalbreite `max-w-2xl` mobile-first, zentriert
- Admin-Shell: `bg-zinc-950`, Inhalts-Maximalbreite `max-w-5xl`

**Karten-Komponente (Basis):**
```
Benutzerkarte: bg-white border border-gray-100 rounded-2xl
Admin-Karte: bg-zinc-900 border border-zinc-800 rounded-2xl
```

Beide verwenden denselben Eckenradius-Token (`rounded-2xl = 16px`), um eine visuelle Verwandtschaft zu erhalten, während die Farbpalette sie trennt.

**Status-Indikatorpunkt:**
```
● gesperrt    bg-emerald-500 w-2.5 h-2.5 rounded-full animate-pulse
○ geöffnet   bg-gray-400 w-2.5 h-2.5 rounded-full
```

### 10.3 Fortschrittsbalken-Komponente

```
<ProgressBar value={58} target={100} size="sm" | "md" variant="compliance" />

Props:
  value: number           (tatsächliche Stunden oder Prozentsatz)
  target: number          (Zielstunden oder 100)
  size: "sm" | "md"       sm = 4px Höhe, md = 8px Höhe
  variant: "compliance"   bestimmt die Farbschwellenwert-Logik
  animated: boolean       true wenn Session aktiv ist (Schimmer-Füllung)
```

Farblogik für die Konformitäts-Variante:
```
percentage >= 100  →  bg-emerald-500
percentage >= 80   →  bg-green-500
percentage >= 50   →  bg-amber-400
percentage < 50    →  bg-red-500
```

---

## 11. Komponenteninventar

### 11.1 Neue / geänderte Komponenten

| Komponente | Pfad | Zweck | Status |
|---|---|---|---|
| UserContextBar | admin/components/UserContextBar.tsx | Fixierte "Angezeigt: [Benutzer]"-Leiste mit Wechseln-Schaltfläche | NEU |
| AdminUserCard | admin/components/AdminUserCard.tsx | Benutzerkarte auf /admin-Liste mit allen Statusindikatoren | GEÄNDERT |
| AdminAlertStrip | admin/components/AdminAlertStrip.tsx | Alarm-Zusammenfassung oben auf Admin-Startseite | NEU |
| QuickActionsPanel | admin/components/QuickActionsPanel.tsx | Gruppierte Aktionsschaltflächen für Admin-Übersicht | NEU |
| DashboardFAB | dashboard/components/DashboardFAB.tsx | Kontextabhängiger floating action button | NEU |
| ProgressBar | components/ProgressBar.tsx | Wiederverwendbarer Konformitäts-Fortschrittsbalken | NEU |
| ComplianceMini | components/ComplianceMini.tsx | Kompakter 3-Zeilen-Konformitätsblock | NEU |
| StatusDot | components/StatusDot.tsx | Sperrstatus-Indikatorpunkt | NEU |
| SwitchUserSheet | admin/components/SwitchUserSheet.tsx | Bottom sheet zum Wechseln des betreuten Benutzers | NEU |
| OnboardingCard | dashboard/OnboardingCard.tsx | Erster-Verwendung-Leerzustand für Benutzer | NEU |
| AdminEmptyState | admin/components/AdminEmptyState.tsx | Leerzustand ohne Benutzer | NEU |
| InspectionAlert | dashboard/InspectionAlert.tsx | Dringlichkeitsbasiertes Banner für ausstehende Prüfung | GEÄNDERT aus KontrolleBanner |

### 11.2 Bestehende Komponenten, die beibehalten werden

| Komponente | Unverändert beibehalten | Hinweise |
|---|---|---|
| LaufendeSessionCard | Ja | Bereits gut strukturiert, ComplianceMini hinzufügen |
| StatusBanner | Ja | Minimale Änderung: Erster-Verwendung-Zustand hinzufügen |
| KontrolleBanner | Ändern | Dringlichkeitslogik in InspectionAlert zusammenführen |
| KontrolleItemListClient | Ja | Keine Änderungen erforderlich |
| OrgasmenListClient | Ja | Keine Änderungen erforderlich |
| SessionList | Ja | Keine Änderungen erforderlich |
| StatsMain | Ja | Von beiden Rollen verwendet |
| PhotoCapture | Ja | Keine Änderungen erforderlich |
| ImageViewer | Ja | Keine Änderungen erforderlich |
| InstallBanner | Ja | Unverändert beibehalten |
| VersionChecker | Ja | Unverändert beibehalten |

---

## 12. Implementierungsreihenfolge nach Priorität

### Phase 1 — route group-Umstrukturierung (Voraussetzung für Theming)
1. `src/app/(user)/` und `src/app/(admin)/` route groups erstellen
2. `dashboard/` in `(user)/` verschieben, `admin/` in `(admin)/`
3. layout.tsx in separate `(user)/layout.tsx` und `(admin)/layout.tsx` aufteilen
4. `data-theme="admin"` oder Klasse auf Admin-layout-body anwenden
5. Sicherstellen, dass alle bestehenden Routen weiterhin auflösen (keine Weiterleitungen nötig, Next.js route groups sind transparent)

### Phase 2 — Admin-Benutzerauswahl-UX
1. `UserContextBar`-Komponente erstellen
2. `UserContextBar` zu `(admin)/layout.tsx` hinzufügen — bedingt gerendert wenn Pfadname `/admin/users/[id]*` entspricht
3. `SwitchUserSheet`-Komponente erstellen
4. `/admin` (Startseite) als primäre Zielseite aktualisieren: Benutzerliste dort zusammenführen
5. `AdminAlertStrip` für Alarme oben auf der Seite erstellen

### Phase 3 — Benutzer-Dashboard-Verfeinerung
1. `DashboardFAB` mit kontextabhängigem Zustand erstellen
2. `ProgressBar`- und `ComplianceMini`-Komponenten erstellen
3. `ComplianceMini` in `LaufendeSessionCard` integrieren
4. `OnboardingCard` für Erster-Verwendung-Leerzustand erstellen
5. `InspectionAlert` mit Dringlichkeitszuständen aktualisieren

### Phase 4 — Admin-Dunkel-Theme
1. Dunkel-Token-Überschreibungen auf `(admin)/layout.tsx` anwenden
2. Alle admin-spezifischen Komponenten auf token-basierte Farben aktualisieren
3. `AdminUserCard` mit neuen Statusindikatoren aktualisieren
4. `QuickActionsPanel` erstellen

### Phase 5 — Navigationsverfeinerung
1. Separate `UserBottomNav` (4 Tabs, hell) und `AdminBottomNav` (3 Tabs, dunkel) erstellen
2. Separate `UserDesktopSidebar` (hell) und `AdminDesktopSidebar` (dunkel) erstellen
3. Admin-sidebar so verknüpfen, dass sie Benutzer-Unternavigation anzeigt, wenn ein Benutzer ausgewählt ist

---

## 13. Offene Fragen für den Product Owner

Diese Punkte erfordern eine Entscheidung vor der Umsetzung:

1. **Rollentrennung nach Login**: Wenn ein Benutzer die Rolle „admin" hat, landet er dann nach dem Login auf `/admin` oder `/dashboard`? Vorschlag: Admins landen immer auf `/admin`. Wenn sie auch eigene Einträge erfassen möchten, können sie zu `/dashboard` navigieren. Ist das akzeptabel?

2. **Admin erfasst eigene Einträge**: Kann ein Admin auch ein Benutzer sein (der eigene Sessions erfasst)? Derzeit ist das Rollenfeld ein einzelner Wert. Soll es so bleiben, oder sollen duale Rollen unterstützt werden? Dies beeinflusst, ob der Admin eine `/dashboard`-Verknüpfung in der Admin-Navigation benötigt.

3. **Live-Timer auf Admin-Seite**: Die Admin-Übersicht eines Benutzers zeigt derzeit einen Live-Timer (LaufendeSessionCard-Client-Komponente). Soll der Admin einen Live-Timer sehen, oder reicht ein statisches "seit X Stunden" aus? Live-Timer erhöhen das client-seitige JavaScript-Gewicht.

4. **Benutzer-Wechsel-Persistenz**: Soll der "aktuell betreute Benutzer" in einer serverseitigen Sitzung, im lokalen Zustand oder nur in der URL gespeichert werden? Nur URL (aktueller Ansatz) ist am einfachsten und am besten teilbar. Vorschlag: bei nur URL bleiben.

5. **Benachrichtigungszustellung**: Derzeit werden Prüfungen per E-Mail benachrichtigt. Soll es In-App-Push-Benachrichtigungen (PWA Push) für ausstehende Prüfungen geben? Dies ist ein separater Engineering-Aufwand, der in dieser Spezifikation nicht abgedeckt ist.

---

## 14. Datenmodell-Vorsorge: UserAdminRelationship

### Hintergrund

Das aktuelle Schema verwendet ein einfaches `role`-Feld (`user` | `admin`) auf dem `User`-Model. Admins haben implizit Zugriff auf alle User — es gibt keine explizite Admin→User-Beziehung in der Datenbank.

### Geplante Erweiterung: n:m-Beziehung

Zukünftig soll es möglich sein, dass:
- Ein User von mehreren Admins betreut wird
- Ein Admin nur einen Teil aller User betreut (nicht zwingend alle)

Dafür ist ein neues Prisma-Model vorzusehen:

```prisma
model UserAdminRelationship {
  id        String   @id @default(cuid())
  adminId   String
  admin     User     @relation('AdminRelations', fields: [adminId], references: [id], onDelete: Cascade)
  userId    String
  user      User     @relation('UserRelations', fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([adminId, userId])
  @@index([adminId])
  @@index([userId])
}
```

### Migrationsstrategie (Produktionssystem — kein Datenverlust)

Der Tracker ist bereits im Einsatz. Die Migration muss nicht-destruktiv sein:

**Schritt 1 — Additive Migration:**
```sql
-- Neue Tabelle anlegen (Breaking-Change-free)
-- Prisma Migration erstellt die Tabelle, bestehende Daten bleiben unberührt
```

**Schritt 2 — Seed-Script für Bestandsdaten:**
```typescript
// Alle bestehenden User × Admin-Kombinationen verknüpfen
const admins = await prisma.user.findMany({ where: { role: 'admin' } });
const users  = await prisma.user.findMany({ where: { role: 'user' } });

for (const admin of admins) {
  for (const user of users) {
    await prisma.userAdminRelationship.upsert({
      where: { adminId_userId: { adminId: admin.id, userId: user.id } },
      create: { adminId: admin.id, userId: user.id },
      update: {}
    });
  }
}
```

**Schritt 3 — Parallelbetrieb:**
Bestehende Code-Pfade (role-basiert) laufen weiter. Die neue Tabelle existiert parallel und wird schrittweise aktiviert — kein Big-Bang-Refactor.

### Timing

Diese Erweiterung wird **nicht** im aktuellen Redesign implementiert. Das Schema-Modell wird vorbereitet (Migration anlegen, Seed-Script bereitstellen), die Applikationslogik bleibt vorerst role-basiert. Aktivierung erfolgt wenn Multi-Admin-Betreuung tatsächlich benötigt wird.

---

**ArchitectUX**
Grundspezifikation vollständig — bereit für Phase-1-Umsetzung.
Entwickler-Übergabe: LuxuryDeveloper

---

## 15. Technische Entscheide (FE/BE koordiniert)

*Entscheide vom 2026-03-27 — verbindlich für die Umsetzung.*

### Frage 1 — Route Groups: ein PR oder getrennt?

**Entscheid: Zwei separate PRs — erst Route Groups, dann Logic Changes.**

Begründung: Filesystem-Umstrukturierung verändert alle Import-Pfade und ist damit risikoreich; sie muss separat reviewbar und im Fehlerfall isoliert rollback-fähig sein.

Reihenfolge:
1. PR A: Route Groups anlegen, Dateien verschieben, Import-Pfade korrigieren — keinerlei Logikänderungen.
2. PR B (nach Merge von A): alle Feature-Änderungen (FAB, Theming, Navigationskomponenten).

---

### Frage 2 — `/admin/settings` Scope

**Entscheid: Kein separates `/admin/settings`. Einstellungen (Passwort, E-Mail) sind ausschliesslich unter `/dashboard/settings` erreichbar.**

Befund: `src/app/dashboard/settings/page.tsx` rendert nur `<SettingsForm />` — rein user-bezogene Felder (Passwort, E-Mail). Es gibt keine admin-spezifischen Konfigurationsfelder, die eine eigene Admin-Settings-Route rechtfertigen würden. Admin-spezifische Optionen werden, falls sie entstehen, direkt auf der betreffenden Admin-Seite (z. B. `/admin`) eingebettet, nicht in einer eigenen Route.

Einstellungen bleiben über das Header-Avatar-Menü erreichbar (für beide Rollen verlinkt auf `/dashboard/settings`).

---

### Frage 3 — `lastSelectedUserId` Reset

**Entscheid: Reset bei Logout UND bei Navigation zu `/dashboard`.**

- `signOut`-Callback: `localStorage.removeItem('lastSelectedUserId')` — vollständiger Cleanup, kein State-Leak zwischen Sessions.
- Navigation zu `/dashboard` (User-Modus): `lastSelectedUserId` löschen, damit kein veralteter Admin-Kontext erhalten bleibt.
- Navigation innerhalb `/admin/*`: Wert behalten — Admin soll beim Tab-Wechsel nicht neu auswählen müssen.

---

### Frage 4 — User-Liste via API oder SSR?

**Entscheid: `SwitchUserSheet` lädt via `fetch('/api/admin/users')` — GET-Handler muss implementiert werden.**

Befund: `src/app/api/admin/users/route.ts` exportiert nur `POST`. Ein `GET`-Handler fehlt.

Implementierung (ca. 10 Zeilen, in `route.ts` ergänzen):
```typescript
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    where: { role: "user" },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json(users);
}
```

Begründung: `SwitchUserSheet` ist eine Client-Komponente (Bottom Sheet, lazy-geöffnet) — SSR-Daten wären hier ohnehin nicht nutzbar. Client-fetch auf einen dedizierten Endpunkt ist der sauberere Ansatz.

---

### Frage 5 — FAB-Logik / locked-Status

**Entscheid: `DashboardFAB` ist eine Client-Komponente; sie erhält `currentStatus` und `offeneKontrolle` als serialisierte Props vom SSR-Page-Layer.**

Befund aus `src/app/dashboard/page.tsx`:
- `currentStatus` wird SSR-seitig aus dem letzten `VERSCHLUSS`/`OEFFNEN`-Entry berechnet (`latest.type`, `latest.startTime`).
- `offeneKontrolle` ist die erste nicht erfüllte, nicht zurückgezogene `KontrollAnforderung`.
- `activeSperrzeit` bestimmt, ob Öffnen verboten ist.

Der FAB erhält folgende Props (alle aus dem SSR-Page-Layer):

```typescript
interface DashboardFABProps {
  status: "VERSCHLUSS" | "OEFFNEN" | null;  // aus currentStatus.type
  locked: boolean;                           // status === "VERSCHLUSS"
  sperrzeitAktiv: boolean;                  // !!activeSperrzeit
  offeneKontrolle: {
    code: string;
    kommentar: string | null;
  } | null;
}
```

FAB-Zustandsmatrix:

| Bedingung | Icon | Farbe | Tap-Ziel |
|---|---|---|---|
| `offeneKontrolle` vorhanden | ClipboardList (pulsierend) | orange-500 | `/dashboard/new/pruefung?code=…` |
| `locked && sperrzeitAktiv` | Lock | rose-500 | Toast "Öffnen gesperrt" |
| `locked` | LockOpen | emerald-500 | `/dashboard/new/oeffnen` |
| `!locked` | Lock | indigo-500 | `/dashboard/new/verschluss` |
| `status === null` (kein Eintrag) | Plus | indigo-400 | `/dashboard/new/verschluss` |

Priorität: `offeneKontrolle` schlägt immer den Lock-Status — Prüfung ist die dringendste Aktion.
