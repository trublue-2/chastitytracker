# UX-Konsistenz — Befund und Fahrplan

Stand: 16.08.2026 · v5.2.0 · Branch `feat/ux-zeit` (P1 umgesetzt, siehe §7)

Vier unabhängige Prüfungen der Bedienoberfläche (Zeit/Fristen · Auswahl/Schalter · Listen/Historie ·
Erklärtexte). Dieses Papier hält ihr Ergebnis fest, **damit es nicht wiederholt werden muss** — die
Prüfung selbst war teuer, das Nachlesen ist es nicht.

| Dokument | Rolle |
|---|---|
| `ux-inventory.md` | die KARTE: welche Seite nutzt welches Bauteil (Stand v3.0.0, veraltet) |
| **dieses Dokument** | der BEFUND: verhält sich das Gleiche auch gleich — und was zu tun ist |
| `aufgaben-uebergabe.md` | der Aufgaben-Ausbau (Etappen 1–4), fachlich, unabhängig hiervon |

---

## 1. Anlass

Rückmeldung zum Aufgaben-Formular, wörtlich:

> „Der Text ist viel zu kompliziert!! Wenn man so viel schreiben muss, dann hat das Interface einfach
> eine schlechte UI/UX. Eine gute UX lässt sich einfach beschreiben."

Die Nachfrage danach — „zieht sich das Bedienkonzept durch, oder herrscht Wildwuchs?" — hat den
Befund unten ausgelöst. Der Nachweis-Block selbst ist in v5.1.5 bereits umgebaut (§7).

---

## 2. Der Befund

**Es ist kein Wildwuchs aus Konzeptlosigkeit — es sind halbfertige Vereinheitlichungen.** Die Regeln
existieren, sie stehen als Kommentar im Code, und jede endet an der Grenze des Umbaus, der sie
eingeführt hat.

Drei Belege, die das wörtlich machen:

- `FieldTabs.tsx` begründet, warum es **kein zweites** Segmented-Control geben darf —
  `SegmentedControl.tsx` existiert bereits und war das erste.
- `ConfirmDialog.tsx` schreibt fest, dass natives `confirm()` ausserhalb des Design-Systems steht —
  **acht** Stellen benutzen es, vier davon zerstörend.
- `ListPager.tsx` warnt vor genau der Duplikation, die zwei Eintragsseiten danebengebaut haben.

**Folge für den Aufwand:** es braucht kein neues Konzept, nur das Fertigstellen vorhandener. Das ist
der Grund, warum die Pakete in §4 klein sind.

---

## 3. Die Brüche

### 3.1 Zeit — acht Bedienformen

| Form | Wo |
|---|---|
| `DurationInput` (Reiter Std/Min über Zahlenfeld) | Kontroll-Frist, Aufgaben-Frist, Nachweis-Frist |
| `HoursInput` nackt (feste Einheit) | Verschluss-Frist, Mindest-Tragedauer, spätester Beginn |
| `FieldTabs` über zwei Antwort-Zweigen | drei Frist-Blöcke |
| `ScheduleFields` (Zahlenfeld + **Dropdown**) | Terminierung von Aufgabe und Verschluss |
| `DateTimePicker` | 13 Aufrufstellen |
| `NumberInput` in `InlineSettingRow` | Admin-Einstellungen |
| `TimeInput`/`TimeField` (HH:MM) | Reinigungsfenster, Auto-Kontrollen |
| `InputWithUnit` (privates Einzelstück) | Trainingsvorgaben |

Die zwei Brüche, die ein Nutzer wirklich merkt:

- **Die Einheiten-Frage steht zweimal im selben Formular** — als Reiter (Frist) und als Dropdown
  (Terminierung), auf einem Scroll-Weg. Dazu abweichende Raster: „Versand in 7 Minuten" geht,
  „Frist 7 Minuten" nicht.
- **„Frist" heisst in zwei Formularen Verschiedenes.** Kontrolle: Reiter *Stunden | Minuten*
  (Einheit). Verschluss: Reiter *Dauer (h) | Bis Datum* (Antwort-Art). Gleiches Wort, gleiche
  Position, gleiches Bauteil. Wer den zweiten Reiter tippt, um auf Minuten zu stellen, landet im
  Datums-Wähler — und findet die Minuten dort gar nicht (30-Minuten-Schritte, während die
  Kontrollfrist nebenan 5 erlaubt).

