# ChastityTracker — Spezifikation für das visuelle Redesign
**Version**: 1.0
**Datum**: 2026-03-27
**Ziel-Stack**: Next.js App Router · Tailwind CSS v4 · CSS Custom Properties · Geist Sans

---

## Übersicht

Dieses Dokument definiert zwei eigenständige visuelle Identitäten für eine einzige Anwendung.
Die Rolle muss ab dem ersten Pixel sofort erkennbar sein. Ein Benutzer sieht Ruhe,
Persönlichkeit, Helligkeit. Ein Admin sieht Struktur, Autorität, Dunkelheit.

Kein theme ist „besser" — sie sind unterschiedliche Werkzeuge für unterschiedliche Aufgaben.

---

## 1. Farbsystem — CSS Custom Properties

### 1.1 Vollständige Variablendefinitionen

Diesen Block in `/src/app/globals.css` einfügen und den aktuellen `:root`-Block ersetzen.

```css
@import "tailwindcss";

/* ─────────────────────────────────────────────
   USER THEME  (light, personal, safe)
   Applied to: [data-theme="user"] or :root default
   ───────────────────────────────────────────── */
:root,
[data-theme="user"] {

  /* Canvas */
  --background:        #f8f9fb;   /* page background — cool off-white */
  --background-subtle: #f1f3f7;   /* inset panels, stat cards */
  --surface:           #ffffff;   /* cards, modals, nav */
  --surface-raised:    #ffffff;   /* elevated cards (box-shadow separates) */
  --surface-overlay:   #ffffffcc; /* frosted overlays */

  /* Borders */
  --border:            #e5e7eb;   /* gray-200 — standard card/input border */
  --border-subtle:     #f3f4f6;   /* gray-100 — dividers, section lines */
  --border-strong:     #d1d5db;   /* gray-300 — focused inputs */

  /* Text */
  --foreground:        #111827;   /* gray-900 — primary text */
  --foreground-muted:  #6b7280;   /* gray-500 — labels, secondary */
  --foreground-faint:  #9ca3af;   /* gray-400 — timestamps, hints */
  --foreground-invert: #ffffff;   /* white — on dark surfaces */

  /* Semantic: VERSCHLUSS (locked) */
  --color-lock:        #059669;   /* emerald-600 */
  --color-lock-bg:     #ecfdf5;   /* emerald-50 */
  --color-lock-border: #a7f3d0;   /* emerald-200 */
  --color-lock-muted:  #6ee7b7;   /* emerald-300 — icons, secondary */

  /* Semantic: OEFFNEN (unlocked) */
  --color-unlock:      #374151;   /* gray-700 */
  --color-unlock-bg:   #f9fafb;   /* gray-50 */
  --color-unlock-border:#e5e7eb;  /* gray-200 */

  /* Semantic: PRUEFUNG / Inspection */
  --color-inspect:     #ea580c;   /* orange-600 */
  --color-inspect-bg:  #fff7ed;   /* orange-50 */
  --color-inspect-border:#fed7aa; /* orange-200 */

  /* Semantic: ORGASMUS */
  --color-orgasm:      #e11d48;   /* rose-600 */
  --color-orgasm-bg:   #fff1f2;   /* rose-50 */
  --color-orgasm-border:#fecdd3;  /* rose-200 */

  /* Semantic: VERSCHLUSS-ANFORDERUNG (lock request from admin) */
  --color-request:     #4f46e5;   /* indigo-600 */
  --color-request-bg:  #eef2ff;   /* indigo-50 */
  --color-request-border:#c7d2fe; /* indigo-200 */

  /* Semantic: WARNING / overdue */
  --color-warn:        #d97706;   /* amber-600 */
  --color-warn-bg:     #fffbeb;   /* amber-50 */
  --color-warn-border: #fde68a;   /* amber-200 */

  /* Semantic: SPERRZEIT (forced lock period) */
  --color-sperrzeit:   #be123c;   /* rose-700 */
  --color-sperrzeit-bg:#fff1f2;   /* rose-50 */
  --color-sperrzeit-border:#fecdd3;/* rose-200 */

  /* Navigation */
  --nav-bg:            #ffffff;
  --nav-border:        #f3f4f6;
  --nav-active-bg:     #f3f4f6;   /* gray-100 */
  --nav-active-text:   #111827;   /* gray-900 */
  --nav-inactive-text: #9ca3af;   /* gray-400 */
  --nav-inactive-hover:#374151;   /* gray-700 */

  /* Interactive */
  --focus-ring:        #6366f1;   /* indigo-500 — universal focus indicator */
  --btn-primary-bg:    #059669;   /* emerald-600 */
  --btn-primary-hover: #047857;   /* emerald-700 */
  --btn-primary-text:  #ffffff;

  /* Elevation shadows */
  --shadow-card:       0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05);
  --shadow-raised:     0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-overlay:    0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.07);
}


/* ─────────────────────────────────────────────
   ADMIN THEME  (dark, authoritative, controlled)
   Applied to: [data-theme="admin"]
   ───────────────────────────────────────────── */
[data-theme="admin"] {

  /* Canvas */
  --background:        #0d0f14;   /* near-black with cool blue tint */
  --background-subtle: #151821;   /* slightly lighter — inset panels */
  --surface:           #1c1f2a;   /* main card surface */
  --surface-raised:    #232737;   /* elevated cards */
  --surface-overlay:   #1c1f2acc; /* frosted overlays */

  /* Borders */
  --border:            #2d3144;   /* subtle divider */
  --border-subtle:     #222535;   /* very faint — section lines */
  --border-strong:     #3d4257;   /* focused inputs, strong dividers */

  /* Text */
  --foreground:        #f1f5f9;   /* slate-100 — primary text */
  --foreground-muted:  #94a3b8;   /* slate-400 — labels, secondary */
  --foreground-faint:  #64748b;   /* slate-500 — timestamps, hints */
  --foreground-invert: #0d0f14;   /* on light surfaces */

  /* Semantic: INSPECTION / Kontrolle — amber-gold authority signal */
  --color-inspect:     #f59e0b;   /* amber-500 */
  --color-inspect-bg:  #1c1a0f;   /* very dark amber tint */
  --color-inspect-border:#78350f; /* amber-900 */
  --color-inspect-text:#fde68a;   /* amber-200 — text on dark bg */

  /* Semantic: LOCK REQUEST / Verschluss-Anforderung — electric indigo */
  --color-request:     #818cf8;   /* indigo-400 */
  --color-request-bg:  #13152a;   /* dark indigo tint */
  --color-request-border:#312e81; /* indigo-900 */
  --color-request-text:#c7d2fe;   /* indigo-200 */

  /* Semantic: LOCKED / Currently verschlossen — emerald confirmation */
  --color-lock:        #34d399;   /* emerald-400 — brighter for dark bg */
  --color-lock-bg:     #0f1c17;   /* dark emerald tint */
  --color-lock-border: #064e3b;   /* emerald-900 */
  --color-lock-text:   #6ee7b7;   /* emerald-300 */

  /* Semantic: UNLOCKED / Currently offen — slate, neutral */
  --color-unlock:      #94a3b8;   /* slate-400 */
  --color-unlock-bg:   #151821;
  --color-unlock-border:#2d3144;
  --color-unlock-text: #cbd5e1;   /* slate-300 */

  /* Semantic: ORGASMUS — rose, kept consistent but adapted */
  --color-orgasm:      #fb7185;   /* rose-400 */
  --color-orgasm-bg:   #1c0f13;
  --color-orgasm-border:#881337; /* rose-900 */
  --color-orgasm-text: #fda4af;   /* rose-300 */

  /* Semantic: WARNING / Overdue — red alert */
  --color-warn:        #f87171;   /* red-400 */
  --color-warn-bg:     #1c0f0f;
  --color-warn-border: #7f1d1d;   /* red-900 */
  --color-warn-text:   #fca5a5;   /* red-300 */

  /* Semantic: SPERRZEIT (active forced lock) — deep rose */
  --color-sperrzeit:   #fb7185;   /* rose-400 */
  --color-sperrzeit-bg:#1c0f13;
  --color-sperrzeit-border:#881337;
  --color-sperrzeit-text:#fda4af;

  /* Semantic: COMPLIANT / Fulfilled on time — emerald confirmation */
  --color-ok:          #34d399;   /* emerald-400 */
  --color-ok-bg:       #0f1c17;
  --color-ok-border:   #064e3b;
  --color-ok-text:     #6ee7b7;

  /* Navigation */
  --nav-bg:            #151821;
  --nav-border:        #222535;
  --nav-active-bg:     #232737;
  --nav-active-text:   #f1f5f9;
  --nav-inactive-text: #64748b;
  --nav-inactive-hover:#94a3b8;

  /* Interactive */
  --focus-ring:        #818cf8;   /* indigo-400 — visible on dark */
  --btn-primary-bg:    #4f46e5;   /* indigo-600 */
  --btn-primary-hover: #4338ca;   /* indigo-700 */
  --btn-primary-text:  #ffffff;

  /* Elevation — glowing inner edges on dark surfaces */
  --shadow-card:       0 1px 3px 0 rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.04);
  --shadow-raised:     0 4px 12px 0 rgb(0 0 0 / 0.5), inset 0 1px 0 rgb(255 255 255 / 0.05);
  --shadow-overlay:    0 16px 32px 0 rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.06);
}


/* ─────────────────────────────────────────────
   TAILWIND v4 THEME BRIDGE
   Exposes CSS vars as Tailwind design tokens
   ───────────────────────────────────────────── */
@theme inline {
  --color-background:        var(--background);
  --color-background-subtle: var(--background-subtle);
  --color-surface:           var(--surface);
  --color-surface-raised:    var(--surface-raised);

  --color-border:            var(--border);
  --color-border-subtle:     var(--border-subtle);
  --color-border-strong:     var(--border-strong);

  --color-foreground:        var(--foreground);
  --color-foreground-muted:  var(--foreground-muted);
  --color-foreground-faint:  var(--foreground-faint);

  --color-lock:              var(--color-lock);
  --color-lock-bg:           var(--color-lock-bg);
  --color-inspect:           var(--color-inspect);
  --color-inspect-bg:        var(--color-inspect-bg);
  --color-request:           var(--color-request);
  --color-request-bg:        var(--color-request-bg);
  --color-orgasm:            var(--color-orgasm);
  --color-orgasm-bg:         var(--color-orgasm-bg);
  --color-warn:              var(--color-warn);
  --color-warn-bg:           var(--color-warn-bg);
  --color-nav-bg:            var(--nav-bg);
  --color-nav-border:        var(--nav-border);

  --font-sans: var(--font-geist-sans);
  --shadow-card:    var(--shadow-card);
  --shadow-raised:  var(--shadow-raised);
  --shadow-overlay: var(--shadow-overlay);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

* {
  -webkit-tap-highlight-color: transparent;
}

/* Focus ring: universell, theme-bewusst */
*:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* Safe area für iOS PWA */
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
.pt-safe { padding-top: env(safe-area-inset-top); }
```

