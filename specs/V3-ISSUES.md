# V3 UX-Probleme — Dokumentation fuer Korrektur

## KRITISCH — Feature-Verlust

### Issue 1: Bilder ansehen ist komplett verloren

**Schweregrad: KRITISCH** — Kernfeature fehlt

**Was verloren ging:**
Die v2 hatte in der Session-Timeline (SessionEventRow.tsx) fuer jeden Event ein klickbares Thumbnail-Bild. Klick oeffnete einen Fullscreen-Image-Modal (ImageViewer/FullscreenImageModal). Das war DIE Kernfunktion fuer Vertrauen zwischen Keyholder und Tragendem.

**Was in v3 da ist:**
- `SessionTimeline.tsx` (neu) zeigt NUR: Badge + Zeitstempel + optionale Notiz
- **Kein `imageUrl` Prop im TimelineEvent Interface** (Zeile 6-12)
- **Kein Thumbnail gerendert** (Zeile 82-99)
- **Kein ImageViewer/Fullscreen-Modal** eingebunden
- Die Serialisierung in `dashboard/page.tsx` (Zeile 99-104) uebergibt **kein imageUrl** an den DashboardClient

**Was existiert aber nicht genutzt wird:**
- `src/app/components/ImageViewer.tsx` existiert noch (wird in Forms genutzt, aber NICHT in der Timeline)
- `src/app/dashboard/SessionEventRow.tsx` (v2) existiert noch mit vollem Bild-Support

**Fix:**
1. `SessionTimeline.tsx`: `imageUrl?: string | null` zum TimelineEvent Interface hinzufuegen
2. Thumbnail rendern (klickbar, oeffnet ImageViewer/Fullscreen)
3. `dashboard/page.tsx`: `imageUrl` in der sessionEvents Serialisierung mitsenden
4. Alternative: Die v2 SessionEventRow.tsx wiederverwenden statt SessionTimeline

### Issue 2: Komplette Session-Liste (vergangene Sessions) fehlt auf dem Dashboard

**Schweregrad: KRITISCH** — Feature-Verlust

**Was verloren ging:**
Die v2 hatte `SessionList` + `SessionListClient` — ein Akkordeon aller vergangenen Sessions (VERSCHLUSS+OEFFNEN Paare) mit Dauer, Events, Thumbnails. Das war die primaere Art wie der User seine Historie sah.

**Was in v3 da ist:**
- Nur die **aktive Session** wird angezeigt (Zeile 209-220 in DashboardClient)
- Keine vergangenen Sessions
- Nur eine "Recent Entries" Liste mit den letzten 5 Eintraegen (flach, kein Pairing)
- `SessionList.tsx` und `SessionListClient.tsx` (v2) existieren noch aber werden NICHT mehr importiert

**Fix:**
1. Session-Liste aus v2 (`SessionList` + `SessionListClient`) zurueck ins Dashboard integrieren
2. Unterhalb der aktiven Session und der Stats anzeigen
3. Die Session-Liste nutzt `SessionEventRow.tsx` (v2) das Bilder hat

---

## KRITISCH — Navigation gebrochen

### Issue 3: Admin → Benutzer Navigation fehlt

**Schweregrad: KRITISCH** — Admin kann nicht zu Benutzern navigieren

**Was verloren ging:**
Die v2 BottomNav hatte 3 Tabs: Uebersicht, Neu(+), **Benutzer**. Der "Benutzer"-Tab fuehrte direkt zur User-Liste.

**Was in v3 da ist:**
- `AdminBottomNav.tsx` (Zeile 13-18): NUR 2 Tabs: "Uebersicht" + "Einstellungen"
- **Kein "Benutzer" Tab** in der BottomNav
- `AdminDesktopSidebar.tsx` (Zeile 33-37): NUR 3 Items: Uebersicht, Kontrollen, Einstellungen
- **Kein "Benutzer" Link** in der Desktop-Sidebar

