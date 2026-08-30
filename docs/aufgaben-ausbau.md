# Die Aufgabe als Ort, an dem eine Anweisung entsteht — Ausbauplan

Aus `aufgaben-abdeckung.md` folgt ein Befund, der schwerer wiegt als die einzelnen Lücken: **die
Aufgabe ist das einzige Instrument, das einen Satz an den Träger richtet.** Sperrzeit, Kontrolle und
Reinigungsregel sind Mechanismen — sie *tun* etwas, aber sie *sagen* nichts. Sobald eine Anweisung aus
einem Satz besteht, den er lesen und befolgen soll, fängt die Keyholderin dort an zu tippen.

Heute muss sie danach übersetzen: „das ist eigentlich eine Sperrzeit", „dafür brauche ich drei
Kontrollen". Diese Übersetzung ist keine Eigenschaft ihrer Anweisung, sondern eine der App. Wer sie
verlangt, bekommt früher oder später die falsche Wahl — oder gar keine.

**Ziel dieses Plans:** die Aufgabe trägt die Anweisung, und was daraus an Mechanik nötig ist, leitet
die App ab. Nicht: die Aufgabe kann alles selbst.

Stand: v5.1.2 · 15.08.2026 · **Vorschlag, nichts davon ist umgesetzt.**

---

## 1. Das tragende Prinzip: Direktive erzeugt Direktive

Der kreative Kern ist keine Erfindung — er steht **dreimal im Code**, jedes Mal von Hand für genau
einen Fall gebaut:

| Bestehend | Was passiert |
|---|---|
| `VerschlussAnforderung.minDurationHours` | Die Anforderung erzeugt **beim Verschluss** selbsttätig eine Sperrzeit — relativ zum tatsächlichen Verschlusszeitpunkt |
| `scheduleCleaningRelockInspection` | Ein **Eintrag** (Wiederverschluss nach Reinigung) erzeugt selbsttätig eine Kontrolle |
| `punishWithTask` | Ein **Urteil** erzeugt Aufgabe und Strafeintrag in einem Zug |

Drei Sonderfälle desselben Musters: *ein Ereignis in der einen Direktive erzeugt eine andere.* Der
Vorschlag ist, dieses Muster **einmal** zu bauen, statt ein viertes Mal von Hand — und die Aufgabe zum
Ort zu machen, an dem es sichtbar wird.

Damit wird aus „Aufgabe stellen" nicht ein Alleskönner, sondern ein **Komponist**: sie schreibt den
Satz, sie hält die Bedingungen, und an ihren Wendepunkten löst sie aus, was der Rest der App ohnehin
kann.

---

## 2. Die Bausteine

Zwölf Stück, jeder einzeln nutzbar (B10 ist verworfen — die Begründung steht in Abschnitt 2a). Aufwand und Risiko sind ehrlich geschätzt; „Kern" heisst, dass
`evaluateTask` angefasst wird — die Stelle, an der ein Fehler das Strafbuch rückwirkend umschreibt.

### B1 — Aufgabe terminieren (`wirksamAb`)

Bis dahin für den Träger unsichtbar; Benachrichtigung und alle Fristen starten erst dann.

- **Neu:** `Task.wirksamAb`, `Task.benachrichtigtAt` (+ Index).
- **Umbau:** jede Zeitrechnung ankert auf `wirksamAb ?? createdAt` statt auf `createdAt` —
  `startDeadline`, das spätestmögliche Ende im Dauer-Modus, der Kandidaten-Filter in `evaluateTask`.
- **Wiederverwendet:** `computeDelayedTrigger`, `isHiddenFromSub`, `deadlineFromDispatch` (eine
  verspätet zugestellte Aufgabe darf keine unerfüllbare Frist mitbringen), der Minuten-Tick.
- **Risiko:** mittel — Kern, aber nur eine Verschiebung des Nullpunkts.
- **Löst:** Lücke A · Fälle 2, 5, 6, 7

### B2 — Fristtyp „bis erledigt gemeldet"