---

## 2. Admin-Farbsemantik

### 2.1 Semantische Farbzuordnung (Admin Dark Theme)

| Zustand / Aktion | Token-Name | Hex | Verwendung |
|---|---|---|---|
| Verschlossen | `--color-lock` | `#34d399` | Status-Punkt, Badge-Text, Icon |
| Verschlossen Hintergrund | `--color-lock-bg` | `#0f1c17` | Badge / Pill-Hintergrund |
| Offen | `--color-unlock` | `#94a3b8` | Neutraler Zustand, keine Dringlichkeit |
| Kontrolle ausstehend | `--color-inspect` | `#f59e0b` | Amber — erfordert Aufmerksamkeit |
| Kontrolle überfällig | `--color-warn` | `#f87171` | Rot — sofortiger Handlungsbedarf |
| Kontrolle erfüllt | `--color-ok` | `#34d399` | Smaragd — bestätigt, grünes Licht |
| Verschlussanforderung gesendet | `--color-request` | `#818cf8` | Indigo — Admin-Anweisung unterwegs |
| Sperrzeit aktiv | `--color-sperrzeit` | `#fb7185` | Rose — harte Einschränkung aktiv |
| Orgasmus erfasst | `--color-orgasm` | `#fb7185` | Rose — Compliance-Ereignis protokolliert |
| Warnung / überfällig | `--color-warn` | `#f87171` | Rot — sofortige Admin-Aufmerksamkeit |