**Konsequenz:**
- Die Admin-Uebersicht (admin/page.tsx) ZEIGT User-Cards — das ist quasi die Benutzer-Liste
- ABER: Wenn man in einem User-Detail ist (/admin/users/[id]/*), gibt es keinen Weg zurueck ausser Browser-Back oder Klick auf "Uebersicht"
- Das ist verwirrend weil "Uebersicht" nicht "Benutzer-Liste" suggeriert

**Fix:**
1. `AdminBottomNav.tsx`: "Benutzer" Tab hinzufuegen (Link zu `/admin`, Icon: Users)
2. Oder: BottomNav auf 3 Tabs erweitern: Uebersicht, Benutzer, Einstellungen (Benutzer = admin/page.tsx)
3. `AdminDesktopSidebar.tsx`: "Benutzer" navItem hinzufuegen

---

## HOCH — Visuelle Probleme

### Issue 4: Sekundaere Aktionen sehen aus wie Text, nicht wie Buttons

**Schweregrad: HOCH** — Funktionen nicht erkennbar

**Betroffene Stellen:**
- `DashboardClient.tsx` Zeile 248-261: "Pruefung erfassen" und "Orgasmus erfassen" nutzen `Button variant="ghost"`
- `variant="ghost"` = `bg-transparent text-foreground-muted` (Button.tsx Zeile 39)
- Kein Hintergrund, kein Border, kein Shadow — sieht aus wie ein Text-Label
- Neben dem grossen Primaer-Button (variant="primary" oder "semantic") fallen sie nicht als klickbar auf

**Fix:**
1. Sekundaere Aktionen als `Button variant="secondary"` (hat border + surface-bg)
2. Oder: `variant="ghost"` erhaelt mindestens einen sichtbaren Border: `border border-border`
3. Alternativ: Als kleine Cards mit Icon + Label darstellen (wie die v2 Typ-Auswahl)

### Issue 5: Primaer-Aktion Button sieht gleich aus wie Info-Banner

**Schweregrad: HOCH** — Verwirrung zwischen Action und Information

**Problem:**
Der Primaer-Button (z.B. "Oeffnen") nutzt `Button variant="semantic" semantic="lock"` = gruener Hintergrund.
Die Info-Banner (`LockRequestBanner variant="large" colorScheme="request"`) nutzen aehnliche farbige Hintergruende.
Der User kann nicht auf den ersten Blick unterscheiden: "Ist das ein Button den ich druecken soll oder ein Info-Element?"

**Fix:**
1. Primaer-Button klar als Button stylen: Abgerundeter Button mit Shadow + deutlichem "drueck mich" Look
2. Info-Banner klar als Banner: Flach, kein Shadow, Info-Icon vorne
3. Visueller Unterschied: Buttons haben `shadow-card` + `hover:shadow-raised` + Pfeil-Icon → Banner haben keins

---

## MITTEL — i18n Verstoesse

### Issue 6: Hardcoded Strings in mehreren V3-Dateien

**SessionTimeline.tsx** Zeile 27-31:
```
VERSCHLUSS: { label: "Verschluss" }
OEFFNEN: { label: "Oeffnen" }
PRUEFUNG: { label: "Pruefung" }
ORGASMUS: { label: "Orgasmus" }
REINIGUNG: { label: "Reinigung" }
```
→ Muessen i18n Keys sein

**SessionTimeline.tsx** Zeile 36: `"de-CH"` hardcoded
→ Muss aus Locale kommen

**DashboardClient.tsx** Zeile 292-295 (RecentEntry):
```
VERSCHLUSS: { label: "Verschluss" }
OEFFNEN: { label: "Öffnen" }
PRUEFUNG: { label: "Prüfung" }
ORGASMUS: { label: "Orgasmus" }
```
→ Muessen i18n Keys sein

**admin/users/[id]/eintraege/page.tsx**: "Alle Eintraege", "total", "Zurueck", "Weiter"
→ Muessen i18n Keys sein (wenn nicht bereits in v3 gefixt)

---

## MITTEL — Inkonsistenzen

### Issue 7: KontrolleButton/VerschlussAnforderungButton nutzen rohe textarea

**Betroffene Dateien:**
- `KontrolleButton.tsx` Zeile 73-79: Rohe `<textarea>` mit vollem inline Styling
- `VerschlussAnforderungButton.tsx` Zeile 97-103: Gleiche rohe `<textarea>`

**Sollte:** Die `Textarea` Shared Primitive nutzen (existiert in src/app/components/Textarea.tsx falls vorhanden)

### Issue 8: VerschlussAnforderungButton Submit nutzt inline style statt Button Primitive

**Datei:** `VerschlussAnforderungButton.tsx` Zeile 149-157
```jsx
<button style={{ backgroundColor: accentColor }}>
```

**Sollte:** `<Button variant="semantic" semantic={isAnforderung ? "request" : "sperrzeit"}>` nutzen

---

## Zusammenfassung — Priorisierte Fix-Liste

| Prio | Issue | Fix-Aufwand |
|------|-------|-------------|
| P0 | #1 Bilder ansehen fehlt komplett | 2-3h (imageUrl in Timeline, ImageViewer anbinden) |
| P0 | #2 Session-Liste fehlt komplett | 1-2h (v2 SessionList zurueck integrieren) |
| P0 | #3 Admin Benutzer-Navigation fehlt | 30min (Tab in BottomNav + Sidebar ergaenzen) |
| P1 | #4 Ghost-Buttons nicht als Buttons erkennbar | 30min (variant aendern oder Border ergaenzen) |
| P1 | #5 Button vs Banner visuell nicht unterscheidbar | 1h (Shadow/Arrow auf Buttons, Banner flach) |
| P2 | #6 Hardcoded i18n Strings | 1h (Keys anlegen + ersetzen) |
| P2 | #7 Rohe textarea statt Primitive | 15min pro Datei |
| P2 | #8 Inline style statt Button Primitive | 15min |
