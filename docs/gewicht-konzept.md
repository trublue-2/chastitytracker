# Gewichtstracking: Wiegen, Grenzen, Verlauf

**Status:** **fertig gebaut** (22.08.2026), **überarbeitet am 23.08.2026** nach der ersten
Rückmeldung aus der Nutzerschaft. Die Überarbeitung betrifft drei Dinge: der Zielkorridor ist einem
**Zielgewicht** gewichen, die Regel „die Keyholderin darf nur lockern" ist **gestrichen**, und die
Wiege-Fenster kennen jetzt **Wochentage, eine Dauer und eine Erinnerung**. Alles andere steht wie
gebaut: beide Schalter, der Rechenkern `weight.ts`, die Erfassung (Formular des Trägers, Nachtrag
der Keyholderin, ein Wert je Tag, Beleg-Pflicht mit Ventil, Sprung-Nachfrage), die Statistik-Karte
samt Verlaufs-Diagramm, die Meldepflicht (`missed_weight_report`, Drei-Tage-Blöcke, Pause bei
Gesundheits-Halt), die Waagen-Erkennung, das Beschneiden der Fotos und der MCP.
**Erstellt:** 2026-08-22 · **Überarbeitet:** 2026-08-23
**Branch:** `feat/gewicht-ziel` (Worktree `../kg-gewicht-2`, abgezweigt von `feat/gewicht` @ ec3cd73, v5.3.3)
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
| Körpergrösse | setzt | liest |
| Einheitensystem | eigene Anzeige-Präferenz | eigene Anzeige-Präferenz |
| Zielgewicht | **setzt eines** | setzt eines — **ihres gilt**, seines bleibt sichtbar (Abschnitt 7) |
| Wiege-Fenster (Zeit, Dauer, Wochentage, Erinnerung) | liest | setzt |
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
sind 75,0242 kg, und genau die kommen in die Spalte. Bei Rundung auf 75,0 kg zeigte die Anzeige ihm
165,3 lbs zurück. Rundung gehört in die Anzeige, nirgendwo sonst.

**`dayKey`** kommt aus `tzDayKey()` mit der **Zeitzone des Subs** — wer um 23:50 Uhr auf der Waage
steht, hat an *diesem* Tag gewogen. Der `@@unique` setzt „ein Wert pro Tag" durch (Upsert).

**`detectedKg` neben `weightKg`** ist dasselbe Muster wie `deviceCheckNote` neben `deviceCheck`: was
die Maschine gelesen hat, bleibt getrennt von dem, was der Mensch bestätigt hat. Nur so ist sichtbar,
ob korrigiert wurde — und genau das ist die Spur, die eine Schummelei hinterlässt.

**Gelesen wird nur, was ein Gewicht sein KANN** (`plausibleDetection`, seit 24.08.2026). Die
Erkennung sieht eine Ziffernanzeige, nicht ihre Bedeutung — und viele Waagen zeigen nach dem Gewicht
noch BMI, Körperfett, Wasseranteil und Muskelmasse. Wer den Moment verpasst, fotografiert eine
dieser Zahlen, und sie liegt oft im selben Bereich wie ein Körpergewicht: ein BMI von 22,8 ist
genauso „plausibel" wie 22,8 kg. In der Liste stand daraufhin „getippt 74,1 · gelesen 22,8" in
Warnfarbe — die Spur, an der man eine Schummelei erkennen soll, feuerte ohne Anlass.

Deshalb wird die gelesene Zahl an einer Referenz gemessen: im Formular an der letzten Messung, beim
Speichern am bestätigten Wert. Mehr als **fünfzehn Kilo** daneben, und sie gilt als nicht gelesen —
dieselbe Behandlung wie ein unscharfes Foto. Die Grenze trennt die beiden Fälle sauber: eine bewusst
zu niedrig getippte Zahl liegt zwei bis fünf Kilo daneben, ein BMI- oder Fett-Wert dreissig bis
achtzig. **Die Grenze verschweigt, sie beschuldigt nicht** — eine verschwiegene Abweichung kostet
einen Hinweis, eine erfundene kostet Vertrauen.

