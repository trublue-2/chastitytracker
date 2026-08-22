# Gewichtstracking: Wiegen, Grenzen, Verlauf

**Status:** Planung — noch keine Zeile Code. **Alle Grundsatzfragen sind entschieden** (22.08.2026);
offen ist noch ein einziger Punkt, siehe Abschnitt 13.
**Erstellt:** 2026-08-22 · **Entscheidungen eingearbeitet:** 2026-08-22
**Branch:** `feat/weight-tracking` (Worktree `../kg-weight`, abgezweigt von `main` @ a7b0001, v5.2.9)
**Auslöser:** Anfrage aus der Nutzerschaft, ergänzt um eine handschriftliche Detailskizze. Aus
„Verlauf ohne Folgen" wurde dabei eine **Pflicht mit Frist**, deren Versäumnis ins Strafbuch fällt.

---

## 1. Der Zuschnitt in einem Absatz

Der Sub trägt sein Gewicht regelmässig ein, in einem täglichen Zeitfenster, mit einem Foto der Waage
als Beleg. Die Keyholder sehen jederzeit alles. **Zwei Dinge werden auseinandergehalten:**

| | Auslöser | Folge |
|---|---|---|
| **Versäumte Meldung** | mehr als 3 Tage ohne Angabe | **automatisch** ein Vergehen im Strafbuch |
| **Grenze über-/unterschritten** | Gewicht ausserhalb des Korridors | **nur eine Meldung** an die Keyholderin — sie entscheidet: Aufgabe als Strafe, Aufgabe als Belohnung, oder nichts |

Diese Trennung ist der Kern. Die **Pflicht** ist maschinell prüfbar (er hat gemeldet oder nicht) und
darf deshalb automatisch zählen. Das **Gewicht selbst** ist es nicht: eine Zahl auf der Waage ist
kein Fehlverhalten, und ein Automatismus, der Kilos in Strafen umrechnet, wäre in einer App mit
diesem Machtgefälle die falsche Mechanik. Die Skizze sieht das genauso — „Meldung → KH →" mit einem
Pfeil auf eine *Entscheidung*, nicht auf eine Buchung.

## 2. Rollen und Rechte

| | Sub | Keyholder |
|---|---|---|
| Feature freischalten | — | **ja, nur sie** |
| Körpergrösse, Referenzangabe | setzt | liest |
| Einheitensystem | eigene Anzeige-Präferenz | eigene Anzeige-Präferenz |
| Grenzwerte (Min/Max) | **setzt** | darf nur **weiten**, nie verengen (Abschnitt 7) |
| Wiege-Zeitfenster | liest | setzt |
| Gewicht erfassen | ja, **mit Foto** | ja (für den Sub), ohne Fotozwang |
| Verlauf sehen | ja | **alle** Keyholder dieses Subs, jederzeit, vollständig |
| Über MCP | — | lesen und schreiben |

**Nur die Keyholderin schaltet frei** — wie `reinigungErlaubt`. Es gibt keinen Selbst-Tracker-Modus
ohne Keyholderin; das hielte zwei Betriebsarten in einem Feature.

**Alle Keyholder eines Subs sehen die Werte**, nicht nur die freischaltende. Einschlüsse,
Kontrollen und Strafbuch sind es ebenfalls — eine Sonderregel nur für dieses Feature bräuchte ein
Sichtbarkeitskonzept, das es sonst nirgends gibt.

Die Einheit ist eine **Anzeige**-Eigenschaft je Person, keine Eigenschaft der Daten: eine
Keyholderin in den USA sieht Pfund, während ihr Sub in Kilogramm einträgt. `unitSystem` hängt an
dem, der schaut — nicht an dem, über den geschaut wird.

## 3. Datenmodell

### 3.1 Eigenes Modell, nicht `Entry`