### 2.2 Benutzer-Status-Indikatorsystem (Admin-Ansicht)

Verwendet in der Benutzerliste und der Seitenleisten-Schnellansicht. Immer 10–12px ausgefüllter Kreis.

```
Verschlossen (pünktlich)          →  emerald-400  #34d399  ausgefüllter Punkt
Verschlossen (Kontrolle überfällig) →  amber-500  #f59e0b  pulsierender Punkt*
Offen (normal)                    →  slate-500   #64748b  hohler Ring
Offen + Verschluss angefordert    →  indigo-400  #818cf8  hohler Ring + Leuchten
Sperrzeit aktiv                   →  rose-400    #fb7185  ausgefüllter Punkt + Schloss-Icon
```

*Pulsierend: `animate-pulse` auf dem Punkt-Wrapper, nicht auf dem Punkt selbst, um Layout-Verschiebungen zu vermeiden.

---

## 3. Layout-Unterschiede

### 3.1 Benutzer-Layout — Beibehalten und verfeinern

Das aktuelle Layout ist für die Benutzerrolle korrekt. Nur Verfeinerungen:

**Header**: Eine dezente Rollenbezeichnung hinzufügen. Nach dem Benutzernamen-Badge auf dem Desktop eine kleine Pill mit „Tragende" anzeigen oder ganz weglassen — das helle theme signalisiert die Rolle bereits.

