# Dauer-Formate und Prozentwerte — Gegenüberstellung

**Analyse, keine Umsetzung.** Grundlage für die Entscheidung, welche Schreibweise gewinnt
(Redesign-Etappe A). Alle Werte in den Tabellen sind ausgerechnet, nicht geschätzt.

## 1 · Was heute existiert

Acht Schreibweisen, 58 Anzeigestellen.

| Formatter | Ort | Stellen |
|---|---|---|
| `formatHours` | `utils.ts:23` | 22 |
| `formatMs` | `utils.ts:96` | 11 |
| `formatElapsedMs` | `utils.ts:425` | 10 |
| `formatDuration` | `utils.ts:107` | 8 |
| `formatHoursHM` | `utils.ts:5` | 3 |
| `formatHoursHMCompact` | `utils.ts:13` | 2 |
| `TimerDisplay` `format="long"` | `TimerDisplay.tsx:19` | 1 |
| `TimerDisplay` `format="short"` | `TimerDisplay.tsx:31` | 1 |

Dieselbe Dauer durch alle acht (deutsche Fassung):

| Fall | HoursHM | HoursHMCompact | Hours | Ms | Duration | Elapsed | Elapsed+s | Timer long | Timer short |
|---|---|---|---|---|---|---|---|---|---|
| 45 s | `0:00h` | `0:00` | `0h` | `–` | `0min` | `0min` | `0min 45s` | `0m` | `00:45` |
| 7 min | `0:07h` | `0:07` | `0h` | `7m` | `7min` | `7min` | `7min 00s` | `7m` | `07:00` |
| 59 min | `0:59h` | `0:59` | `1h` | `59m` | `59min` | `59min` | `59min 00s` | `59m` | `59:00` |
| 1 h 05 | `1:05h` | `1:05` | `1h` | `1h 5m` | `1h 5min` | `1h 5min` | `1h 5min 00s` | `1h 5m` | `1:05:00` |
| 17 h 26 | `17:26h` | `17:26` | `17h` | `17h 26m` | `17h 26min` | `17h 26min` | `17h 26min 00s` | `17h 26m` | `17:26:00` |
| 23 h 59 | `23:59h` | `23:59` | `24h` | `23h 59m` | `23h 59min` | `23h 59min` | `23h 59min 00s` | `23h 59m` | `23:59:00` |
| 24 h 00 | `24:00h` | `24:00` | `1T` | `1T` | `1T` | `1T 0min` | `1T 0min 00s` | `1d 0h 0m` | `24:00:00` |
| 2 T 3 h 14 | `51:14h` | `51:14` | `2T 3h` | `2T 3h` | `2T 3h 14min` | `2T 3h 14min` | `2T 3h 14min 00s` | `2d 3h 14m` | `51:14:00` |
| 5 T 0 h 30 | `120:30h` | `120:30` | `5T 1h` | `5T` | `5T 30min` | `5T 30min` | `5T 30min 00s` | `5d 0h 30m` | `120:30:00` |
| 54 T 7 h 02 | `1303:02h` | `1303:02` | `54T 7h` | `54T 7h` | `54T 7h 2min` | `54T 7h 2min` | `54T 7h 2min 00s` | `54d 7h 2m` | `1303:02:00` |
| 0 | `0:00h` | `0:00` | `0h` | `–` | `0min` | `0min` | `0min 00s` | `0m` | `00:00` |

## 2 · Fünf Fehler, die dabei aufgefallen sind

Das sind keine Stilfragen. Sie stehen heute so auf dem Schirm.

1. **`formatHours` rundet auf und lügt an der Tagesgrenze.**
   23 h 59 min zeigt **`24h`** — liest sich wie ein voller Tag, war aber eine Minute kürzer.
   5 T 0 h 30 min zeigt **`5T 1h`**. Betroffen sind 22 Stellen, darunter Tragekalender
   (`CalendarContainer.tsx:128`) und Monatsübersicht (`MonthStats.tsx:39`) — genau die Stellen,
   an denen jemand nachzählt, ob ein Tagesziel erreicht wurde.

2. **`formatMs` zeigt „–" für alles unter einer Minute.**
   Eine 45-Sekunden-Session erscheint in Gesamtdauer, Durchschnitt und Rekorden als Strich, also
   wie „kein Wert". Betroffen: `StatsMain.tsx:253–257, 306, 307, 419, 420`.

3. **`formatMs` unterschlägt Minuten, sobald Tage im Spiel sind.**
   5 T 0 h 30 min und 5 T 0 h 00 min zeigen beide **`5T`**. Zwei verschiedene Rekorde, eine Zahl.

4. **Der Live-Timer im offenen Dashboard spricht Englisch.**
   `TimerDisplay` `format="long"` schreibt `d` / `h` / `m` fest verdrahtet — kein Locale-Parameter
   (`TimerDisplay.tsx:19–27`). Ein deutscher Nutzer liest im Zustand „geöffnet seit" **`2d 3h 14m`**
   statt `2T 3h 14min`. Es ist die grösste Zahl auf diesem Bildschirm.