`Entry` ist vollständig verschluss-/geräteförmig (`deviceId`, `kontrollCode`, `verifikationStatus`,
`keyInBox`, `boxImageUrl` …). Ein Gewicht teilt davon nichts und käme mit rund zwanzig dauerhaft
leeren Spalten hinein.

```prisma
model WeightEntry {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  measuredAt    DateTime                    // Zeitpunkt der Messung
  dayKey        String                      // tzDayKey(measuredAt, user.timezone), "YYYY-MM-DD"
  weightKg      Float                       // IMMER metrisch gespeichert
  inWindow      Boolean  @default(true)     // lag measuredAt in einem Wiege-Fenster?
  imageUrl      String?                     // Foto der Waage — auf dem Sub-Pfad Pflicht (s.u.)
  imageExifTime DateTime?                   // Aufnahmezeit aus den EXIF-Daten
  imagePrunedAt DateTime?                   // wann das Foto nach Ablauf gelöscht wurde
  detectedKg    Float?                      // was die Erkennung gelesen hat; null = nicht geprüft
  note          String?
  source        String   @default("user")   // "user" | "keyholder" | "agent"
  createdById   String?                     // wer erfasst hat
  version       Int      @default(0)        // OCC für MCP-Schreibzugriffe
  createdAt     DateTime @default(now())

  @@unique([userId, dayKey])
  @@index([userId, measuredAt])
}
```

**`imageUrl` bleibt trotz Fotopflicht nullbar** — die Pflicht gilt dem **Sub**, nicht der Spalte.
Die Keyholderin, die einen Wert für ihn nachträgt, sitzt nicht vor seiner Waage; die KI über den MCP
erst recht nicht. Und nach Ablauf der Aufbewahrungsfrist wird das Foto gelöscht, während der Wert
bleibt (`imagePrunedAt` unterscheidet „nie eines gehabt" von „hatte eines, ist abgelaufen").
Erzwungen wird die Pflicht dort, wo sie hingehört: im Erfassungspfad des Subs.

`Float` folgt dem Haus-Muster (`Device.purchasePrice`, `TrainingVorgabe.minProTagH`).

**Eine Kommastelle in der Eingabe, volle Genauigkeit in der Ablage.** Die Skizze verlangt „75,6 kg".
Gerundet wird beim *Tippen*, nicht beim *Speichern*: wer in Pfund einträgt, tippt 165,4 lbs — das
sind 75,0257 kg, und genau die kommen in die Spalte. Bei Rundung auf 75,0 kg zeigte die Anzeige ihm
165,3 lbs zurück. Rundung gehört in die Anzeige, nirgendwo sonst.

**`dayKey`** kommt aus `tzDayKey()` mit der **Zeitzone des Subs** — wer um 23:50 Uhr auf der Waage
steht, hat an *diesem* Tag gewogen. Der `@@unique` setzt „ein Wert pro Tag" durch (Upsert).

**`detectedKg` neben `weightKg`** ist dasselbe Muster wie `deviceCheckNote` neben `deviceCheck`: was
die Maschine gelesen hat, bleibt getrennt von dem, was der Mensch bestätigt hat. Nur so ist sichtbar,
ob korrigiert wurde — und genau das ist die Spur, die eine Schummelei hinterlässt.

### 3.2 Die Körpergrösse wird historisiert

Sie geht in jeden BMI ein, also bekommt sie eine Historie nach dem Muster von `CleaningRuleChange`:
der aktuelle Wert steht am `User`, die Vergangenheit in einer eigenen, append-only Tabelle. Ein BMI
wird mit der Grösse gerechnet, die zum **Messzeitpunkt** galt (`effectiveAt`, wie bei den
Reinigungsregeln).

```prisma
model HeightChange {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  heightCm      Int
  effectiveFrom DateTime
  changedBy     String?  // Username bzw. `ai`; null nur bei der Grundzeile
  createdAt     DateTime @default(now())

  @@index([userId, effectiveFrom])
}
```