### 3.2 Die Körpergrösse wird protokolliert

Der aktuelle Wert steht am `User`, jede Änderung zusätzlich in einer append-only Tabelle nach dem
Muster von `CleaningRuleChange`. Der Resolver `heightAt` kann daraus die Grösse zu einem beliebigen
Zeitpunkt auflösen — **benutzt wird er heute von niemandem:** jeder BMI im Produkt rechnet mit der
aktuellen Grösse. Die Tabelle ist damit vorerst ein Protokoll (wer wann welche Zahl eingetragen hat)
und die Vorarbeit für den Tag, an dem eine BMI-Kurve mit der Grösse von damals rechnen soll.

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

**Die Rückfrage „Korrektur oder Änderung?" ist gestrichen (23.08.2026).** Bis v5.3.4 fragte das
Formular den Träger, ob seine neue Zahl eine Korrektur sei (dann wurde die jüngste Zeile
umgeschrieben) oder echtes Wachstum (dann kam eine neue dazu). Sie ist aus zwei Gründen weg:

- **Sie war folgenlos.** Der historische Wert wird nirgends gelesen; beide Antworten führen zu
  demselben BMI. Eine Entscheidung zu verlangen, deren Ausgang unsichtbar bleibt, ist keine
  Sorgfalt, sondern eine Frage ins Leere
- **Sie war nicht beantwortbar.** Bei erwachsenen Menschen ist eine geänderte Körpergrösse fast
  immer eine korrigierte Angabe, keine gewachsene — und die Vorgabe stand ausgerechnet auf
  „geändert"

Geschrieben wird jetzt immer eine neue Zeile. Sollte die BMI-Kurve später historisch rechnen, ist
der Tippfehler-Knick der Fall, den man dann löst — mit einer Korrektur-Funktion am Protokoll, nicht
mit einer Rückfrage im Erfassungs-Formular.

### 3.3 Neue Felder am `User`

```prisma
weightTrackingEnabled  Boolean @default(false)   // Gate, von der KH gesetzt
heightCm               Int?                      // AKTUELLER Wert; Historie in HeightChange
unitSystem             String  @default("metric")// "metric" | "imperial", reine Anzeige
targetWeightKg             Float?                // Zielgewicht des Subs
targetWeightSetAt          DateTime?             // wann gesetzt — Bezugspunkt des Fortschritts
targetWeightKeyholderKg    Float?                // Zielgewicht der KH — es GILT, solange es steht
targetWeightKeyholderSetAt DateTime?
weighingWindows            String?               // JSON [{"start":"05:00","durationMin":180,"days":127,"remind":true}]
weightReminderMark         String?               // <Tag>#<Startzeit> der zuletzt verschickten Erinnerung
```

Die drei Felder, die der Sub selbst schreibt (`heightCm`, `unitSystem`, `targetWeightKg`), stehen
zusätzlich in `SELF_EDITABLE_USER_FIELDS` — der Whitelist, gegen die das Register prüft, wer welches
User-Feld ändern darf. Die Keyholder-Felder stehen dort bewusst **nicht**, und die beiden
`...SetAt`-Spalten schreibt niemand von Hand: sie folgen dem Ziel.

**Kein Feld „wer hat die Fenster gesetzt".** Ursprünglich vorgesehen, beim Bauen gestrichen: ob eine
Messung im Fenster lag, entscheidet der Erfassungs-Zeitpunkt und steht danach auf der Zeile
(`WeightEntry.inWindow`). Damit gibt es nichts, was später nach einer alten Fassung neu beurteilt
werden müsste — die Fenster brauchen weder Historie noch Urheber.

**BMI wird gerechnet, nicht gespeichert** — eine Spalte wäre eine zweite Wahrheit, die bei jeder
Grössenkorrektur still falsch würde. Formel, Umrechnung, Rundung, Ziel-Auflösung und Fortschritt in
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