5. **Die Null ist zweierlei.** `formatMs(0)` = `–`, `formatDuration(0)` = `0min`,
   `formatHours(0)` = `0h`.

Zwei weitere Eigenheiten sind vertretbar, gehören aber benannt: `formatHoursHM` faltet Tage in
Stunden (`1303:02h` für 54 Tage) — unter 24 h gut lesbar, darüber nicht. Und `formatElapsedMs`
schreibt `1T 0min`, lässt also die Null-Stunde weg statt sie zu zeigen.

## 3 · Die drei Kandidaten

Regel für alle drei: unter einer Minute `<1min` statt `–` oder `0min` (behebt Fehler 2 und 5).
Keine Rundung nach oben (behebt Fehler 1).

| Fall | **A** tabellarisch | **B** wortteilig | **C** gemischt | Uhr (live, unverändert) |
|---|---|---|---|---|
| 45 s | `<1min` | `<1min` | `<1min` | `00:45` |
| 7 min | `0:07 h` | `7min` | `0:07 h` | `07:00` |
| 59 min | `0:59 h` | `59min` | `0:59 h` | `59:00` |
| 1 h 05 | `1:05 h` | `1h 5min` | `1:05 h` | `1:05:00` |
| 17 h 26 | `17:26 h` | `17h 26min` | `17:26 h` | `17:26:00` |
| 23 h 59 | `23:59 h` | `23h 59min` | `23:59 h` | `23:59:00` |
| 24 h 00 | `1T 00:00 h` | `1T` | `1T` | `24:00:00` |
| 2 T 3 h 14 | `2T 03:14 h` | `2T 3h 14min` | `2T 3h 14min` | `51:14:00` |
| 5 T 0 h 30 | `5T 00:30 h` | `5T 30min` | `5T 30min` | `120:30:00` |
| 54 T 7 h 02 | `54T 07:02 h` | `54T 7h 2min` | `54T 7h 2min` | `1303:02:00` |
| 0 | `0:00 h` | `0min` | `0:00 h` | `00:00` |

**A — tabellarisch überall.** Feste Breite, Ziffern springen nicht, passt zum Gestaltungs-Entwurf
(tabellarische Ziffern, Ziffern statt Worte). Schwäche: `5T 00:30 h` ist umständlich, und die
Doppelpunkt-Schreibweise legt eine Uhrzeit nahe, wo eine Dauer gemeint ist.

**B — wortteilig überall.** Am nächsten am heutigen Hauptbestand (`formatDuration`, 8 Stellen,
und `formatElapsedMs`, 10 Stellen, arbeiten schon so). Schwäche: variable Breite — in einer Liste
untereinander flattert die Spalte, und die Zielbalken (`17:26 / 20:00h`) müssten umgestellt werden.

**C — gemischt nach Grösse.** Unter einem Tag tabellarisch, ab einem Tag wortteilig. Fängt die
Schwäche beider: kein `1303:02 h`, kein flatterndes `0:07 h` in der Tagesspalte. Schwäche: zwei
Erscheinungsformen, die Grenze muss man kennen.

**Die laufende Uhr bleibt in allen drei Fällen eigen** (`17:26:00`, mit Sekunden, Tage in Stunden
gefaltet). Sie tickt und muss deshalb feste Breite haben; der Kommentar an `TimerDisplay.tsx:29`
begründet das bereits. Sie zu vereinheitlichen hiesse, jede Anzeige über 24 h zu ändern.
Zu entscheiden ist also die **statische** Dauer, nicht die Uhr.

## 4 · Prozentwerte — drei Bedeutungen, ein Zeichen

Nicht zwei widersprüchliche Werte, sondern drei verschiedene Fragen, die alle als nacktes `%`
mit Balken erscheinen.

| Bedeutung | Nenner | Beantwortet | Stellen |
|---|---|---|---|
| **Zielerfüllung** | das Ziel | „Wie viel vom Soll habe ich?" | `LiveTrainingGoals.tsx:9` · `CategoryGoalsLive.tsx:115` · `StatsMain.tsx:484` · `statsBuilders.ts:182` · `mcp/format.ts:4` |
| **Zeitanteil** | verstrichene Zeit | „Welchen Teil des Tages war ich verschlossen?" | `DashboardClient.tsx:48` · `statsBuilders.ts:336` · `VorgabeRow.tsx:58/64/70/76` · `VorgabeForm.tsx:57` |
| **Verteilungsanteil** | eine Summe | „Wie viel entfällt auf dieses Gerät?" | `StatsMain.tsx:260` (heisst schon `sharePct`) |

**Der Widerspruch auf dem Sub-Dashboard:** in der Kachel „Heute" steht `17:26h` mit einem Balken
und darunter **`81 %`** (Anteil der bisher verstrichenen Tagesstunden). Wenige Zeilen darüber, in
der grünen Session-Karte, steht dieselbe Dauer als `17:26 / 20:00h` mit **`87 %`** (Anteil am
Tagesziel). Beide Zahlen sind richtig. Keine von beiden sagt, wovon sie ein Anteil ist.