Der Preis: eine reine **Tippfehler-Korrektur** („178 statt 187") erzeugt einen dauerhaften Knick in
der BMI-Kurve, weil die App eine Korrektur nicht von echtem Wachstum unterscheiden kann. Deshalb
gehört ins Formular eine Auswahl: **„korrigiert" schreibt die bestehende Zeile um, „geändert" legt
eine neue an.** Ohne diese Unterscheidung ist die Historie kein Gewinn, sondern eine Fehlerquelle
mit Gedächtnis.

### 3.3 Neue Felder am `User`

```prisma
weightTrackingEnabled  Boolean @default(false)   // Gate, von der KH gesetzt
heightCm               Int?                      // AKTUELLER Wert; Historie in HeightChange
referenceSex           String?                   // "m" | "f" | null — nur für Referenzbereiche
unitSystem             String  @default("metric")// "metric" | "imperial", reine Anzeige
targetMinKg            Float?                    // Korridor des Subs, untere Grenze
targetMaxKg            Float?                    // Korridor des Subs, obere Grenze
targetMinKeyholderKg   Float?                    // Nachbesserung der KH — darf nur WEITEN
targetMaxKeyholderKg   Float?
weighingWindows        String?                   // JSON [{"start":"06:00","end":"08:00"}], Sub-Lokalzeit
weighingWindowsSetById String?
```

**BMI wird gerechnet, nicht gespeichert** — eine Spalte wäre eine zweite Wahrheit, die bei jeder
Grössenkorrektur still falsch würde. Formel, Umrechnung, Rundung und die Korridor-Prüfung in
`src/lib/weight.ts`.

## 4. Die Wiege-Fenster

Die Skizze: „zu erfassen in Zeitfenster täglich, z.B. zwischen 6–8 Uhr oder 18–20 Uhr wiegen".

Der fachliche Grund ist gut: Gewicht schwankt über den Tag um ein bis zwei Kilo. Morgens nüchtern
und abends nach dem Essen gemessene Werte sind **nicht dieselbe Messreihe** — ohne Fenster misst die
Kurve die Tageszeit mit.

### 4.1 Eigener Baustein — die Reinigung wird nicht angefasst

Die Reinigungsfenster (`reinigungsFenster`, `src/lib/reinigungService.ts`) sehen von aussen gleich
aus: JSON-Liste aus `{start,end}` in Sub-Lokalzeit. **Sie bleiben, wie sie sind.** Kein Umbenennen,
kein Herausziehen gemeinsamer Helfer, kein Re-Export. Die Wiege-Fenster bekommen einen eigenen,
geschlossenen Baustein (`src/lib/weightWindows.ts`), der von `reinigungService` nichts benutzt und
nichts an ihm ändert.

**Warum das trotz Doppelung richtig ist.** Zeitlich ähneln sich die Fenster, fachlich nicht:

| | Reinigungsfenster | Wiege-Fenster |
|---|---|---|
| Was es regelt | **Erlaubnis** — darf jetzt geöffnet werden | **Gültigkeit** — ist die Messung vergleichbar |
| Verletzung | Vergehen (`cleaning_limit`) | Wert wird markiert, nicht geahndet |
| Daran hängt | Sperrzeit, Box-Kommando, Wiederverschluss-Kontrolle, Strafbuch | nur die eigene Auswertung |
| Leere Liste `[]` | löst die Reinigung von der Uhrzeit | **keine Fensterpflicht** — jede Uhrzeit gilt |

Am Reinigungsfenster hängen Hardware, eine automatische Kontrolle nach jedem Wiederverschluss und
eine Vergehensart mit eigener Stichtags-Historie. Eine gemeinsame Abstraktion würde diese Wege an
ein Feature koppeln, das mit ihnen nichts zu tun hat. Der Preis sind rund dreissig Zeilen ähnlicher
Zeitarithmetik — der günstigere Handel.

**Für `/simplify` festgehalten:** die Ähnlichkeit ist gesehen, die Doppelung ist gewollt. Wer sie
zusammenlegt, ändert die Reinigungslogik — eine eigene Entscheidung, keine Aufräumarbeit nebenbei.

### 4.2 Ohne Fenster funktioniert alles

Eine leere Liste heisst **keine Fensterpflicht**: jede Uhrzeit gilt, jeder Wert ist `inWindow`. Das
ist die Vorgabe. Wer keine Zeitfenster will, bekommt das vollständige Feature ohne sie.

### 4.3 Ein Wert ausserhalb des Fensters

**Er erfüllt die Meldepflicht** — gemeldet ist gemeldet. Wer verschläft und um elf statt um sieben
auf die Waage steigt, bekommt kein Vergehen dafür. Der Wert wird aber als `inWindow: false`
festgehalten und im Diagramm **abgesetzt dargestellt; in die geglättete Trendlinie geht er nicht
ein**. Damit macht jede der beiden Regeln genau eine Sache: das Fenster sichert die Vergleichbarkeit
der Messreihe, die Pflicht sichert die Disziplin.

## 5. Ein und Aus

Das Feature ist auf zwei Ebenen abschaltbar. Das ist keine Nebenbedingung: das Strafbuch leitet
**live** ab, und eine ausgeschaltete Zeit darf hinterher nicht wie eine Zeit voller versäumter
Meldungen aussehen.

| Schalter | Wer | Wirkung |
|---|---|---|
| `weightTrackingEnabled` am `User` | Keyholderin, je Sub | Erfassung, Anzeigen, Statistik-Karte, MCP-Schreiben — alles weg |
| `WEIGHT_TRACKING_ENABLED` (ENV) | Betreiber der Instanz | das Feature existiert dort nicht; Muster `deviceCategoriesEnabled()` + `deviceCategoriesGate()` in `src/lib/authGuards.ts` |

**Was „aus" bedeutet:**

- **Daten bleiben.** Ausschalten löscht nichts; wieder eingeschaltet ist der Verlauf vollständig da.
  Löschen ist eine eigene, ausdrückliche Handlung — nicht die stille Nebenwirkung eines Schalters
- **Der Gate sitzt auch serverseitig.** UI ausblenden genügt nicht: jede Route prüft ihn selbst
- **Keine Vergehen für ausgeschaltete Zeit.** Beim Ausschalten wird die Vergehensregel
  `missed_weight_report` im selben Zug auf `off` geschrieben (`OffenseRuleChange`, historisiert).
  Sonst zählte die Ableitung Tage mit, an denen der Sub gar nichts hätte eintragen können
- **Wieder-Einschalten stellt die Regel nicht automatisch her.** Sie ist ein eigener, bewusster
  Schalter
- **Die Lücke über die Aus-Zeit hinweg zählt nicht.** War das Feature vom 3. bis zum 20. aus, ist
  der 20. kein Tag mit siebzehn Tagen Rückstand

## 6. Die Pflicht und ihr Versäumnis

**Regel:** mehr als 3 Tage ohne Angabe → nicht erfüllt → Eintrag ins Strafbuch.

### 6.1 Als abgeleitetes Vergehen, nicht als Aufgabe

Naheliegend wäre das Aufgaben-System — es hat `unfulfilled_task` bereits als Vergehensart. Es passt
trotzdem nicht: `Task` kennt **keine Wiederholung**, jede Aufgabe ist ein Einzelstück, und eine
Tagesaufgabe würde bei jedem ausgelassenen Tag scheitern, während die Regel drei Tage Nachsicht gibt.

Also eine eigene Vergehensart, **live abgeleitet** wie alle anderen — aus den Lücken zwischen den
`WeightEntry`-Tagen. Keine gespeicherte Zeile, kein Poller.

Was dazugehört (`src/lib/offenseTypes.ts`, `offenseRules.ts`, `offenseLabels.ts`, `strafbuch.ts`):

- kanonischer Typ `missed_weight_report`, Modi `off`/`on`
- **Vorgabe `off`.** Die Datei sagt es selbst: „Ein Update darf niemandem über Nacht ein Vergehen
  anhängen"
- Historisierung über `OffenseRuleChange` — die Pflicht gilt ab dem Einschalten, nicht rückwirkend
- Eintrag in `OFFENSE_TYPE_ORDER` und beide `messages/*.json` (der Compiler erzwingt Vollständigkeit)

### 6.2 Wie gezählt wird

**Ein Vergehen je angebrochenem Drei-Tage-Block.** 30 Tage Schweigen sind zehn Vergehen, nicht eines
und nicht achtundzwanzig. Ein Monat wiegt damit schwerer als ein verlängertes Wochenende, ohne dass
das Strafbuch überläuft. **Jede Nachmeldung setzt den Zähler zurück.**

Die weiteren Kanten der Ableitung:

- **Beginn:** ab dem Einschalten der Regel, frühestens ab dem ersten erfassten Wert
- **Ende der Lücke:** eine Nachmeldung schliesst sie; bereits entstandene Vergehen bleiben
- **Gesundheits-Halt:** ein aktiver `HealthHold` **setzt die Pflicht aus** — solange er läuft,
  entstehen keine Vergehen für fehlende Meldungen. Das ist eine Neuerung: bisher ist der Halt ein
  Hinweis an die Keyholderin und sperrt nichts. Beim Wiegen ist der Zusammenhang aber direkter als
  bei jeder anderen Pflicht, und wer krank ist, soll nicht zusätzlich für eine ausgelassene Waage
  bestraft werden. Der Halt wirkt **nur auf diese eine Vergehensart** — die übrigen bleiben
  unberührt, sonst wäre es ein Eingriff ins Bestandsverhalten

## 7. Grenzwerte: der Sub setzt, die Keyholderin darf nur lockern

Grenzen als **Korridor** (Max 80 / Min 70). Sie bleiben beim Sub, weil er der Realistischere ist —
„ein 60-Kilo-Mann sollte nicht 20 kg abnehmen müssen". Die Keyholderin darf nachbessern, aber nur in
eine Richtung: wer bei 90 kg 84 anstrebt, dem darf sie 87 setzen, keine 80.

**Als Korridor formuliert ist das eine einzige Regel: die Keyholderin darf ihn nur weiten, nie
verengen.** Ihre untere Grenze muss unter der des Subs liegen, ihre obere darüber. Aus „nur lockern"
wird damit eine Prüfung in einer Zeile statt einer Fallunterscheidung über Ab- und Zunehmen.

- **Wirksam** ist immer der weitere der beiden Werte — die Invariante hält auch, wenn der Sub sein
  Ziel später verschiebt
- Ein zu enger Versuch wird **abgewiesen mit Begründung**, nicht still ignoriert
- Der Wunsch des Subs bleibt neben der Nachbesserung sichtbar

**Untergrenze:** liegt ein Zielwert unter **BMI 18,5**, warnt die App beim Setzen deutlich — lässt
ihn aber zu. Zusätzlich geht unterhalb dieser Schwelle **keine automatische Grenz-Meldung** an die
Keyholderin: die App fordert nicht ein, was sie selbst als bedenklich anzeigt. Die
„nur-lockern"-Regel schützt vor der Keyholderin; diese Schwelle schützt davor, dass eine
selbstgesetzte Zahl anschliessend von aussen eingefordert wird.

## 8. Meldung an die Keyholderin — und was sie daraus macht

Verlässt das Gewicht den Korridor, geht **eine** Nachricht an die Keyholder (`messageService.ts`,
`audience: "keyholders"`). Automatisch passiert sonst nichts.

**Einmal je Austritt.** Erst wenn er zurückkehrt und erneut austritt, meldet es wieder — 200 Gramm
über der Grenze an fünf Tagen erzeugen eine Meldung, nicht fünf.

Sie entscheidet und hat dafür bereits alles:

- **Aufgabe als Strafe** — `Task` mit `isPunishment: true` und `penaltyReason`
- **Aufgabe als Belohnung** — dieselbe Mechanik ohne das Flag; „die Keyholderin zum Essen einladen"
  aus der Skizze ist eine ganz normale Aufgabe
- **nichts tun**

Damit ist „Aufgabe als Strafe (evtl. Zukunft)" schon heute erfüllt, ohne neues Konstrukt: die
Meldung bekommt einen Verweis direkt ins Aufgaben-Formular für diesen Sub.

## 9. Das Foto und die Waagen-Erkennung

### 9.1 Pflicht auf dem Sub-Pfad

**Ohne Foto keine Meldung.** Es ist der Beleg gegen Schummeln, und erst mit ihm ergibt die Erkennung
Sinn. Was noch zu klären ist: der Ausnahmefall (Reise, defekte Kamera, Waage ohne
Displaybeleuchtung) — vorgesehen ist, dass der Sub in diesem Fall **mit Notiz** melden kann und der
Eintrag als beleglos markiert wird, sichtbar für die Keyholderin. Ein harter Riegel ohne Ventil
produziert sonst genau die Lücke, die er verhindern soll.

### 9.2 Aufbewahrung: begrenzt

Fotos werden nach einer Frist automatisch gelöscht, der Wert bleibt. Muster und Begründung wie beim
Posteingang (`MESSAGE_RETENTION_DAYS`, tägliches Beschneiden im Poller): der Beleg ist genau so
lange nützlich, wie ihn jemand anzweifeln könnte. Vorschlag **60 Tage**, über
`WEIGHT_PHOTO_RETENTION_DAYS` einstellbar, `0` = nie löschen.

### 9.3 Die Erkennung

**Der Weg existiert.** `detectSealDigits()` (`src/lib/verifyCode.ts:443`) ist ein generischer
Ziffernleser über die Vision-Abstraktion (`src/lib/vision/`): Provider-Umschaltung Anthropic/lokale
Box, Rotation, Logging, Halluzinations-Guards. `detectSealNumber` und `detectLockboxCode` sind
bereits zwei Aufrufer mit eigenem Prompt; die Waage wird der dritte — mit einer Erweiterung, denn
der Bestandshelfer ist ziffernrein (`digitsOf`) und 75,6 passt nicht hinein. Route nach dem Muster
von `src/app/api/detect-seal/route.ts`, inklusive `checkRateLimit`.

**Was sie leistet und was nicht.** Sie fängt die frei erfundene Zahl. Sie fängt nicht das Foto einer
fremden Waage oder das von gestern. Dagegen hilft die **Aufnahmezeit**: `exifr` ist im Projekt,
`Entry.imageExifTime` und `TaskProof.imageExifTime` sind das etablierte Muster. Die EXIF-Zeit gegen
das Wiege-Fenster zu prüfen ist die schärfste verfügbare Klinge — ein Foto von gestern Abend fällt
auf, ohne dass ein Modell irgendetwas erkennen muss.

**Das Ergebnis bleibt ein Vorschlag, keine Festschreibung** — wie `deviceCheck` und `keyDetected`,
die beide anzeigen und nichts blockieren:

- Schrägfoto auf ein spiegelndes LCD; Sieben-Segment-Ziffern sind für kleine Modelle die schwerste Sorte
- Komma gegen Punkt, und Waagen mit Umschaltung zeigen mitunter selbst Pfund an
- ohne Vision-Provider fällt der Bestandspfad auf lokales Tesseract-OCR zurück — bei Sieben-Segment
  praktisch wertlos. Dann lieber keine Erkennung als eine falsche Zahl vorfüllen
- die lokale Box läuft mit einem kleinen Modell und zwei Slots

**Plausibilität:** Bereich 20–300 kg. Ein Sprung von mehr als **3 kg** zum Vortag wird nachgefragt
statt still übernommen — das fängt den klassischen Zahlendreher (87,5 statt 78,5), ohne bei echten
Tagesschwankungen von ein bis zwei Kilo ständig zu meckern.

## 10. Erfassung

**Der Sub:** neue Zeile im (+)-Sheet (`src/app/components/NewEntrySheet.tsx`, hat mit `bildersafe`
das Muster für eine gegatete Zeile), Formular unter `src/app/dashboard/new/gewicht/` nach dem Muster
der bestehenden `new/*`-Seiten. Inhalt: Kamera (`PhotoCapture`, Pflicht), Zahlenfeld mit einer
Kommastelle, Zeitpunkt (`DateTimePicker`), Notiz. Sichtbar ist der Fenster-Zustand: läuft gerade
eines, oder wann das nächste beginnt.

**Die Keyholderin:** `NewEntrySheet` kennt `adminUserId` — gesetzt zeigt es auf
`/admin/users/[id]/aktionen/*`. Dieselbe Seite, anderes Ziel, `source: "keyholder"`, ohne Fotozwang.

**Einstellungen:** Sub über das Avatar-Menü → `/dashboard/settings` (Grösse mit
Korrigiert/Geändert-Unterscheidung, Referenzangabe, Einheit, eigener Korridor). Keyholder in
`/admin/users/[id]/einstellungen` (Gate, Wiege-Fenster, Nachbesserung der Grenzen, Vergehensregel) —
dort liegen `reinigungErlaubt`, die Reinigungsfenster und der Vergehens-Abschnitt bereits.

## 11. Statistik

Neue Karte in `StatsMain` (`src/app/components/StatsMain.tsx`) als eigene Komponente, nicht als
weiterer Block in der ohnehin 505 Zeilen langen Datei.

Das Diagramm wird **handgebautes SVG** — das Projekt hat keine Chart-Bibliothek, `YearHeatmap` ist
der Präzedenzfall. Die Komponente wird so geschnitten, dass sie eine beliebige Messreihe zeichnet.

- Rohwerte als Punkte; Werte ausserhalb des Fensters abgesetzt und **nicht** in der Trendlinie
- **gleitendes 7-Tage-Mittel als Trendlinie** — die „Glättung" der Skizze
- **Korridor als Band**, nicht als zwei Linien: die Grenzen sind ein Bereich, in dem er sein soll
- Zeiträume: **30 Tage (Vorgabe), 90 Tage, 1 Jahr, seit Beginn**

**Keine BMI-Kurve** — bei fester Grösse wäre sie deckungsgleich mit der Gewichtskurve, nur anders
beschriftet. Der BMI erscheint als **Zahl** daneben (aktueller Wert, Veränderung zum Vormonat),
**ohne WHO-Kategorie**: die Einteilung kennt weder Muskelmasse noch Statur und liest sich in dieser
App schnell wie ein Urteil über den Träger.

## 12. MCP

Die Keyholderin soll über den MCP können, was sie in der Oberfläche kann.

- **Lesen:** aktueller Wert, Trend, Korridor und Tage seit der letzten Meldung in
  `keyholder_dashboard` (`src/lib/mcp/dashboard.ts`); dazu ein eigenes Werkzeug für die Reihe,
  Muster `device_stats` (`src/lib/mcp/stats.ts`)
- **Schreiben:** ein Gewicht eintragen und die Grenzen nachbessern (mit derselben
  Nur-Weiten-Prüfung), über `writeFramework` mit Dry-Run, `recordAction` und OCC — daher `version`
- Das versäumte Melden erscheint in `get_offenses` wie jede andere Art und wird über `judge_offense`
  beurteilt. Kein Sonderweg
- Werkzeugliste ist pro Verbindung gecacht: eine laufende KI-Sitzung sieht das Neue erst nach
  frischer Verbindung

## 13. Der letzte offene Punkt

Zwei Entscheidungen widersprechen einander noch: die Angabe **mann/frau** soll für
**Referenzbereiche** dienen — der BMI wird aber **ohne Kategorie** angezeigt. Damit hätte der
Referenzbereich keinen Ort, an dem er erscheint.

**Vorschlag:** das Feld bleibt, und der Referenzbereich erscheint **nur beim Setzen der
Grenzwerte** — dort, wo der Sub sich Ziele gibt, ist eine Einordnung eine Hilfe („für deine Grösse
liegt der Normbereich zwischen 62 und 84 kg") und nicht ein Etikett, das ihn im Alltag begleitet. Im
Statistik-Block bleibt es bei der blossen Zahl. Das versöhnt beide Entscheidungen und bedient
zugleich die BMI-Warnung aus Abschnitt 7, die ohnehin an dieser Stelle sitzt.

Alternative, falls das zu viel ist: das Feld ersatzlos streichen. Nichts im übrigen
Funktionsumfang braucht es.

## 14. Etappen

| # | Inhalt | Kern |
|---|---|---|
| 1 | Schema + Migration (`WeightEntry`, `HeightChange`, User-Felder), **Gate je Sub + ENV**, `src/lib/weight.ts` (BMI mit `effectiveAt`-Grösse, Umrechnung, Rundung, Korridor-Prüfung), Einstellungen beidseitig, API-Routen | Fleissarbeit nach Muster |
| 2 | Erfassung: (+)-Zeile, Formular Sub (Foto-Pflicht, 3-kg-Nachfrage), Aktion KH, Upload, EXIF | viele kleine Dateien |
| 3 | `src/lib/weightWindows.ts` — eigener Baustein, `reinigungService` bleibt unberührt | in sich geschlossen |
| 4 | Pflicht und Vergehen: `missed_weight_report`, Drei-Tage-Blöcke, `HealthHold`-Pause, Regel-Historisierung, Kopplung an den Gate, Tests | **die heikelste Etappe** — nur hier kann ein Fehler rückwirkend Vergehen erzeugen |
| 5 | Grenz-Meldung (einmal je Austritt) + Verweis ins Aufgaben-Formular | wenig Code, existierende Wege |
| 6 | Diagramm-Komponente + Statistik-Karte | Zeichenarbeit, keine Logik |
| 7 | Waagen-Erkennung: Prompt, Dezimalstelle, Route | Neuland, mit Fehlerkennungen zu rechnen |
| 8 | Foto-Beschneidung im Poller | ein Tages-Gate, Muster `pruneExpiredMessages` |
| 9 | MCP lesen und schreiben | Muster vorhanden, Tests dazu |

Etappe 7 ist von allem anderen unabhängig — das Zahlenfeld funktioniert ohne Erkennung, und die
Fotopflicht steht auch ohne sie. Etappe 4 setzt 1–3 voraus; ihre Tests müssen die Aus-Zeiten, den
Startpunkt und den Gesundheits-Halt ausdrücklich abdecken.

## 15. Zwei Hinweise ohne Handlungsbedarf

**Datenklasse.** Gewicht, Körpergrösse, BMI und die Waagenfotos sind Gesundheitsdaten. Sie liegen
unverschlüsselt in derselben SQLite wie alles andere — konsistent zum Rest, aber eine andere
Kategorie als Tragestunden. Die begrenzte Aufbewahrung der Fotos nimmt davon einen Teil zurück.

**Nachbarschaft zum Redesign.** Auf `design/entwurf` läuft der Gestaltungsentwurf, auf
`feat/dashboard-config` die konfigurierbaren Dashboards. Dieser Zweig fasst bislang nur `docs/` an.
Sollte das Gewicht später als **Dashboard-Block** erscheinen, ist das die Stelle, an der sich die
Stränge treffen — dann in dieser Reihenfolge: erst die Modularität, dann der Block.