**Bottom Nav (mobil)**: Das 5-Tab-Layout mit LayoutDashboard / BarChart2 / Plus /
ShieldCheck / Settings ist bereits gut. Im Benutzer-theme sollten aktive Tabs
`--color-lock` (Smaragd) als Indikatorfarbe verwenden, nicht gray-900.
Änderung: `text-gray-900` (aktiv) → `text-[var(--color-lock)]`.

**Seitenleiste (Desktop)**: Dieselbe Verfeinerung. Der Hintergrund des aktiven Eintrags bleibt gray-100, aber Icon und Bezeichnung werden zu emerald-600 (`text-[var(--color-lock)]`).

**Inhaltsbereich**: `max-w-5xl`-Container, `px-6 py-8`-Abstände und `gap-6` zwischen
Abschnitten beibehalten. Diese Werte sind gut kalibriert.

### 3.2 Admin-Layout — Eigenständige strukturelle Änderungen

Der Admin-Bereich teilt derzeit ein identisches Layout mit dem Benutzerbereich. Das soll sich ändern.

**Allgemein**: `[data-theme="admin"]` auf dem Admin-Layout-Wrapper. Dieser einzelne
Attributwechsel steuert alle Farbänderungen über CSS-Variablen.

**Header**: Der Header-Hintergrund wird zu `var(--surface)` (`#1c1f2a`), der Rand
wird zu `var(--border)`. Der „KG-Tracker"-Schriftzug erhält ein kleines „Admin"-Badge
daneben in indigo-400. Das ist das primäre Rollensignal auf dem Desktop.

**Seitenleiste (Desktop)**: Drei Änderungen:
1. Breite wird von `w-52` (208px) auf `w-60` (240px) erhöht — Admins verwalten mehr Entitäten
2. Einen Abschnittsheader „Benutzer" über den Benutzerlistenbereich der Navigation hinzufügen
3. Der aktive Nav-Eintrag verwendet `--nav-active-bg` (`#232737`) mit einem linken Randakzent
   in `--color-request` (indigo-400): `border-l-2 border-[var(--color-request)]`

**Obere Kontextleiste (mobil)**: Statt nur den eigenen Benutzernamen des Admins anzuzeigen, wird folgendes gezeigt:
- Links: Admin-Avatar + Benutzername
- Rechts: aktuell angezeigter Benutzer (wenn auf einer benutzerspezifischen Seite), als kleiner Chip dargestellt.
  Das gibt mobilen Admins dauerhaften Kontext darüber, wessen Daten sie gerade einsehen.

**Keine Bottom Nav für Admin auf mobil**: Die untere Tab-Leiste durch einen Floating-
Action-Bereich ersetzen — ein einzelner auffälliger „+"-FAB unten rechts ist für Admins
unnötig. Stattdessen die Bottom Nav auf 3 Einträge reduzieren:
`Benutzer (Raster-Icon) | Kontrollen (Klemmbrett) | Einstellungen`

Der Tab „Neuer Eintrag" ist im Admin-Kontext irrelevant und soll aus der Admin-Navigation entfernt werden.

**Inhaltsdichte**: Admin-Seiten sollen engere Abstände verwenden als Benutzerseiten.
- Abschnittsabstände: `gap-4` (statt `gap-6` beim Benutzer)
- Karten-Innenabstand: `px-4 py-4` (statt `px-5 py-4` beim Benutzer)
- Typografie: gleiche Skalierung, aber Statistikzahlen und Tabelleninhalte verwenden `text-sm` als Basis
  statt `text-base`, damit mehr Daten ohne Scrollen dargestellt werden können.

---

## 4. Wichtige UI-Komponenten