**Das Muster, das es schon richtig macht:** die Jahresübersicht schreibt
`„{percent}% des Jahres verschlossen"` (`stats.percentLocked`) — Zahl und Nenner in einem Satz.
Diese Form ist der Massstab für die anderen Stellen.

**Vorschlag:** ein Modul mit drei benannten Funktionen — `goalPct()` / `coveragePct()` /
`sharePct()` — statt sechs Stellen, die `Math.round(a / b * 100)` je selbst schreiben.
`mcp/format.ts:pct` wird `goalPct` und importiert von dort, führt also keine zweite Rechnung mehr.
Jede Anzeigestelle bekommt eine Beschriftung aus i18n; ein nacktes `%` ohne Nenner ist danach ein
Fehler, kein Stil.

## 5 · Doppelte Überschrift

`dashboard.trainingGoals` = **„Trainingsvorgaben"** trägt auf demselben Bildschirm zweierlei:

- die **KG-Ziele** aus `TrainingVorgabe` — `LiveTrainingGoals.tsx:47`
- die **Kategorie-Ziele** (Plug, Halsband, …) — `CategoryGoalsLive.tsx:43`

Dazu existiert `stats.trainingGoals` = „Trainingsziele" als dritter, ähnlich klingender Schlüssel
für wieder etwas anderes (`admin/users/[id]/page.tsx:288`).

Aufzuspalten in zwei eindeutige Schlüssel, in `de.json` **und** `en.json`.

## 6 · Nebenwirkungen einer Umstellung

- **Der MCP ist nicht betroffen.** Er liefert rohe Zahlen (`durationHours`, `durationMinutes`),
  keine formatierten Zeichenketten. Die Keyholder-KI sieht von der Änderung nichts.
- **Eine Mail ist betroffen:** `entryNotify.ts:123` formatiert die Tragedauer für die
  Benachrichtigung mit `formatDuration`.
- **Spaltenbreiten:** `LiveTrainingGoals.tsx:17` reserviert `w-[7.5rem]` für `17:26 / 20:00h`.
  Kandidat B braucht dort mehr Platz.
- **Sichtbar mehr Minuten:** wo heute `formatHours` rundet, erscheinen nach der Umstellung echte
  Minuten. Das ist die Absicht — es sieht aber auf den ersten Blick nach geänderten Zahlen aus.
- **Zwei Tests hängen dran:** `utils.test.ts` und `utils.time.test.ts` prüfen die heutigen
  Formatierer und müssen mitwandern.

## 7 · Was danach das Zurückfallen verhindert

Nach Vorbild des Funktionsmodells (`funktionsmodellRegistry.ts` + `funktionsmodellSurfaces.ts` +
`funktionsmodellDoc.test.ts`):

- ein getipptes Register der erlaubten Dauer- und Prozent-Arten mit Bedeutung, Nenner, Code-Anker,
- ein Scanner, der die tatsächlichen Anzeigestellen aus dem Quelltext liest,
- ein Test, der bei einer Stelle ohne Registereintrag bricht — und bei einem Registereintrag ohne
  Stelle.

Damit ist die Wiederkehr ein roter Test statt eines Befunds in zwei Jahren.

## Entschieden und umgesetzt

**Kandidat B — wortteilig** (22.08.2026, v5.3.1). `formatDurationMs` / `formatDurationHours` /
`formatDurationBetween` sind die eine Familie; `formatElapsedMs` bleibt als laufende Fassung
daneben (zeigt die Minute auch bei null), die Uhr in `TimerDisplay` unverändert.

Was die Umsetzung zusätzlich zutage gefördert hat — der Scanner findet, was ein
Suchen-und-Ersetzen nicht sieht:

- **Drei weitere selbstgebaute Dauer-Fassungen**, die keinen der acht Formatierer aufriefen: eine
  Tage/Stunden-Zerlegung in der Sub-Detailseite (mit fest verdrahtetem deutschem „T"), ein
  `6.5h`-Tooltip im Tragekalender, eine dritte Zerlegung in der Einschliess-Mail.
- **Zwei übersehene Prozent-Stellen** (Monatsübersicht, Ziel-Formular).
- **Ein Gleitkomma-Rest:** `(2 + 3/60) * 3_600_000` ergibt 7 379 999.999… — ohne Rundung auf die
  Millisekunde stünde „2h 2min" für zwei Stunden und drei Minuten.
- **Ein Locale-Vorgabewert als Falle:** `locale = "de"` liess die drei Dashboard-Kacheln und die
  Eintrags-Mail stillschweigend deutsch bleiben. `locale` ist jetzt Pflicht; der Compiler fragt.
- **Zwei Layout-Brüche**, erst am laufenden Bild sichtbar: die Jahres-Zeile der Zielbalken drückte
  den Balken auf einen Stummel und schnitt `433 %` ab; die Monats-Kachel brach auf drei Zeilen.