Weiter: `ScheduleFields` hat `HoursInput` von Hand nachgebaut (die vierte Kopie, vor der dessen
Kommentar warnt) · der Reiter „Uhrzeit" liefert Datum **und** Uhrzeit (das Bauteil ist richtig, das
Wort nicht) · die Trainingsvorgaben brechen als einzige Stelle **jedes** Bauteil gleichzeitig und
sind die einzige Abweichung **ohne** erklärenden Kommentar · „Zeitpunkt in der Zukunft" wird an vier
Orten auf vier Arten durchgesetzt (rote Zeile / stummer Browser-Tooltip / anderer Text / gar nichts).

### 3.2 Schalter — die halbe Beschriftung

Der Kernsatz der Text-Prüfung:

> Diese App schreibt keine zu langen Texte, sie schreibt zu viele davon nebeneinander — und der
> häufigste Grund ist ein **Schalter, der nur die Hälfte seiner Zustände beschriftet**.

Zahlen dazu: 1692 Strings, **kein einziger über 35 Wörter**. Aber die Einstellungsseite rendert 14
Erklärtexte auf einem Bildschirm, die Aktionen-Seite elf. Sechs bis acht Texte existieren
ausschliesslich, um den unbeschrifteten AUS-Zustand nachzureichen („Aus: …", „Sonst …", „Ohne …").

Verstärker: `SettingsSection.description` ist optional und in **12 von 13** Abschnitten gefüllt. Ein
optionales Feld, das nie leer bleibt, lädt jeden neuen Abschnitt zum Mitschreiben ein.

**Toggle gegen Checkbox:** die Hausregel lautet *Toggle = wirkt sofort, Checkbox = wirkt beim
Absenden*. Die fünf Checkboxen halten sie zu 100 %, die 21 Toggles zu zwei Dritteln — sechs sind
reiner Formular-Zustand. Strukturelle Ursache: `Toggle` hat `description`, `Checkbox` nicht. Wer eine
Erklärung braucht, MUSS zum Toggle greifen.

### 3.3 Listen — zwei Bauweisen, sichtbar übereinander

Auf der Keyholder-Übersicht stehen beide Familien in einer Spalte: handgebaute Hülle (`rounded-2xl`)
über `Card` (`rounded-xl`), `px-5`-Zeilen über `px-4`-Zeilen. Die Zeilen fluchten nicht. **Zehn**
handgebaute Hüllen, **sieben** handgeschriebene Kopfzeilen — obwohl `SettingsSection` sie exakt
kapselt (genutzt für Listen an genau einer Stelle: der frisch umgebauten Aufgaben-Seite).

**Acht Varianten**, offen von erledigt zu trennen: zwei Abschnitte · zwei Abschnitte mit
verschiedenen Objekten · Umschalt-Knopf am Fuss · ein Umschalter für 13 Abschnitte · gar nicht ·
Trennung durch den ORT · Filterleiste · Abschneiden mit „Alle →". Derselbe Gegenstand hat je nach
Seite eine andere: Aufgaben stehen in drei Sichten mit drei Trennungen.

Dazu: **das Strafbuch hat keinen Pager** — die Seite ohne jede Kappung, mit drei Urteilsknöpfen pro
Zeile · zwei handgebaute Blätter-Zeilen mit `aria-disabled`-Link statt `button disabled` (bleibt
tabbar und per Enter auslösbar) · vier handgeschriebene Leerzustände neben elf `EmptyState`, mit vier
verschiedenen Icon-Grössen · eine offene Aufgabe erscheint auf dem Sub-Dashboard **zweimal**.

### 3.4 Aktionen — fünf Arten zu löschen

Roter Knopf · Kebab-Eintrag mit `danger` · neutraler Knopf · warne Pille · Icon, das erst beim Hover
rot wird. Innerhalb *eines* Features (Posteingang) einmal `ghost`, einmal `danger`.

Bestätigung: **acht** `window.confirm` trotz gegenteiliger, ausformulierter Regel — vier davon
zerstörend (`DeleteVorgabeButton`, `DeleteUserButton`, `PasskeyManager`, `RoleSelect`). Dazu drei
verschiedene Knopf-Anordnungen im Bestätigungs-Dialog.

**Barrierefreiheit:** `SegmentedControl` hat **kein einziges** ARIA-Attribut — drei namenlose
Schaltflächen ohne Hinweis, welche gewählt ist. Die Zwillings-Komponente `Tabs` macht es vollständig
richtig (`role`, Pfeiltasten, Fokusring). Ausserdem: fest verdrahtetes Deutsch in geteilten
Primitiven (`Button`, `Spinner`, `Pill`) — die eine Schicht, die kein Aufrufer überschreiben kann.

### 3.5 Verwaiste Erklär-Orte

- **`/info/[lang]`**: 428 Zeilen zweisprachiger Inhalt, hartkodiert, **null** Verweise aus der App.
- **`/dashboard/regeln`**: gebaut, als Heimat der Sub-Regeln gedacht, wird nicht als Ziel genutzt.
- **`HelpLink` + `inspectionHelpUrl`**: fertig, locale-bewusst — **zwei** Verwendungen.
- Die **Marketing-FAQ** deckt inhaltlich bereits ab, was in der App als Prosa herumliegt.

Vier Orte für Erklärungen, drei davon ungenutzt: es fehlt nicht das Werkzeug, sondern die Gewohnheit.

---

## 4. Die Pakete

| # | Inhalt | Aufwand | Gewinn |
|---|---|---|---|
| ~~**P1**~~ | ~~**Zeit.**~~ **ERLEDIGT (v5.1.6)**, siehe §7. Schnellwahl-Knöpfe von `TaskFields` nach `DurationInput` (dann haben ALLE Fristen Zwei-Tap-Bedienung) · `ScheduleFields` auf `DurationInput` · Verschluss-Frist angleichen · Einheiten-Vokabular auf `common`, Regel „Einheit im Reiter ODER als Suffix, nie in der Feldbeschriftung" | ~½ Tag | eine Art, eine Dauer einzugeben; grösster Handy-Gewinn |
| **P2** | **Schalter zu Ende beschriften.** `Checkbox` bekommt `description` · sechs bis acht „Aus: …"-Texte durch Zwei-Zustands-Bedienung ersetzen · zwei rohe 16-px-Kästchen ersetzen | klein–mittel | schafft eine ganze TEXTKLASSE ab |
| **P3** | **Listen.** `SettingsSection` um Zähler/Aktion erweitern, sieben Kopfzeilen darauf ziehen · zwei handgebaute Pager durch `ListPager` (behebt a11y) · **Strafbuch bekommt einen Pager** | mittel | räumt Radius- und Padding-Bruch mit ab |
| **P4** | **Bestätigen & Löschen.** Acht `confirm()` auf `ConfirmDialog` · EINE Zielform für Löschen · `SegmentedControl` bekommt ARIA · Deutsch aus den Primitiven | klein–mittel | der Code behauptet die Regel bereits |
| **P5** | **Texte umlagern.** 13 → 4 Abschnitts-Beschreibungen · `HelpLink` konsequent · `/dashboard/regeln` als Heimat · Entscheidung über `/info` | mittel | ~130 Wörter allein von einer Seite |

Reihenfolge innerhalb P1: Schnellwahl → `ScheduleFields` → Verschluss-Frist → Vokabular. Sie hängen
zusammen; einzeln gemacht entsteht ein Zwischenzustand mit drei Einheiten-Formen statt zwei.

---

## 5. Was NICHT vereinheitlicht werden darf

Die Prüfer waren hier von sich aus streng — das ist so wichtig wie die Fundliste:

- **Einstellungen ≠ Formulare.** `NumberInput`/`TimeInput` committen beim Verlassen und klemmen dann.
  Anderer Bedienvertrag, mit einem dokumentierten Handy-Schaden hinter der Begründung.
- **`HoursInput` ohne Umschalter bei der Mindest-Tragedauer** — die fehlende Wahl ist eine AUSSAGE
  (die Grösse lebt in Vielfachen von 24), kein Versäumnis. Bei der Verschluss-FRIST trägt dasselbe
  Argument nicht.
- **Karten-Stapel vs. Zeilen-Liste** bei Aufgaben: offen braucht Bedingungen und Knopf, archiviert
  nicht. Nur die TRENNUNG sollte überall dieselbe sein, nicht die Form.
- **Die drei `FieldTabs` im Aufgaben-Formular zu einem Bauteil zusammenzufassen.** Sie stellen drei
  Fragen (Anker, Einheit, Eingabesprache); ein Bauteil für alle drei wäre ein Props-Sumpf. Das
  Problem ist nicht ihre Zahl, sondern dass man ihnen die Verschiedenheit nicht ansieht.
- **`step="any"` in den Trainingsvorgaben** — dokumentiert einen echten Vorfall: ein fester `step`
  blockierte das gesamte Absenden.
- **Die ehrlichen Texte:** „kann die App nicht messen", „gilt ab jetzt und schreibt die Vergangenheit
  nicht um", der Datenschutz-Hinweis, der Platzhalter als Beispiel. Das Wertvollste im Textbestand.
- **Wegblenden leerer Blöcke auf dem Dashboard** (nicht aber auf einer Reiter-Seite: dort ist die
  leere Liste die Antwort auf die Frage, die der Klick gestellt hat).

---

## 6. Produktentscheidungen

### Getroffen am 16.08.2026 — vor Beginn der Umsetzung

1. **Die Versand-Verzögerung übernimmt das 5-Minuten-Raster.** Sie nutzt danach dasselbe Bauteil und
   dasselbe Raster wie jede andere Dauer; „in 3 Minuten" entfällt und ist für eine Terminierung keine
   relevante Grenze. Ohne das bliebe eine zweite Raster-Variante im selben Bauteil — genau die
   Abweichung, die P1 abbaut.
2. **Die Einschliess-Frist geht auf 5-Minuten-Schritte.** Begründung: ist eine Kontrollfrist von 15
   Minuten sinnvoll, ist eine Einschliess-Frist von 45 Minuten es auch. Sie bekommt damit auch den
   Stunden/Minuten-Umschalter, den der Nutzer nach der Kontroll-Anforderung dort erwartet.
3. **(umgesetzt, v5.2.0) Die Orgasmus-Anforderung wird terminierbar** — voller Ausbau: `min` an beiden Feldern und
   Zonen-Rechnung wie im Rest der Datei (das ist der Fehler, kein Geschmack), dazu ein Dauer-Weg
   fürs Fenster-Ende (Reiter „Dauer | Zeitpunkt", Vorgabe 24 h) und `ScheduleFields` wie bei Aufgabe
   und Verschluss-Anforderung. Sie ist danach keine Ausnahme mehr.
5. **`/info/[lang]` bleibt vorerst liegen.** Es ist eine Inhalts-Entscheidung, keine Bedien-Frage,
   und sie berührt die Marketing-Seite. Nicht Teil der Aufräumarbeiten — aber der Zustand (drei
   parallel gepflegte Wahrheiten) bleibt hiermit notiert.

### Noch offen

4. **Aufgaben-Doppelung auf dem Sub-Dashboard:** ist die untere Liste ein Archiv
   (`!belongsOnDashboard`), oder bekommt sie zwei Abschnitte wie beim Keyholder? Hängt an P3 und
   blockiert die anderen Pakete nicht. Heute erscheint eine offene Aufgabe auf einem Bildschirm
   zweimal.

---

## 7. Was bereits umgesetzt ist

**v5.1.5** (Commit `25f401a`) hat den Auslöser behoben und dabei zufällig die richtige Klasse
getroffen (§3.2, Muster „halbe Beschriftung") — an EINER von acht Stellen:

- Nachweis-Frist als Reiter „Am Ende | Früher" statt leerem Feld mit unsichtbarer Bedeutung.
- Der Nachweis-Block steht jetzt UNTER dem Frist-Block: er wird gegen das Aufgaben-Ende gemessen,
  darüber stehend gab man ihn ein, bevor es das Ende gab.
- Zwei lange Hinweise gestrichen, Reihenfolge-Schalter mit Folgesatz.
- Aufgaben-Seite: zwei Abschnitte, Blätter-Zeile, zurückgezogene Aufgaben löschbar.

**Zwei Befunde treffen genau diesen Commit** und sind offen:

- Der neue `Toggle` im Nachweis-Block ist reiner Formular-Zustand und müsste nach der Hausregel eine
  `Checkbox` sein — die aber kein `description` hat (P2 löst beides zusammen).
- `DeleteTaskButton` ist die dritte von fünf Lösch-Formen, und die einzige in NEUTRALER Tönung für
  eine zerstörende Aktion (P4).

Dazu: der Kommentar in `TaskFields.tsx` über den „Aufklapper" beschrieb einen Zustand, den es seit
`58fad25` nicht mehr gibt — mit v5.1.6 weg.

**v5.1.6 — Paket P1 (Zeit), alle vier Schritte:**

- Die Schnellwahl sitzt in `DurationInput`; jede Frist hat damit Zwei-Tap-Bedienung. Wählbar ist nur
  die SKALA (`DURATION_QUICK_HOURS.short/.long`) — die kurze Reihe unter einem Feld mit Vorgabe 24 h
  böte fünf Knöpfe an, von denen jeder den sinnvollen Wert überschreibt.
- `ScheduleFields` und die Verschluss-Frist nehmen dasselbe Bauteil. Die Einheiten-Frage steht damit
  nur noch EINMAL je Formular, und die Reiter benennen die Antwort-Art („Dauer | Zeitpunkt"), nicht
  die Einheit.
- Vokabular in `common` (`duration`, `pointInTime`, `quickHours`, `quickMinutes`); acht verwaiste
  `admin.*`-Schlüssel und drei Doppelgänger sind weg.
- Neu dabei: `FieldTabs` und `DurationInput` dürfen ihre sichtbare Beschriftung weglassen, wo der
  Umschalter darüber sie schon trägt (`ariaLabel` statt `label`) — sonst stünde „Dauer" über „Dauer".

**v5.2.0 — Entscheid 3 (§6): die Orgasmus-Anforderung ist keine Ausnahme mehr.** `min` an beiden
Feldern, Zonen-Rechnung wie im Rest der Datei, Fenster-Ende wahlweise als Dauer (Vorgabe 24 h) oder
Zeitpunkt — und terminierbar wie ihre drei Geschwister (`wirksamAb`/`benachrichtigtAt`, Zustellung
über den Poller). `TimePreview` ist damit an der Schwelle „zweites Formular" nach
`src/app/components/` gezogen, die sie selbst ausgeschrieben hatte, und der Block „Dauer | Zeitpunkt"
ist als `DurationOrDatetimeField` extrahiert (vierte Kopie).

Zwei Nebenwirkungen, bewusst in Kauf genommen:

- **`min` am Fenster-START nimmt dem Formular das Rückdatieren.** Der Dienst erlaubt es weiter (ein
  rückwirkend geöffnetes Fenster ist ein legitimer Fall, so steht es an `checkOrgasmWindowEnd`), über
  den MCP bleibt es erreichbar. Wer es im Formular wieder braucht, streicht ein Attribut.
- **Der Poller kann eine Zustellung doppelt versenden**, wenn zwischen Auswahl und Versand
  zurückgezogen wird — dieselbe Schwäche wie beim Verschluss-Zwilling daneben, nicht neu und nicht
  hier allein zu beheben.

**Noch offen aus P1s Umfeld** (kein Teil des Pakets, beim Umbau aufgefallen):

- Der späteste Beginn im Aufgaben-Formular bleibt ein nacktes Minuten-Feld. `DurationInput` kann
  seinen Bereich nicht ausdrücken: die Kulanz darf 0 sein („sofort anlegen"), das Raster nicht.
- Die Trainingsvorgaben (`InputWithUnit`) bleiben der letzte private Nachbau — ihr Umschalter wählt
  h gegen %, nicht h gegen min. Gehört zu keinem der fünf Pakete.

---

## 8. Arbeitsweise für die Umsetzung

Aus der Erfahrung dieser Sitzung, verbindlich für die nächste:

- **Diese Prüfung wird nicht wiederholt.** Sie hat vier parallele Durchgänge gekostet; ihr Ergebnis
  steht hier. Wer ein Paket umsetzt, liest §3 und §5 — er prüft nicht neu.
- **Prüf-Durchgänge werden gebündelt, nicht gestreut.** Ein Durchgang je Blickwinkel, alle
  gleichzeitig gestartet, danach ausgewertet. Kein Nachfassen „nur noch eben".
- **Kein Worktree ohne parallele Arbeit.** Die Regel im Workspace-`CLAUDE.md` verlangt ihn für
  NEBENLÄUFIGE Sitzungen. Eine Sitzung, die allein arbeitet, legt keinen an — und räumt ihn sonst
  am Ende weg (`git worktree remove`).
- **`/simplify` und `/code-review` bleiben Pflicht**, gerade hier: der halbe Zweck der Pakete ist
  Duplikat-Abbau, und ein Umbau ohne Prüfung erzeugt die nächste halbfertige Vereinheitlichung.
- **Jedes Paket ist ein eigener Commit** mit eigenem Bump-Entscheid. P1 bis P5 sind bewusst
  unabhängig geschnitten; sie in einem Zug zu machen wäre der grosse Umbau, den niemand reviewen
  kann.