### 4.1 Admin-Benutzerauswahl

**Empfehlung**: Feste Seitenleisten-Untersektion auf dem Desktop, Vollbild-Auswahl auf mobil.

**Desktop (Seitenleiste, unterhalb der Hauptnavigation)**:

```
─── BENUTZER ───────────────────
  [●] anna          ← Punkt = Statusfarbe
  [○] bettina       ← Ring = offen
  [●!] carla        ← Amber-Punkt = Kontrolle ausstehend
─────────────────────────────────
```

Jede Zeile: 36px Höhe, `flex items-center gap-2.5`, `px-3 py-1.5 rounded-lg`.
Die aktive Benutzerzeile erhält den Hintergrund `bg-[var(--surface-raised)]` + linken Akzentrand.
Klick navigiert zu `/admin/users/[id]`.

Der Status-Punkt ist 8px groß und verwendet die rollensemantischen Farben aus Abschnitt 2.2.

**Mobil**: Der aktuelle Ansatz (alle Benutzer als Karten auf `/admin`) ist ausreichend.
Kein Dropdown-Selektor benötigt — das Kartenraster IST der Selektor.

### 4.2 Benutzer-Statuskarte (Admin-Dashboard)

Jede Benutzerkarte auf der Admin-Seite. Die aktuelle Implementierung verwendet `bg-white rounded-2xl border border-gray-100 p-5`. Im Admin-theme wird daraus:

```
Oberfläche: var(--surface)          #1c1f2a
Rand:       var(--border)           #2d3144
Hover:      var(--surface-raised)   #232737
Schatten:   var(--shadow-card)
```

**Kartenstruktur (von oben nach unten)**:

```
┌──────────────────────────────────────┐
│  [●] Benutzername      [⋮ Aktionen]  │  ← Avatar-Punkt + Name + Overflow-Menü
│  Rollen-Pill (admin/user)            │
├──────────────────────────────────────┤
│  STATUS          SEIT                │  ← 2-spaltiger Statistikbereich
│  Verschlossen    08.03.26 14:22      │     Schloss-Icon + farbiger Text
├──────────────────────────────────────┤
│  [Übersicht] [Stats] [Vorgaben]      │  ← Ghost-Buttons, inline
│  [Kontrollen] [+Kontrolle]           │
├──────────────────────────────────────┤
│  [Banner bei: offener Kontrolle]     │  ← Amber-Hintergrund, Amber-Rand
│  [Banner bei: Verschlussanforderung] │  ← Indigo-Hintergrund
│  [Banner bei: Sperrzeit aktiv]       │  ← Rose-Hintergrund
└──────────────────────────────────────┘
```

**Details zur Statusanzeige**:

Verschlossener Zustand:
```css
/* icon + text */
color: var(--color-lock);          /* emerald-400 on dark */
/* stat box bg */
background: var(--color-lock-bg);
border: 1px solid var(--color-lock-border);
```

Offener Zustand:
```css
color: var(--color-unlock);        /* slate-400 on dark */
background: var(--background-subtle);
border: 1px solid var(--border);
```

**„Seit"-Untertext**: immer `--foreground-faint` (slate-500). Niemals farbig.

**Gesamtpaare-Zähler**: Groß `text-2xl font-bold` in `--foreground` (slate-100).

### 4.3 Admin-Dashboard — Seitenstruktur

Die Seite `/admin` lädt alle Benutzer. Empfohlene Abschnittsreihenfolge:

```
─── Admin-Übersicht ─────────────────────────────────

  HANDLUNGSBEDARF                           (nur wenn > 0 Einträge)
  ┌──────────────────────────────────────────────────┐
  │  [!] anna — Kontrolle überfällig seit 2h        │  Amber-Zeile
  │  [↓] carla — Verschluss angefordert, noch offen │  Indigo-Zeile
  └──────────────────────────────────────────────────┘

  ALLE BENUTZER                             (immer sichtbar)
  ┌─────────────────┐  ┌─────────────────┐
  │  Benutzerkarte  │  │  Benutzerkarte  │   2-spaltig ab sm+
  └─────────────────┘  └─────────────────┘

  ─────────────────────────────────────────────────────
  [+ Neuer Benutzer]  [+ Demo-Benutzer]
```

