# Formensprache — Chastity Tracker v3

## Leitprinzip

> Jedes Element hat eine klare visuelle Rolle. Auf den ersten Blick erkennbar:
> **Was kann ich antippen?** vs. **Was zeigt mir etwas an?**

---

## 1. Drei visuelle Kategorien

### Kategorie A: AKTIONEN (klickbar)
- Haben immer: **Verb im Text** + **Icon** + **visuellen Tiefeneffekt**
- Sind zentriert ausgerichtet
- Min-Hoehe 48px (Touch-Target)
- Reagieren auf Tap (active:scale-95)

### Kategorie B: INFORMATION (passiv)
- Haben nie: Schatten, Hover-State, Verb im Text
- Nutzen: Daten, Zahlen, Status-Labels
- Sind linksbündig ausgerichtet
- Haben eine duenne Border (1px) oder semantischen Hintergrund

### Kategorie C: STATUS-INDIKATOREN (passiv, prominent)
- Banner und Badges mit semantischer Farbe
- Haben einen **dicken linken Akzent-Rand** (3px) — DAS unterscheidet sie von Buttons
- Immer Icon + Text, nie nur Farbe

---

## 2. Buttons (Kategorie A)

### Primary Button
- Gefuellt mit semantischer Farbe (lock=gruen, unlock=blau, inspect=orange)
- Weisser Text, Icon links, Verb
- `rounded-xl`, `shadow-sm`, `active:scale-[0.97]`
- Volle Breite auf Mobile

### Secondary Button
- Weisser/Surface Hintergrund
- 1px Border (`border-border`), dunkler Text
- Icon links, Verb
- `rounded-xl`, kein Schatten
- Volle Breite auf Mobile

### Ghost/Link
- Kein Hintergrund, kein Border
- NUR in Navigation (Sidebar, Tabs) oder als "Abbrechen"
- Nie als einzige Aktion auf einem Screen

### Regel: Button-Erkennung auf Mobile
Jeder Button hat MINDESTENS ZWEI dieser Signale:
1. Fuellung oder Border
2. Icon
3. Verb-Text ("Oeffnen", "Erfassen")
4. Zentrale Ausrichtung

---

## 3. Informations-Cards (Kategorie B)

### Stat-Card (Zahlen)
- `border border-border`, kein Schatten
- Grosse Zahl oben, kleines Label unten
- Optional: Progress-Bar
- Kein Hover, nicht klickbar

### Status-Hero (Zustand)
- `border border-border`, kein Schatten
- Icon links (dekorativ), Text rechts
- Timer als grosse Zahl
- Kein Hover, nicht klickbar

### Session-Card (Timeline)
- `border border-border`, kein Schatten
- Innere Timeline-Punkte mit farbigen Dots
- Thumbnails mit Expand-Icon-Overlay (Maximize2)

### Regel: Passive Cards haben NIE
- `shadow-*`
- `hover:*`
- Zentrierten Text
- Verben im Label

---

## 4. Banner & Alerts (Kategorie C)

### Alert-Banner (Kontrolle, Anforderung, Sperrzeit)
- Semantischer Hintergrund (z.B. `bg-inspect-bg`)
- **3px linker Akzent-Rand** (`border-l-[3px] border-l-[var(--color-inspect)]`)
- Icon + Text, linksbündig
- Optional: Countdown, Code
- Kein Schatten, kein Hover

### Unterscheidung zu Buttons:
| Merkmal | Button | Banner |
|---------|--------|--------|
| Ausrichtung | Zentriert | Linksbuendig |
| Linker Rand | Nein | 3px Akzent |
| Schatten | Ja (Primary) oder Border | Nein |
| Text | Verb ("Oeffnen") | Substantiv/Status ("Verschlossen") |
| Icon | Links vom Text | Ganz links als Signalgeber |
| Touch-Feedback | active:scale | Keins |

---

## 5. Badges & Pills (Kategorie C)

- Kleine Pills: `rounded-full`, semantische Farbe, Icon + Text
- Grosse Status-Badges: `rounded-xl`, Icon-Box + Label
- Immer: Icon UND Text (nie nur Farbe fuer Accessibility)

---

## 6. Form-Elemente

### Inputs
- `border border-border`, `rounded-lg`
- Focus: `outline-2 outline-focus-ring`
- Label: Ueber dem Input, `uppercase text-xs font-semibold text-foreground-faint`

### Submit-Button
- Immer `variant="semantic"` mit passender Farbe
- Immer volle Breite auf Mobile
- Immer am Ende des Formulars

---

## 7. Thumbnails / Bilder

- Klickbare Bilder haben ein `Maximize2`-Icon Overlay (rechts unten)
- Halbtransparenter schwarzer Hintergrund (`bg-black/50`)
- Auf Mobile: immer sichtbar (opacity 70%), kein Hover noetig

---

## 8. Farbsystem (unveraendert)

| Konzept | Farbe | Verwendung |
|---------|-------|-----------|
| Verschluss | Emerald | Aktiv, sicher, verschlossen |
| Oeffnen | Sky-Blue | Neutral, offen |
| Kontrolle | Orange | Aufmerksamkeit, Dringlichkeit |
| Orgasmus | Rose | Emotion, Intimitaet |
| Sperrzeit | Violet | Autoritaet, Restriktion |
| Anforderung | Indigo | Pflicht, Auftrag |
| Warnung | Red-Orange | Alarm, Gefahr |
| Erfolg | Emerald | Positiv, verifiziert |

---

## 9. Typografie

- Headlines: `font-bold`, `tracking-tight`
- Body: `text-base`, `leading-relaxed`
- Labels: `text-xs`, `uppercase`, `tracking-wider`, `font-semibold`
- Zahlen/Timer: `tabular-nums`, `font-bold`
- Keine neuen Fonts — Geist Sans bleibt (Teil des Next.js Stacks)

---

## 10. Spacing

- 4px Basis-Raster
- Card-Padding: `p-4 sm:p-5`
- Section-Gaps: `gap-5` (20px)
- Touch-Targets: min 48x48px
- Safe-Area-Padding auf Mobile (iOS)