Dritter Fristtyp neben „Endet um" und „Tragezeit". Die Bedingungen halten, bis der Träger meldet —
längstens bis zu einer äusseren Frist.

- **Neu:** `Task.holdUntilReported` (bool) + die bestehende Frist als Obergrenze.
- **Kern:** `effectiveHoldUntil` liefert `completedAt ?? min(now, obergrenze)`. Ablegen **nach** der
  Meldung ist erlaubt, **davor** ist Abbruch.
- **Fallstrick:** die Selbstmeldung wird damit zum Frist-Ende — sie ist heute bewusst *unbefristet*
  nachholbar. Beides zusammen heisst: eine späte Meldung darf die Frist nicht rückwirkend dehnen. Die
  Obergrenze ist deshalb Pflicht, nicht Kür.
- **Risiko:** mittel-hoch — Kern.
- **Löst:** Lücke B · Fälle 1, 11

### B3 — Startfrist als Uhrzeit

„Zeit zum Anlegen" bekommt denselben Umschalter wie die Frist darunter: Minuten **oder** Uhrzeit.
Gespeichert bleibt die Minutenzahl (relativ zu `wirksamAb`).

- **Risiko:** gering — reine Oberfläche.
- **Löst:** Lücke C · Fälle 4, 10

### B4 — Bedingung mit eigenem Ende