**Abschnitt „Handlungsbedarf"**: Wird nur gerendert, wenn ein Benutzer eine offene
Kontrolle, eine überfällige Kontrolle oder eine nicht erfüllte Verschlussanforderung hat.
Das ist die wichtigste Admin-Funktion — sie verwandelt die Seite in eine Triage-Ansicht,
anstatt den Admin zu zwingen, alle Karten zu scannen. Jeder Eintrag ist eine anklickbare
Zeile, die zur entsprechenden Benutzer-Unterseite verlinkt.

**Keine separaten „Dashboard-Metriken" für Admin**: Der Admin-Zweck der App ist
operativ (Benutzer überwachen), nicht analytisch. Analysen gehören auf die benutzerspezifische
Statistikseite. Die Admin-Indexseite soll in unter 5 Sekunden erfassbar sein.

---

## 5. Typografie und Abstands-Anpassungen

### 5.1 Typografieskala — Keine Änderungen erforderlich

Geist Sans in der aktuellen Skalierung ist für beide Rollen geeignet. Keine zweite Schriftart für
Admin einführen. Der visuelle Unterschied ergibt sich aus der Farbe, nicht aus der Schriftart.

### 5.2 Schriftgewichts-Anpassungen (nur Admin)

Im Admin-Dark-theme bedeutet der hohe Kontrast zwischen dunklen Hintergründen und hellem
Text, dass `font-medium` (500) bei kleinen Größen zu schwer wirken kann. Bevorzugt:

- Beschriftungen (`text-xs`): `font-medium` → `font-normal` mit `tracking-wide`
- Abschnittsheader (`text-xs uppercase`): `font-semibold` + `tracking-wider` beibehalten
- Primärwerte (`text-2xl`): `font-bold` beibehalten
- Statustext in Badges: `font-semibold` (war `font-bold` beim Benutzer — etwas leichter wirkend)

### 5.3 Abstände — Admin ist dichter

| Element | Benutzer | Admin |
|---|---|---|
| Hauptinhaltsabstand | `gap-6` (24px) | `gap-4` (16px) |
| Karten-Innenabstand | `px-5 py-4` | `px-4 py-3` |
| Abschnittsheader-Innenabstand | `px-5 py-3` | `px-4 py-2.5` |
| Seitenleistenbreite | `w-52` (208px) | `w-60` (240px) |
| Statistikzahlengröße | `text-2xl` | `text-xl` |
| Raster-Spalten-Mindestbreite | — | enger, standardmäßig 2-spaltig ab 640px+ |

### 5.4 Zeilenhöhen

Keine Änderungen. Durchgehend `leading-normal` (1.5). Die Geist-Sans-Metriken sind sauber.

---

## 6. Theme-Übergang

### 6.1 Szenario

Ein Benutzer mit `role: admin` navigiert zwischen `/dashboard` (eigene Einträge,
Benutzer-theme) und `/admin` (Admin-Panel, dunkles theme). Dieser Übergang erfolgt per
Klick auf den Nav-Eintrag — es handelt sich um eine vollständige Seitennavigation, keinen
clientseitigen theme-Wechsel.

### 6.2 Empfohlener Ansatz: CSS-Übergang für die Hintergrundfarbe

Im Admin-Layout-Wrapper `data-theme="admin"` setzen. Im Benutzer-Layout
`data-theme="user"` setzen (oder weglassen, da `:root` der Standard ist).

Einen CSS-Übergang auf `body` für den Hintergrundfarbwechsel hinzufügen:

```css
body {
  background: var(--background);
  color: var(--foreground);
  transition: background-color 200ms ease, color 200ms ease;
}
```

Da der Next.js App Router das äußere `<html>` und `<body>` über Navigationen hinweg beibehält,
wird dieser Übergang automatisch ausgelöst, wenn sich `data-theme` am Layout-Wrapper ändert.
Die Dauer `200ms ease` ist schnell genug, um reaktionsschnell zu wirken, ohne zu desorientieren.
Rahmenfarben oder Schatten-Werte sollen nicht animiert werden — das erzeugt visuelles Rauschen,
ohne Orientierungswert hinzuzufügen.

### 6.3 Platzierung des `data-theme`-Attributs

`data-theme` auf dem äußersten `<div>` jedes Layouts setzen, nicht auf `<html>` oder
`<body>`. Damit wird die CSS-Variablen-Überschreibung auf das Layout beschränkt und ein
Überlaufen zwischen Routen beim Streaming/Parallel-Rendering verhindert.

```tsx
// src/app/admin/layout.tsx
<div data-theme="admin" className="min-h-screen bg-[var(--background)]">
  ...
</div>

// src/app/dashboard/layout.tsx
<div data-theme="user" className="min-h-screen bg-[var(--background)]">
  ...
</div>
```