### 4.2 Wochentage, Dauer, Erinnerung

Seit dem 23.08.2026 ist ein Fenster **Startzeit + Dauer + Wochentage + Erinnerung**, nicht mehr
„von–bis, täglich":

```json
{ "start": "05:00", "durationMin": 180, "days": 127, "remind": true }
```

- **Start plus Dauer** statt zweier Uhrzeiten — so steht es auf dem Zettel des Nutzers („ab 5:00,
  ca. 3 h") und so denkt auch, wer es einstellt: die Dauer ist die Grosszügigkeit, die er einräumt
- **`days` ist eine Wochentags-Bitmaske** (Montag = 1 … Sonntag = 64, 127 = täglich). Sie lebt in
  `src/lib/weekdays.ts`, zusammen mit der Auswahl-Komponente `WeekdayPicker` — **bewusst ohne Bezug
  auf das Gewicht**: dieselbe Auswahl brauchen die Auto-Kontrollen (Schlaf-Fenster, festes
  Auslöse-Fenster) und die Reinigungsfenster, sobald jemand sie nachrüstet. Geteilt wird, was ein
  Wochentag ist, nicht was er auslöst
- **`remind`** schickt zum Fensterbeginn eine Erinnerung, wenn an diesem Tag noch nichts gemeldet
  ist — Mail und Push, **ohne** Posteingangs-Zeile: eine tägliche Erinnerung, die liegen bleibt, ist
  nach einer Woche Rauschen. Abschalten kann sie der **Träger** in seinen eigenen Einstellungen
  (`WEIGHT_REMINDER` steht in `RECIPIENT_NOTIFICATION_EVENT_TYPES`, nicht im Admin-Raster: die
  Meldung geht an ihn, nicht über ihn)
- Geprüft wird am **laufenden** Fenster, nicht an seiner Startminute (`weightReminder.ts`): ein
  Poller-Tick, der wegen Neustart oder Deploy ausfällt, holt die Erinnerung dadurch nach, statt sie
  zu verschlucken. Die Marke `weightReminderMark` (`<Tag>#<Startzeit>`) verhindert die Wiederholung
- **Alt-Fenster `{start, end}` werden weiter gelesen** und in Start + Dauer übersetzt; eine
  Erinnerung bekommen sie dabei NICHT — ein Update darf niemandem ungefragt Nachrichten bestellen

### 4.3 Ohne Fenster funktioniert alles

Eine leere Liste heisst **keine Fensterpflicht**: jede Uhrzeit gilt, jeder Wert ist `inWindow`. Das
ist die Vorgabe. Wer keine Zeitfenster will, bekommt das vollständige Feature ohne sie.

### 4.4 Ein Wert ausserhalb des Fensters

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
| `ENABLE_WEIGHT_TRACKING` (ENV) | Betreiber der Instanz | **Opt-in, Default AUS** — ohne ein ausdrückliches `true` existiert das Feature dort nicht. Muster: `bildersafeEnabled()` |

**Was „aus" bedeutet:**

- **Daten bleiben.** Ausschalten löscht nichts; wieder eingeschaltet ist der Verlauf vollständig da.
  Löschen ist eine eigene, ausdrückliche Handlung — nicht die stille Nebenwirkung eines Schalters
- **Der Gate sitzt auch serverseitig.** UI ausblenden genügt nicht: jede Route prüft ihn selbst
- **Keine Vergehen für ausgeschaltete Zeit.** Beim Ausschalten wird die Vergehensregel
  `missed_weight_report` im selben Zug auf `off` geschrieben (`OffenseRuleChange`, historisiert).
  Sonst zählte die Ableitung Tage mit, an denen der Sub gar nichts hätte eintragen können
- **Wieder-Einschalten stellt die Regel nicht automatisch her.** Sie ist ein eigener, bewusster
  Schalter
- **Ohne Tracking steht ihr Schalter nirgends.** Die Zeile `missed_weight_report` verschwindet aus
  beiden Regel-Listen — dem Einstellungs-Abschnitt der Keyholderin und „Meine Regeln" des Trägers
  (`switchableOffenseTypesFor()` in `offenseLabels.ts`). Sie stand dort vorher unabhängig vom Gate
  und sah scharf aus, während sie wirkungslos war: die Sorte Einstellung, die man einmal umlegt und
  danach für gültig hält
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

## 7. Das Zielgewicht: beide setzen eines, ihres gilt

**Ein Wert, kein Korridor** (23.08.2026). Die erste Fassung hatte einen Zielbereich (Min/Max) und
darüber die Regel, dass die Keyholderin ihn nur **weiten** durfte — abgeleitet aus der Sorge, jemand
könnte eine unerreichbare Zahl von aussen verordnet bekommen. Beides ist gestrichen:

> „Das mit den Grenzen nicht verschieben dürfen ist Quatsch. Ich will eigentlich nur ein Zielgewicht
> angeben können und auf das arbeiten wir hin. Es ist eine App für erwachsene Menschen in einem
> konsensuellen Spiel."

Was an seine Stelle tritt:

- **Zwei Spalten, eine Auflösung.** `targetWeightKg` (Träger) und `targetWeightKeyholderKg`
  (Keyholderin). Wirksam ist **ihres, solange sie eines führt** — auch wenn es strenger ist. Nimmt
  sie es zurück, gilt wieder seines (`effectiveTarget`)
- **Beide Werte bleiben sichtbar**, auf beiden Seiten. Ihres überschreibt seines nicht; die
  Oberfläche zeigt daneben, was der andere sich vorgenommen hat. Wer wann geändert hat, steht im
  Aktions-Log
- **Der Fortschritt braucht einen Startpunkt.** `...SetAt` hält fest, wann ein Ziel gesetzt wurde;
  gerechnet wird ab der Messung, die damals galt (`targetStartWeight`). Ohne das begänne ein heute
  gesetztes Ziel rückwirkend bei einem Wert von vor einem Jahr. Ein Speichern, das dieselbe Zahl
  noch einmal schreibt, bewegt den Zeitpunkt **nicht**
- **Richtung statt Fallunterscheidung:** ab- oder zunehmen ergibt sich aus Startgewicht und Ziel.
  Beim Abnehmen zählt jeder Wert **unter** dem Ziel als erreicht — wer darunter kommt, hat es nicht
  knapp verfehlt

**Untergrenze:** liegt ein Ziel unter **BMI 18,5**, warnt die App beim Setzen deutlich — lässt es
aber zu. Die Warnung gilt jetzt für **beide** Seiten und ist die einzige verbliebene Bremse im
Feature; über den MCP erscheint sie als `underweightWarning` schon im Dry-Run. Unterhalb dieser
Schwelle unterbleibt zusätzlich jede automatische Meldung: die App fordert nicht ein, was sie selbst
als bedenklich anzeigt.

## 8. Meldung an die Keyholderin — und was sie daraus macht

Zwei Ereignisse gehen an die Keyholder (`messageService.ts`, `audience: "keyholders"`):
**Ziel erreicht** und **Ziel wieder verfehlt**. Automatisch passiert sonst nichts.

**Einmal je Übergang.** Gemeldet wird der Wechsel, nicht der Zustand — wer fünf Tage lang knapp über
dem Ziel liegt, erzeugt eine Meldung, nicht fünf. Der **Rückfall** braucht dabei eine Toleranz von
einem Kilo (`TARGET_TOLERANCE_KG`), das Erreichen nicht: sonst wechselte ein Wert, der um das Ziel
herum pendelt, täglich zwischen beiden Meldungen.

Sie entscheidet und hat dafür bereits alles:

- **Aufgabe als Belohnung** — ein `Task` ohne `isPunishment`; „die Keyholderin zum Essen einladen"
  aus der Skizze ist eine ganz normale Aufgabe
- **Aufgabe als Strafe** — dieselbe Mechanik mit `isPunishment: true` und `penaltyReason`
- **nichts tun**

Einen Verweis direkt aus der Meldung ins Aufgaben-Formular gibt es **nicht**: Nachrichten führen im
Bestand keine Ziel-Links (die `ref` einer Nachricht dient allein der Einmal-Zusage), und das
nachzurüsten wäre ein eigener Umbau am Posteingang.

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
- **Zielgewicht als gestrichelte Linie** — gestrichelt, damit sie nie mit der Trendlinie verwechselt wird: die eine ist eine Vorgabe, die andere eine Messung. Dazu eine Kachel mit Restweg und Fortschrittsbalken
- Zeiträume: **30 Tage (Vorgabe), 90 Tage, 1 Jahr, seit Beginn**

### 11.1 Die Liste der einzelnen Wiegungen

Die Kurve zeigt die Richtung, sie zeigt aber keine einzelne Messung. Foto, Notiz, Uhrzeit, das
Fenster-Kennzeichen und vor allem der von der Waage GELESENE Wert standen bis dahin in der Datenbank,
ohne dass eine Oberfläche sie abrief — ausgerechnet `detectedKg`, die Spur einer Korrektur, war die
unsichtbarste Spalte. Die KI las sie über `weight_history` längst; die Keyholderin im Browser nicht.

Deshalb eine Zeilen-Liste, an zwei Orten aus denselben Bausteinen:

- **Der Träger** findet sie in der Statistik, unter dem Diagramm derselben Karte. Sie folgt dem
  Zeitraum-Umschalter — wer auf 90 Tage stellt, bewegt Kurve und Liste zugleich — und zeigt je
  dreissig Zeilen mit „Weitere anzeigen"
- **Die Keyholderin** findet sie eingemischt in `/admin/users/[id]/eintraege`, chronologisch
  zwischen Verschluss, Öffnung und Kontrolle. Das Wiege-Fenster einer Seite spannen deren EINTRÄGE
  auf (untere Grenze einschliessend, obere ausschliessend) — eine zweite Paginierung über eine
  zweite Tabelle müsste beide Zählungen zusammenrechnen, um zu wissen, wo Seite drei beginnt

Bausteine: `src/lib/weightRows.ts` (Laden samt Veränderung zum Vorwert) und
`src/app/components/WeightRow.tsx` (die Zeile samt Detail-Panel, Aufbau und Masse wie `EntryRow`).
Die Veränderung rechnet immer gegen die vorherige Messung im BESTAND, nicht gegen die vorherige im
Ausschnitt: sonst begänne jede Seite mit einem leeren Delta.

**Der Wert einer Zeile lässt sich hier nicht ändern.** Korrigiert wird wie bisher durch erneutes
Erfassen desselben Tages — mit der bekannten Einschränkung, dass die Vorfassung dabei überschrieben
wird (Abschnitt 3.1).

**Keine BMI-Kurve** — bei fester Grösse wäre sie deckungsgleich mit der Gewichtskurve, nur anders
beschriftet. Der BMI erscheint als **Zahl** daneben (aktueller Wert, Veränderung zum Vormonat),
**ohne WHO-Kategorie**: die Einteilung kennt weder Muskelmasse noch Statur und liest sich in dieser
App schnell wie ein Urteil über den Träger.

## 12. MCP

Die Keyholderin soll über den MCP können, was sie in der Oberfläche kann.

- **Lesen:** aktueller Wert, Trend, Zielgewicht samt Fortschritt und Tage seit der letzten Meldung
  in `keyholder_dashboard` (`src/lib/mcp/dashboard.ts`); dazu `weight_history` für die Reihe,
  Muster `device_stats` (`src/lib/mcp/stats.ts`)
- **Schreiben:** ein Gewicht eintragen (`log_weight`, über `writeFramework` mit Dry-Run,
  `recordAction` und OCC — daher `version`) und die EINSTELLUNGEN über ein einziges Werkzeug
  (`set_weight_tracking`: Freischaltung, Wiege-Fenster, dein Zielgewicht; `null` nimmt es zurück).
  Ein Werkzeug je Einstellungs-Familie, wie `set_cleaning` — die Regel steht in `CLAUDE.md` unter
  „MCP-Vollständigkeit". Der Dry-Run meldet `underweightWarning`, bevor etwas geschrieben wird
- Das versäumte Melden erscheint in `get_offenses` wie jede andere Art und wird über `judge_offense`
  beurteilt. Kein Sonderweg
- Werkzeugliste ist pro Verbindung gecacht: eine laufende KI-Sitzung sieht das Neue erst nach
  frischer Verbindung

## 13. Entschieden: keine Referenzangabe

Die Angabe mann/frau ist **gestrichen** (22.08.2026). Sie war nur dafür gedacht, eine Referenztabelle
für den Normbereich auszuwählen — und der Normbereich hatte, seit der BMI ohne Kategorie erscheint,
keinen Ort mehr. Ein Gesundheitsdatenfeld, das nichts steuert, ist Ballast; der BMI selbst rechnet
ohnehin geschlechtsunabhängig.

Was bleibt: die **Warnung unterhalb von BMI 18,5** beim Setzen des Ziels und die Unterdrückung der
Meldung darunter (Abschnitt 7). Beide brauchen die Angabe nicht.

## 14. Etappen

| # | Inhalt | Kern |
|---|---|---|
| 1 | Schema + Migration (`WeightEntry`, `HeightChange`, User-Felder), **Gate je Sub + ENV**, `src/lib/weight.ts` (BMI, Umrechnung, Rundung, Ziel-Prüfung), Einstellungen beidseitig, API-Routen | Fleissarbeit nach Muster |
| 2 | Erfassung: (+)-Zeile, Formular Sub (Foto-Pflicht, 3-kg-Nachfrage), Aktion KH, Upload, EXIF | viele kleine Dateien |
| 3 | `src/lib/weightWindows.ts` — eigener Baustein, `reinigungService` bleibt unberührt | in sich geschlossen |
| 4 ✅ | Pflicht und Vergehen: `missed_weight_report`, Drei-Tage-Blöcke, `HealthHold`-Pause, Regel-Historisierung, Kopplung an den Gate, Tests | **die heikelste Etappe** — nur hier kann ein Fehler rückwirkend Vergehen erzeugen |
| 5 ✅ | Grenz-Meldung (einmal je Austritt) | wenig Code, existierende Wege. **Ohne Verweis ins Aufgaben-Formular:** Nachrichten tragen im Bestand keine Ziel-Links (die `ref` dient nur der Einmal-Zusage), und eine Link-Auflösung im Posteingang wäre ein eigener Umbau. Die Keyholderin handelt von der Sub-Seite aus. |
| 6 ✅ | Diagramm-Komponente + Statistik-Karte | Zeichenarbeit, keine Logik |
| 7 | Waagen-Erkennung: Prompt, Dezimalstelle, Route | Neuland, mit Fehlerkennungen zu rechnen |
| 8 ✅ | Foto-Beschneidung im Poller | ein Tages-Gate, Muster `pruneExpiredMessages` |
| 9 ✅ | MCP lesen und schreiben (`weight_history`, `log_weight`, `set_weight_tracking`, dazu `weight` im Keyholder-Dashboard) | Muster vorhanden, Tests dazu |
| 10 ✅ | **Überarbeitung 23.08.2026:** Zielgewicht statt Korridor, Nur-Weiten-Regel gestrichen, Wochentage + Dauer + Erinnerung an den Fenstern, `weekdays.ts` + `WeekdayPicker` als geteilter Baustein, Rückfrage „Korrektur oder Änderung?" bei der Körpergrösse gestrichen, alle Einstellungen über den MCP erreichbar (`set_weight_tracking`) | dazu der Fehler in `weight_history`: es bekam den Benutzer**namen**, suchte damit aber in der id-Spalte — die Reihe kam immer leer und `enabled: false` zurück, während das Dashboard dieselben Daten korrekt zeigte |

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
