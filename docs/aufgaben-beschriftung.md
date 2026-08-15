# Beschriftungen im Aufgaben-Formular — Prüfung gegen elf reale Anweisungen

Nicht „liest sich das gut?", sondern: **würde die Keyholderin für genau diese Anweisung das Richtige
wählen — und wüsste sie, was sie damit versprochen hat?** Geprüft wurde gegen die elf Fälle aus
`aufgaben-abdeckung.md`.

Stand: v5.1.2 · 15.08.2026 · **Prüfbericht, nichts davon ist umgesetzt.**

---

## 1. Die fünf, die zu falschen Aufgaben führen

### F1 — „Bedingungen" klingt nach einer Prüfung, gemeint ist eine Dauerpflicht

*Betrifft: Fälle 2, 5 · **schwerste Auswirkung: falsches Werkzeug***

Eine „Bedingung" liest sich wie etwas, das **zu einem Zeitpunkt** zutrifft — so wie eine Kontrolle
fragt „trägst du es jetzt?". Tatsächlich ist es eine **Dauerpflicht über die gesamte Frist**.

Fall 2 („um 17:00 kniend, Halsband an") ist genau die Anweisung, bei der dieser Irrtum teuer wird:
sie hakt „Halsband" an, setzt die Frist auf 17:00 — und hat damit **acht Stunden Tragezeit** verlangt
statt eines Moments. Das Formular sagt nirgends, dass sie das gerade getan hat.

| | |
|---|---|
| heute | **Bedingungen** |
| Vorschlag | **Durchgehend tragen** *(bzw. „Durchgehend erfüllen", solange KG-verschlossen dazugehört)* |

Der Name allein macht den Unterschied sichtbar, den heute nur der Hilfetext trägt — und der Hilfetext
wird gelesen, nachdem die Wahl schon getroffen ist.

---

### F2 — Der Hinweis unter der Frist verschweigt genau die Falle

*Betrifft: Fälle 1, 11 · **schwerste Auswirkung: Vergehen für erlaubtes Verhalten***

> heute: „Alle Bedingungen müssen ab dem Stellen durchgehend gelten. Wer später anlegt, trägt
> entsprechend kürzer."

Der Satz ist **wahr und wird trotzdem falsch verstanden.** Bei Fall 1 („putze die Küche, dabei KG und
Halsband, um 15:00 ist sie blitzblank") liest sie „durchgehend" und denkt: ja, beim Putzen. Was
dasteht, aber nicht gesagt wird: **auch nachdem er fertig ist, bis 15:00.** Legt er das Halsband nach
getaner Arbeit ab — was die Anweisung ausdrücklich erlaubt —, ist das ein Abbruch und damit ein
Vergehen.

| | |
|---|---|
| Vorschlag | „Alle Bedingungen müssen durchgehend gelten — **bis zum Ende der Frist, nicht nur bis die Arbeit getan ist.**" |

Das ist die Beschriftung, die den Mangel wenigstens *sichtbar* macht, solange Baustein B2 („bis
erledigt gemeldet") fehlt.

---

### F3 — Die drei Fristwege benennen zwei verschiedene Dinge

*Betrifft: Fälle 4, 6 · **schwerste Auswirkung: der ursprüngliche Vorfall in neuer Form***

„Tragezeit" beschreibt, **was gemessen wird**. „Endet in" und „Endet um" beschreiben, **wann Schluss
ist**. Der tatsächliche Unterschied zwischen den ersten beiden ist aber weder das eine noch das
andere — es ist der **Anker**: dieselbe Zahl im selben Feld, einmal ab dem Anlegen, einmal ab dem
Stellen.

Fall 4 („trage den grossen Knebel mindestens eine Stunde") ist der Test. Sie sieht „Endet in", denkt
„in einer Stunde ist es vorbei" — richtig — und übersieht, dass dann **weniger als eine Stunde
getragen** wird. Genau der Vorfall, der diesen ganzen Umbau ausgelöst hat, nur mit neuen Etiketten.

Die Reiter selbst sind auf 420 px zu schmal für lange Namen. Der Anker gehört deshalb dorthin, wo die
Zahl getippt wird — an die **Feld-Beschriftung**:

| Weg | Reiter (bleibt) | Feld heute | Vorschlag |
|---|---|---|---|
| ab dem Anlegen | Tragezeit | Tragezeit | **Tragezeit ab dem Anlegen** |
| ab dem Stellen | Endet in | Dauer | **Dauer ab jetzt** |
| fester Termin | Endet um | Zeitpunkt | Zeitpunkt |

Damit stehen die beiden Anker unmittelbar über der Zahl, auf die sie sich auswirken.

---

### F4 — „Zeit zum Anlegen" heisst in den beiden Modi etwas anderes

*Betrifft: Fälle 4, 5, 10*

Im Modus „Endet um/in" geht diese Zeit der Tragezeit **ab**. Im Modus „Tragezeit" nicht. Gleiche
Beschriftung, gegensätzliche Wirkung.

Dazu passt der Name nicht zur Grössenordnung: bei Fall 4 („Zeit bis 19 Uhr") sind es **vier Stunden**.
„Zeit zum Anlegen" klingt nach den Sekunden, die das Anlegen dauert — nicht nach einer Frist, bis zu
der begonnen sein muss.

| | |
|---|---|
| heute | **Zeit zum Anlegen** |
| Vorschlag | **Spätester Beginn** |

Beschreibt in beiden Modi dasselbe und passt zu fünf Minuten wie zu vier Stunden. Zusammen mit
Baustein B3 (Eingabe als Uhrzeit) wird daraus „Spätester Beginn: 18:00" — die Angabe, die sie
ohnehin im Kopf hat.

---

### F5 — Die Nachweis-Reihenfolge nennt die Regel, nicht die Folge

*Betrifft: Fall 3*

> heute: „…verlange Fotos als Nachweis, **in der Reihenfolge, in der sie aufzunehmen sind**."

Das liest sich wie ein Ordnungshinweis („trag sie halt der Reihe nach ein"). Tatsächlich ist es eine
**harte Regel mit Vergehens-Folge**: stimmen die Aufnahmezeiten nicht mit der Reihenfolge überein,
gilt die Aufgabe als versäumt.

Fall 3 („ein Selfie aus der Gemüseabteilung und eines aus der Blumenabteilung") würde sie arglos so
anlegen — und ein Vergehen erzeugen, wenn er zuerst an den Blumen vorbeikommt.

| | |
|---|---|
| Vorschlag | „…in der Reihenfolge, in der sie aufzunehmen sind. **Die Aufnahmezeiten müssen dieser Reihenfolge folgen — sonst gilt die Aufgabe als versäumt.**" |

Mit Baustein B8 käme ein Schalter dazu; bis dahin muss wenigstens die Folge dastehen.

---

## 2. Die sechs kleineren

### F6 — „Frist" als Überschrift über „Tragezeit"

„Frist" ist ein **Zeitpunkt**. Die erste Option darunter ist eine **Dauer**. Die Gruppe widerspricht
ihrer eigenen Option.

→ Vorschlag: **„Wie lange / bis wann?"** — eine Frage statt eines Oberbegriffs, der einen der drei
Fälle ausschliesst.

### F7 — Der Bedingungs-Hinweis stimmt nur in einem von drei Modi

> heute: „Alle gewählten Bedingungen müssen GLEICHZEITIG erfüllt sein, **damit die Zeit läuft**."

Eine Zeit, die zu laufen beginnt, gibt es nur im Modus „Tragezeit". Bei „Endet um" steht das Ende
fest, da läuft nichts los.

→ Vorschlag: den modus-abhängigen Teil streichen („…müssen GLEICHZEITIG gelten.") — er steht im
Hinweis unter der Frist ohnehin, und der wechselt korrekt mit dem Modus.

### F8 — „Noch nicht begonnen — die Zeit läuft, sobald alle Bedingungen erfüllt sind"

Auf der Karte des Trägers, in **jedem** Modus. Bei fester Endzeit läuft keine Zeit los; die Frist
läuft ohnehin schon. Gleiche Korrektur wie F7.

### F9 — „Anlass" ist blasser als sein eigener Platzhalter

Das Feld heisst **Anlass**, der Platzhalter darin sagt **Wofür**. Der Platzhalter hat recht.
„Anlass" kann auch etwas Erfreuliches sein.

→ Vorschlag: Beschriftung **„Wofür"**.

### F10 — „Mindestens zu halten" ist im Dauer-Modus eine Dopplung

Die Karte zeigt „Ohne Unterbrechung 30min ab dem Anlegen" und direkt darunter „Mindestens zu halten:
30min". Zweimal dieselbe Zahl.

→ Vorschlag: die Zeile im Dauer-Modus weglassen — dort *ist* die genannte Zahl die Haltezeit.

### F11 — Der Titel-Platzhalter setzt das falsche Bild

> heute: „z.B. Wohnung staubsaugen"

Der Aufgaben-Report über 19 Instanzen zeigt das Gegenteil: von 20 gestellten Aufgaben drehen sich die
meisten ums **Tragen** („Halsband anlegen", „Eine Stunde njoy", „Knien, 10 Minuten", „Rosa unter der
Anzughose"), nicht um Hausarbeit. Der Platzhalter ist das Erste, was sie liest, und er legt die
seltenere Sorte nahe.

→ Vorschlag: **„z.B. Halsband anlegen"**.

---

## 3. Befund je Fall

| Fall | riskante Beschriftung | Folge, wenn sie sie so liest, wie sie dasteht |
|---|---|---|
| 1 Küche putzen | **F2** | Vergehen, weil er das Halsband nach getaner Arbeit ablegt |
| 2 17:00 kniend | **F1** | acht Stunden Tragezeit verlangt statt eines Moments |
| 3 Einkaufen | **F5** | Vergehen wegen einer Reihenfolge, die nie gemeint war |
| 4 Knebel-Strafe | **F3, F4** | weniger als die versprochene Stunde |
| 5 Slip bei der Arbeit | **F1, F4** | falsches Werkzeug, Kopfrechnen bei der Startfrist |
| 6 Dienstmädchen | F3 | — (die unscharfe Frist ist Baustein B9, keine Beschriftung) |
| 7 Plug jede Nacht | — | fehlende Funktion (B5), nicht die Beschriftung |
| 8 nur der KG | — | fehlende Funktion (B7) |
| 9 Duschen nach Sport | — | das Formular ist gar nicht der richtige Ort |
| 10 Stunde für mich | **F4** | Kopfrechnen bei der Startfrist |
| 11 Wäsche/Knebel | **F2** | Vergehen, weil er den Knebel nach getaner Arbeit herausnimmt |

**Sechs der elf Fälle** würden heute an einer Beschriftung scheitern — nicht an einer fehlenden
Funktion. Das ist die billigste Baustelle im ganzen Ausbauplan.

---

## 4. Reihenfolge

1. **F1** (Bedingungen → Durchgehend tragen) — verhindert die falsche Werkzeugwahl, betrifft die
   meisten künftigen Aufgaben
2. **F2** (Hinweis: bis zum Ende der Frist) — verhindert Vergehen für erlaubtes Verhalten
3. **F3** (Anker an die Feld-Beschriftung) — schliesst den ursprünglichen Vorfall auch sprachlich
4. **F4** (Spätester Beginn) — am besten zusammen mit Baustein B3
5. **F5** (Reihenfolge-Folge nennen)
6. F6–F11 — Kleinkram, in einem Zug erledigbar

Alles davon sind reine Textänderungen in `messages/de.json` und `messages/en.json`; nur **F10**
braucht eine Zeile Code, und **F3** ist an einer Stelle an die Modus-Auswahl gebunden.

---

## 5. Was gut ist

Damit die Liste nicht als Verriss gelesen wird — diese Texte haben die Prüfung ohne Beanstandung
bestanden:

- **„Zufallscode im Bild verlangen"** — sagt genau, was passiert, und in der richtigen Reihenfolge
  (Code im Bild, nicht Code eingeben).
- **„Beginn spätestens {date} — danach gilt die Aufgabe als versäumt."** auf der Träger-Karte: nennt
  Frist **und** Folge. Genau das Muster, das F5 fehlt.
- **„Anlegen bis 15:03, dann 30min tragen"** — der zusammenfassende Satz im Dauer-Modus erzählt die
  Sache in ihrer zeitlichen Ordnung und ist in allen elf Fällen richtig.
- **„Ohne Unterbrechung bis {Zeitpunkt}"** auf der Träger-Karte: sagt dem Träger die Dauerpflicht
  deutlicher, als das Formular sie der Keyholderin sagt. Die beiden Seiten sollten sich angleichen —
  in Richtung der Träger-Karte.