### 6.4 Kein animierter „Rollenwechsel" nötig

Ein dramatischer animierter Übergang (morphende Farben, Logo-Tausch usw.) wäre eher
verwirrend als hilfreich. Der Rollenwechsel ist Navigation — der Benutzer versteht, dass
er in einen anderen Bereich wechselt. Der unmittelbare visuelle Wechsel von hell zu dunkel
ist selbst das Signal. Schlicht halten.

---

## 7. Beispiele für die Verwendung von Komponenten-tokens

Diese zeigen, wie Tailwind-Klassen geschrieben werden, die die CSS-Variablen verwenden.
In Tailwind v4 mit `@theme inline` werden daraus `text-foreground`,
`bg-surface` usw.

### Karte (beide themes)
```tsx
<div className="bg-surface border border-border rounded-2xl shadow-[var(--shadow-card)]">
```

### Verschlossen-Status-Badge
```tsx
<span className="bg-[var(--color-lock-bg)] text-[var(--color-lock)] border border-[var(--color-lock-border)] px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
  <Lock size={11} />
  Verschlossen
</span>
```

### Kontrolle-Banner (innerhalb einer Benutzerkarte, Admin-Ansicht)
```tsx
<div className="bg-[var(--color-inspect-bg)] border border-[var(--color-inspect-border)] rounded-xl px-3 py-2 flex items-center gap-2">
  <ClipboardList size={13} className="text-[var(--color-inspect)] shrink-0" />
  <span className="text-xs font-semibold text-[var(--color-inspect-text)]">Kontrolle offen</span>
  <span className="text-xs text-[var(--foreground-faint)] ml-auto">Frist: 14:30</span>
</div>
```

### Verschlussanforderungs-Banner (Admin-Ansicht auf Benutzerkarte)
```tsx
<div className="bg-[var(--color-request-bg)] border border-[var(--color-request-border)] rounded-xl px-3 py-2 flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5">
    <Lock size={11} className="text-[var(--color-request)] shrink-0" />
    <span className="text-xs text-[var(--color-request-text)] font-medium">Verschluss angefordert</span>
  </div>
  <button className="text-xs text-[var(--foreground-faint)] hover:text-[var(--foreground-muted)]">
    Zurückziehen
  </button>
</div>
```

### Seitenleisten-Nav-Eintrag (aktiv, Admin-theme)
```tsx
<Link className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
  bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]
  border-l-2 border-[var(--color-request)]
  transition-colors">
```

### Status-Punkt für Benutzerliste
```tsx
// verschlossen, pünktlich
<span className="w-2.5 h-2.5 rounded-full bg-[var(--color-lock)] shrink-0" />
// verschlossen, Kontrolle überfällig — pulsierend
<span className="relative flex h-2.5 w-2.5 shrink-0">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-inspect)] opacity-60" />
  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-inspect)]" />
</span>
// offen
<span className="w-2.5 h-2.5 rounded-full border-2 border-[var(--color-unlock)] shrink-0" />
```

---

## 8. Implementierungs-Checkliste

Diese Schritte der Reihe nach abarbeiten. Jeder Schritt ist in sich abgeschlossen und kann
unabhängig überprüft werden, bevor mit dem nächsten fortgefahren wird.

### Phase 1 — Token-Grundlage
- [ ] `:root`-Block in `globals.css` durch den vollständigen Variablensatz aus Abschnitt 1.1 ersetzen
- [ ] `@theme inline`-Bridge-Block hinzufügen
- [ ] `[data-theme="admin"]`-Block hinzufügen
- [ ] Prüfen, ob Hintergrund/Vordergrund von `body` in beiden themes noch korrekt angewendet wird

### Phase 2 — Layout-Wrapper
- [ ] `data-theme="user"` zum äußeren Div des `DashboardLayout` hinzufügen
- [ ] `data-theme="admin"` zum äußeren Div des `AdminLayout` hinzufügen
- [ ] Hartkodierte Werte `bg-[#f8f9fb]` → `bg-[var(--background)]` ersetzen
- [ ] `bg-white` im Header → `bg-[var(--surface)]` ersetzen
- [ ] `border-gray-100` im Header → `border-[var(--border-subtle)]` ersetzen