Je Bedingung optional ein eigenes Ende („der Slip bis 20:00, der KG weiter").

- **Neu:** `TaskRequirement.endsAt` / `endsAfterMin` (null = Ende der Aufgabe).
- **Kern, und zwar tief:** heute ist „begonnen" der Schnitt **aller** Bedingungen und die Deckung wird
  gegen diesen Schnitt geprüft. Mit eigenen Enden wird daraus eine Prüfung **je Bedingung über ihr
  eigenes Fenster**. Der Schnitt bleibt nur noch für „ab wann läuft es".
- **Risiko:** hoch — die zentrale Rechnung wird umgebaut.
- **Löst:** Lücke E · Fall 5

### B5 — Serie

Eine Regel, aus der der Poller einzelne Aufgaben instanziiert.

- **Neu:** `TaskSeries` (Muster: täglich / Wochentage / wöchentlich · Uhrzeit · Dauer bzw. Ende ·
  Anzahl oder Bis-Datum) und `Task.seriesId`.
- **Entscheidend:** **instanziieren, nicht die Serie bewerten.** Jede Nacht ist eine eigene Zeile mit
  eigenem Zustand, eigenem Vergehen, eigener Meldung. Eine Serie, die als Ganzes beurteilt würde,
  machte aus sieben Nächten ein einziges unteilbares Urteil.
- **Risiko:** gering-mittel — die Instanzen sind gewöhnliche Aufgaben, `evaluateTask` bleibt unberührt.
- **Löst:** Lücke D · Fall 7

### B6 — Folge-Aktionen · *der Kern dieses Plans*

Die Aufgabe löst an ihren Wendepunkten andere Direktiven aus.

**Auslösepunkte** — alle existieren bereits als abgeleiteter Zustand, es ist nichts neu zu berechnen:

| Punkt | Quelle heute |
|---|---|
| wirksam geworden | `wirksamAb` (B1) |
| begonnen (alle Bedingungen liegen an) | `evaluation.startedAt` |
| Haltefrist abgelaufen | `evaluation.holdUntil` |
| erledigt gemeldet | `completedAt` |
| entschieden (erfüllt / versäumt / abgebrochen) | `isTaskResultFinal` |

**Aktionen** — durchweg vorhandene Dienste, kein neuer Mechanismus:

- Kontrolle anfordern (Ziel: KG / Kategorie / Gerät, Frist, mit oder ohne Code)
- Sperrzeit setzen · Verschluss-Anforderung stellen
- Orgasmus-Anweisung oder -Gelegenheit
- Folge-Aufgabe stellen
- Nachricht an den Träger · Notiz schreiben
- Vergehen notieren

**Neu:** `TaskAction` (`taskId`, `on`, `kind`, `params`, `offsetMin`) und `TaskActionFired`
(`taskActionId`, `firedAt`, `resultRef`).

**Der subtile Teil, an dem es scheitern würde, wenn man ihn übersieht:** der Zustand einer Aufgabe ist
**abgeleitet**, nicht gestempelt — er kann sich rückwärts bewegen, wenn die Keyholderin einen Eintrag
korrigiert. Ein Auslöser darf deshalb nie „aus dem Zustand" feuern, sondern nur **einmalig**, und der
Schuss muss gestempelt sein. Genau dafür gibt es das Muster schon zweimal (`benachrichtigtAt`,
`resultNotifiedAt`): erst zustellen, dann stempeln, nie umgekehrt. `TaskActionFired` ist dieselbe
Zusage. Rückgängig gemacht wird nichts — eine ausgelöste Sperrzeit bleibt, auch wenn der Beginn sich
nachträglich verschiebt; zurücknehmen kann sie die Keyholderin von Hand.

- **Risiko:** mittel — kein Eingriff in `evaluateTask`, aber Nebenwirkungen mit Einmal-Zusage.
- **Löst:** Fälle 5, 2 (Beweisfoto), und der ganze Raum an Kombinationen darüber hinaus.

### B7 — Verneinte Bedingung

„Trage gerade **kein** X."

- **Neu:** `TaskRequirement.negate`.
- **Kern:** das Intervall wird zum Komplement innerhalb des Aufgaben-Fensters.
- **Ehrliche Grenze:** eine Verneinung ist nur so gut wie die Erfassung. Wer ein Gerät nicht einträgt,
  erfüllt sie scheinbar — anders als bei einer bejahten Bedingung, wo fehlende Erfassung *gegen* ihn
  zählt. Das gehört in den Hilfetext, sonst verspricht die Bedingung mehr, als sie hält.
- **Risiko:** mittel-hoch — Kern.
- **Löst:** Lücke I · Fall 8

### B8 — Nachweis-Reihenfolge abschaltbar

`Task.proofOrderMatters` (Vorgabe: an, wie heute).

- **Risiko:** gering — nur `evaluateProofs`.
- **Löst:** Lücke G · Fall 3

### B9 — Weiche Frist

Toleranz **nach** der Frist, spiegelbildlich zur Kulanz davor. „19:00 ± 30 min."

- **Neu:** `Task.endGraceMin`.
- **Warum es zählt:** reale Anweisungen hängen an einem Ereignis („wenn ich heimkomme"), das schwankt.
  Heute muss die Keyholderin einen harten Zeitpunkt wählen und liegt in der Hälfte der Fälle daneben.
- **Risiko:** mittel — Kern, aber nur eine Kante.
- **Löst:** Lücke F · Fall 6

### B10 — ~~Kleidung als Geräte~~ *(verworfen, siehe Abschnitt 2a)*

Ursprünglich als kostenlose Sofortmassnahme gedacht: eine Kategorie „Kleidung" mit Slip, Leggings,
Dress. **Zurückgezogen.** Eine Kategorie ohne Zeiterfassung (`trackingEnabled: false`) liefert per
Design keine Trage-Sessions — und ohne Session gibt es keine Bedingung, denn Bedingungen werden aus
`WEAR_BEGIN`/`WEAR_END` gebaut. Mit Zeiterfassung müsste der Träger **jedes An- und Ausziehen
eintragen**. Beim Plug ist das verhältnismässig, beim Slip unter der Anzughose nicht.

Ersetzt durch **B11** und **B12**.

### B11 — Bestätigte Bedingung (ohne Gerät)

Eine Bedingung, die kein Gerät und keine Trage-Session braucht: der Träger **bestätigt sie einmal**
(„angelegt"), und sie gilt, bis er sie widerruft oder die Aufgabe endet.

- **Neu:** `TaskRequirement.type = "CONFIRMED"` mit Freitext-Beschriftung; `TaskRequirementConfirmation`
  (`requirementId`, `von`, `bis`) als Intervall-Quelle.
- **Kern:** minimal — die Bestätigungen liefern Intervalle in derselben Form wie Trage-Sessions, der
  Rest der Auswertung bleibt unberührt. Genau deshalb ist dieser Baustein billig.
- **Ehrliche Grenze:** eine Selbstauskunft ist kein Beweis. Sie macht die Bedingung *bedienbar*
  (Beginn, Abbruch, Dauer werden messbar), nicht *belegt* — dafür ist der Nachweis da. Beides
  zusammen ist die richtige Antwort für Kleidung.
- **Löst:** Kleidungs-Anteile der Fälle 5, 6 — und den ganzen Raum „trage etwas, das kein Gerät ist"

### B12 — Nachweis mit eigener Fälligkeit

Heute haben Nachweise nur eine **Reihenfolge**, keine Zeitpunkte: „drei Fotos über den Tag verteilt"
lässt sich nicht ausdrücken, „ein Foto um 12:00" auch nicht.

- **Neu:** `TaskProof.dueAt` bzw. `dueOffsetMin` (relativ zum Wirksamwerden), optional ein Fenster.
- **Kern:** nur `evaluateProofs` — ein überfälliger Nachweis wird bewertbar, statt bis zum Ende der
  Aufgabe offen zu bleiben.
- **Nebenwirkung, die man wollen sollte:** damit wird der Nachweis zur eigenständigen Fälligkeit —
  der Träger kann erinnert werden, statt am Ende alles auf einmal nachzureichen.
- **Löst:** „3× am Tag ein Foto" (Fall 5), und macht Nachweise zum tragenden Instrument für alles,
  was kein Gerät ist

---

## 2a. Warum Kleidung kein Gerät wird — und was stattdessen fehlt

`aufgaben-abdeckung.md` empfahl an drei Stellen, Kleidung als Geräte zu führen. **Das war falsch**, und
die Produktivdaten (Aufgaben-Report vom 15.08.2026, 19 Instanzen) zeigen zugleich, was richtig ist.

**Warum es nicht geht.** Eine Kategorie hat zwei Schalter, und beide führen in eine Sackgasse:

- `trackingEnabled: false` — Inventar ohne Trage-Sessions. Bedingungen werden aber aus
  `WEAR_BEGIN`/`WEAR_END` gebaut: **ohne Session keine Bedingung.**
- `trackingEnabled: true` — funktioniert, verlangt aber, dass der Träger **jedes An- und Ausziehen
  einträgt**. Beim Plug ist das verhältnismässig, beim Slip unter der Anzughose nicht.

Das ist kein Datenmodell-Problem, sondern ein **Erfassungsaufwand-Problem**. Kleidung ist zu Recht
kein Gerät.

**Was die Praxis längst tut.** Drei der zehn Aufgaben auf der Instanz `trublue` drehen sich um
Kleidung — „Was du heute drunter trägst, bestimme ich", „Rosa unter der Anzughose", „Montag im Büro,
darunter". Keine davon hat eine Trage-Bedingung; gelöst wurden sie über das **Nachweis-Foto**. Das ist
der richtige Instinkt: für etwas, das man nicht erfasst, ist das Foto der Beleg, nicht die Bedingung.

**Was daran heute fehlt.** Ein Nachweis kennt nur seine **Reihenfolge**, keine Zeit. „Drei Fotos über
den Tag verteilt" oder „ein Foto um 12:00" lassen sich nicht ausdrücken — der Nachweis kann bis zum
Ende der Aufgabe offen bleiben, und niemand kann daran erinnert werden. Deshalb **B12**.

Und wo die Bedienbarkeit fehlt (wann hat er angelegt? wann abgelegt? wie lange?), reicht eine
**Selbstauskunft mit einem Tap** — sie macht Beginn, Dauer und Abbruch messbar, ohne ein Inventar zu
verlangen. Deshalb **B11**. Beleg bleibt das Foto; die Bestätigung ist die Uhr, nicht der Beweis.

---

## 3. Weiter gedacht

Vier Ideen, die über das Schliessen der Lücken hinausgehen. Sie sind nicht Voraussetzung, aber sie
sind der eigentliche Gewinn.

### X1 — Vorlagen

Wiederkehrende Formen („Putzen mit Halsband", „Abend-Plug") einmal bauen, danach zwei Taps. Billig,
täglich spürbar — und ohnehin die halbe Datenstruktur von B5.

### X2 — Ereignis-Anker statt Uhrzeit

`Appointment` und `RecurringContext` gibt es schon, sie tragen heute aber nur Wissen. Eine Aufgabe
könnte ihre Frist daran hängen: „wenn ich heimkomme" statt „19:00" — mit B9 als Toleranz. Damit wird
aus der Wissens-Schicht eine Direktiven-Schicht, ohne ein neues Modell.

### X3 — Anweisung schreiben, Struktur vorschlagen lassen

Die Keyholderin tippt ihren Satz — *„Putze die Küche, dabei KG und Halsband, um 15:00 blitzblank"* —
und das Formular **schlägt vor**: Bedingungen KG + Halsband, Fristtyp „bis erledigt gemeldet",
Obergrenze 15:00, Nachweis-Foto. Sie prüft und ändert; abgeschickt wird nie automatisch.

Die App hat einen KI-Zugang bereits (Bildprüfung, wahlweise selbst gehostet). Das ist der direkteste
Angriff auf den eigentlichen Befund: **die Werkzeugwahl soll nicht ihr Problem sein.** Und es ist der
einzige Vorschlag hier, der auch die Fälle trägt, an die niemand gedacht hat.

### X4 — Aufgaben-Kette

„Nach dem Putzen: eine Stunde nur für mich." Ein Sonderfall von B6 (Aktion *Folge-Aufgabe* am Punkt
*erledigt gemeldet*) — erwähnenswert, weil er ohne eigenen Bauteil auskommt.

---

## 4. Etappen

Geschnitten nach Wirkung pro Aufwand, nicht nach thematischer Verwandtschaft.

### Etappe 1 — „terminieren und sauber beschriften"

**B1 · B3 · B8 · B12**

Nach dieser Etappe sind die Fälle **2, 3, 4, 10** reine Aufgaben, und **6** bis auf die weiche Frist.
B1 ist dabei die Übernahme eines dreifach erprobten Musters, B3/B8 sind klein, B12 fasst nur
`evaluateProofs` an — und macht Nachweise zum tragenden Instrument für alles, was kein Gerät ist.

*Das kleinste Paket, das die meisten Fälle bewegt.*

### Etappe 2 — „das Ende richtig setzen"

**B2 · B9 · B5**

Bringt die Fälle **1, 7, 11** dazu und schliesst **6** ab. B2 ist der inhaltlich wichtigste Baustein
überhaupt: „dabei trägst du X" ist die häufigste Form einer Anweisung, und heute erzeugt sie ein
Vergehen für vorbildliches Verhalten.

### Etappe 3 — „die Aufgabe komponiert"

**B6 · B11 · B4 · B7**

Fall **5** und **8** werden zu einer Aufgabe. B11 gehört hierher, weil es dieselbe Frage beantwortet
wie B4/B7 — was zählt als Bedingung —, aber im Gegensatz zu beiden den Kern kaum berührt: es liefert
nur eine weitere Intervall-Quelle. Wichtiger als die zwei Fälle: ab hier ist der Raum offen
— jede künftige Anweisung, die aus Text plus Mechanik besteht, ist ohne neuen Code darstellbar.

**B6 zuerst, B4 und B7 danach.** B6 fasst kein Kernstück an, B4 und B7 bauen die zentrale Rechnung um;
wer sie vorzieht, riskiert das Strafbuch für zwei Fälle.

### Etappe 4 — optional

**X1 · X2 · X3 · X4**

---

## 5. Abdeckung nach Etappe

| Fall | heute | nach 1 | nach 2 | nach 3 |
|---|---|---|---|---|
| 1 Küche putzen | 2 Aufgaben | 2 Aufgaben | **1 Aufgabe** | 1 Aufgabe |
| 2 17:00 kniend | Kontrolle | **1 Aufgabe** | 1 Aufgabe | 1 Aufgabe |
| 3 Einkaufen | 1 Aufgabe¹ | **1 Aufgabe** | 1 Aufgabe | 1 Aufgabe |
| 4 Knebel-Strafe | 1 Aufgabe¹ | **1 Aufgabe** | 1 Aufgabe | 1 Aufgabe |
| 5 Slip bei der Arbeit | 3 Instrumente | 2 Instrumente¹ | 2 Instrumente | **1 Aufgabe** |
| 6 Dienstmädchen | 1 Aufgabe¹ | 1 Aufgabe¹ | **1 Aufgabe** | 1 Aufgabe |
| 7 Plug jede Nacht | 7 Aufgaben | 7 Aufgaben | **1 Serie** | 1 Serie |
| 8 nur der KG | Sperrzeit + Text | Sperrzeit + Text | Sperrzeit + Text | **1 Aufgabe** |
| 9 Duschen nach Sport | **Regel ✓** | Regel ✓ | Regel ✓ | Regel ✓ |
| 10 Stunde für mich | 1 Aufgabe¹ | **1 Aufgabe** | 1 Aufgabe | 1 Aufgabe |
| 11 Wäsche/Knebel | Umweg | Umweg | **1 Aufgabe** | 1 Aufgabe |

¹ geht schon, aber mit Kopfrechnen bzw. mit einer erzwungenen Reihenfolge, die niemand wollte. Bei
Fall 5 ersetzt B12 (Nachweise mit eigener Fälligkeit) ab Etappe 1 die drei separaten Kontrollen —
übrig bleiben Aufgabe + Sperrzeit.

**Fall 9 bleibt bewusst draussen.** Eine Dauerregel ohne Frist und ohne Adressaten ist keine Aufgabe;
als solche gebaut müsste sie nach jedem Sport neu gestellt werden.

---

## 6. Was ich *nicht* vorschlage

- **Die Aufgabe als allgemeine Ablaufsteuerung.** B6 hat eine feste Liste von Punkten und eine feste
  Liste von Aktionen. Bedingungen an Auslösern („nur wenn …"), Verzweigungen, Schleifen: nein. Wer
  eine Workflow-Engine baut, bekommt eine, die niemand mehr beurteilen kann — und der Zustand ist hier
  abgeleitet, also ohnehin schon schwer genug.
- **Sperrzeit und Kontrolle in die Aufgabe einschmelzen.** Eine Sperrzeit wird von der Box
  *durchgesetzt*, eine Aufgabe nur *bewertet*. Das ist ein Unterschied in der Sache. B6 löst sie aus,
  ersetzt sie nicht.
- **Serien als eine bewertete Einheit.** Siehe B5.
- **Automatisches Rückgängigmachen ausgelöster Aktionen.** Siehe B6.

---

## 7. Offene Fragen

1. **B2 und die Selbstmeldung.** Wenn die Meldung die Frist beendet: darf sie weiterhin unbefristet
   nachgeholt werden? Mein Vorschlag: ja, aber nur *innerhalb* der Obergrenze — sonst dehnt eine späte
   Meldung rückwirkend eine Frist, die längst abgelaufen war.
2. **B6 und der Träger.** Sieht er die Folge-Aktionen an der Aufgabe angekündigt („danach folgt eine
   Kontrolle"), oder überraschen sie ihn? Das ist eine Entscheidung der Keyholderin, kein technisches
   Detail — vermutlich ein Haken je Aktion.
3. **B4 und die Anzeige.** Eine Aufgabe mit drei Bedingungen zu drei Zeiten ist auf einer Handy-Karte
   schwer darzustellen. Womöglich ist B4 die Stelle, an der zwei Aufgaben *ehrlicher* sind als eine —
   dann wäre der bessere Baustein X4 (Kette) statt B4.
4. **B7 und die Erfassungstreue.** Eine verneinte Bedingung belohnt Nicht-Erfassen. Reicht ein
   Hilfetext, oder darf sie nur auf Kategorien gelten, die ohnehin lückenlos geführt werden?