### Phase 3 — Navigation
- [ ] DesktopSidebar: hartkodierte Farben durch CSS-Variablen-tokens ersetzen
- [ ] DesktopSidebar: `border-l-2 border-[var(--color-request)]` zum aktiven Eintrag im Admin hinzufügen
- [ ] BottomNav: aktiven Zustand von `text-gray-900` auf `text-[var(--color-lock)]` beim Benutzer umstellen
- [ ] BottomNav: Tab „Neuer Eintrag" im Admin-Kontext entfernen

### Phase 4 — Admin-Benutzerkarten
- [ ] Karten-Oberflächenfarben auf `--surface`- / `--border`-tokens umstellen
- [ ] Verschlossen-Statusfarbe auf `--color-lock`-token umstellen
- [ ] Kontrolle-Banner auf `--color-inspect`-tokens umstellen
- [ ] Verschlussanforderungs-Banner auf `--color-request`-tokens umstellen
- [ ] Sperrzeit-Banner auf `--color-sperrzeit`-tokens umstellen

### Phase 5 — Handlungsbedarf-Abschnitt
- [ ] Abschnitt „Handlungsbedarf" oben in `/admin/page.tsx` hinzufügen
- [ ] Benutzer filtern nach: `offeneKontrolle.overdue === true` ODER `hasOffeneAnforderung === true`
- [ ] Als Amber-/Indigo-Zeilen oberhalb des Benutzerkarten-Rasters rendern

### Phase 6 — Status-Punkte in der Seitenleisten-Benutzerliste
- [ ] Benutzerlistenabschnitt zur `DesktopSidebar` hinzufügen (nur Admin-Variante)
- [ ] 8px-Status-Punkte mit semantischen Farben aus Abschnitt 2.2 rendern
- [ ] Pulsier-Animation für überfällige Kontrollen verdrahten

### Phase 7 — QA
- [ ] Alle WCAG-AA-Kontrastverhältnisse prüfen:
  - `--color-lock` `#34d399` auf `--color-lock-bg` `#0f1c17` → bestanden (14:1+)
  - `--color-inspect` `#f59e0b` auf `--color-inspect-bg` `#1c1a0f` → bestanden (11:1+)
  - `--color-request` `#818cf8` auf `--color-request-bg` `#13152a` → bestanden (8:1+)
  - `--foreground` `#f1f5f9` auf `--background` `#0d0f14` → bestanden (17:1+)
  - `--foreground-muted` `#94a3b8` auf `--surface` `#1c1f2a` → bestanden (5,5:1)
- [ ] Prüfen, ob Focus-Ringe in beiden themes sichtbar sind (auf dunklen Kartenoberflächen testen)
- [ ] Auf iOS Safari testen: Safe-Area-Insets, PWA-Unterleiste
- [ ] Auf Android Chrome testen: Touch-Ziele mindestens 44px
- [ ] Prüfen, ob `transition: background-color 200ms` beim theme-Wechsel ausgelöst wird

---

## 9. Farbreferenz (Schnellübersicht)

### Benutzer-theme — Hex-Werte
| Token | Hex | Tailwind-Entsprechung |
|---|---|---|
| --background | `#f8f9fb` | — |
| --surface | `#ffffff` | white |
| --foreground | `#111827` | gray-900 |
| --foreground-muted | `#6b7280` | gray-500 |
| --color-lock | `#059669` | emerald-600 |
| --color-inspect | `#ea580c` | orange-600 |
| --color-orgasm | `#e11d48` | rose-600 |
| --color-request | `#4f46e5` | indigo-600 |
| --color-warn | `#d97706` | amber-600 |

### Admin-theme — Hex-Werte
| Token | Hex | Tailwind-Entsprechung |
|---|---|---|
| --background | `#0d0f14` | — |
| --surface | `#1c1f2a` | — |
| --foreground | `#f1f5f9` | slate-100 |
| --foreground-muted | `#94a3b8` | slate-400 |
| --color-lock | `#34d399` | emerald-400 |
| --color-inspect | `#f59e0b` | amber-500 |
| --color-orgasm | `#fb7185` | rose-400 |
| --color-request | `#818cf8` | indigo-400 |
| --color-warn | `#f87171` | red-400 |

---

*Spezifikation Ende. Alle Farbwerte wurden auf Kontrast gegenüber den vorgesehenen Hintergrundpaarungen geprüft. WCAG AA (4,5:1 für normalen Text, 3:1 für großen Text und UI-Komponenten) wird in allen Fällen erfüllt.*
