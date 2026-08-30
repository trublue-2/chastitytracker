# Was der Tracker heute abbilden kann — und was den Aufgaben fehlt

Elf reale Anweisungen, durchgespielt gegen den vorhandenen Werkzeugkasten. Ziel ist nicht, alles in
*eine* Aufgabe zu pressen: die Instrumente sind verschieden gebaut, und mehrere davon zusammen decken
oft ab, was einzeln nicht geht. Am Schluss steht die Liste dessen, was danach übrig bleibt.

Stand: v5.1.2 · erstellt 15.08.2026 · **reine Bestandsaufnahme, nichts davon ist umgesetzt.**

---

## 1. Der Werkzeugkasten

| Instrument | Kann | Kann nicht |
|---|---|---|
| **Aufgabe** | Text · 0..n Bedingungen (Gerät/Kategorie/KG verschlossen) · Nachweis-Fotos mit Code · Frist als Zeitpunkt ODER Tragezeit ab dem Anlegen · Kulanz zum Anlegen · Straf-Kennzeichen · Selbstmeldung mit Notiz | **terminieren** · wiederholen · Bedingung verneinen · Bedingungen mit verschiedenen Enden · ohne Frist auskommen |
| **Verschluss-Anforderung** | Frist zum Einschliessen · `minDurationHours` = Mindest-Tragedauer **ab dem tatsächlichen Verschluss** · `lockEndsAt` = festes Ende · bestimmtes Gerät · **terminierbar** | nur der KG, keine anderen Kategorien |
| **Sperrzeit** | „darf bis X nicht öffnen" · Reinigungsausnahme wahlweise · **terminierbar** | nur der KG |
| **Kontrolle** | Foto-Beweis mit Code, Frist · Ziel = KG **oder** Kategorie **oder** genau ein Gerät · **terminierbar** · Eskalationsstufen | keine Dauer, nur ein Zeitpunkt |
| **Auto-Kontrollen** | n Stück pro Tag, gewürfelt, mit Schlaf-Fenster und festem Auslöse-Fenster | nur KG-Kontrollen, kein Kategorie-Ziel |
| **Reinigungsregel** | erlaubte Öffnung, Höchstdauer in Minuten, Tages-Fenster, Anzahl/Tag · **danach folgt selbsttätig eine Kontrolle** | — |
| **Trainingsziel** | Mindeststunden pro Tag/Woche/Monat/Jahr je Kategorie | keine Uhrzeit-Bindung |
| **Orgasmus-Anforderung** | Zeitfenster, verlangte Art, Öffnen erlaubt | — |
| **Notiz / Termin / wiederkehrender Kontext** | Dauer-Anweisungen, Grenzen, Kalender, „jeden Dienstag Pilates" | nichts Prüfbares |
| **Vergehen von Hand** | alles, was der Tracker nicht sehen kann | — |

**Die entscheidende Asymmetrie:** *Terminieren* (`wirksamAb` — bis dahin für den Träger unsichtbar,
Frist startet erst dann) können Kontrolle, Verschluss-Anforderung und Sperrzeit. Die Aufgabe nicht.
Das ist die mit Abstand häufigste Lücke unten.

---

## 2. Die elf Fälle

### Fall 1 — Küche putzen, KG + Halsband, Halsband ab „fertig" frei, 15:00 blitzblank

**Abbildung**

- Aufgabe A „Küche putzen": keine Bedingungen, Frist **Endet um 15:00**, Nachweis-Foto der sauberen Küche.
- Aufgabe B „Halsband beim Putzen": Bedingung KG + Halsband, Frist **Tragezeit** = geschätzte Putzdauer.

**Warum zwei.** Die Anweisung enthält zwei verschiedene Fristen: die Küche ist an *15:00* gebunden, das
Halsband an *„solange du putzt"*. Eine einzelne Aufgabe kann das nicht, weil ihre Bedingungen bis zur
Frist durchgehend gelten müssen — legt er das Halsband um 13:00 ab, wäre das ein Vergehen, obwohl es
genau das ist, was erlaubt wurde.

**Rest-Lücke:** die Putzdauer muss geraten werden. → *Lücke B*

---

### Fall 2 — Um 17:00 kniend im Gang, Halsband an

**Abbildung**

- **Kontrolle**, terminiert auf 17:00, Ziel = Kategorie Halsband, Frist 5 Minuten.
- Dazu eine Notiz/Dauer-Anweisung für „kniend im Gang empfangen".

**Warum keine Aufgabe.** Eine Aufgabe mit Trage-Bedingung und Frist 17:00 verlangte das Halsband
**ab dem Stellen durchgehend** — also womöglich acht Stunden statt eines Moments. Gemeint ist ein
Zustand *zu einem Zeitpunkt*, und genau dafür ist die Kontrolle gebaut: sie fragt „zeig mir das
jetzt". Terminiert bleibt sie bis 17:00 unsichtbar, der Überraschungseffekt bleibt erhalten.

**Rest-Lücke:** „kniend im Gang" ist nicht maschinell prüfbar — das Foto zeigt es, beurteilen musst du.
Kein Mangel, sondern die Grenze jeder Automatik.

---

### Fall 3 — Einkaufen in pinken Leggings, zwei Selfies, 19:00 zuhause

**Abbildung**

- Aufgabe: Anweisungstext (Leggings), **zwei Nachweis-Fotos** („Selfie in der Gemüseabteilung",
  „Selfie in der Blumenabteilung"), Frist **Endet um 19:00**, keine Bedingungen.

Der am besten passende Fall — er braucht nur Aufgaben.

**Rest-Lücken**

- Die Nachweis-**Reihenfolge wird erzwungen** (Aufnahmezeiten müssen aufsteigen). Hier ist sie nicht
  gemeint: ob Gemüse oder Blumen zuerst, ist gleichgültig. → *Lücke G*
- Die Leggings sind kein Gerät, also nicht prüfbar — hier trägt das **Nachweis-Foto** den Beleg, und
  das genügt. (Eine frühere Fassung empfahl, Kleidung als Geräte zu führen; das ist **zurückgezogen**,
  Begründung in `aufgaben-ausbau.md`, Abschnitt 2a.)

---

### Fall 4 — Grosser Knebel als Strafe, mindestens eine Stunde, Zeit bis 19:00

**Abbildung**

- Aufgabe: Bedingung = **genau dieses Gerät** („grosser Knebel"), Frist **Tragezeit 60 Minuten**,
  Kulanz „Zeit zum Anlegen" so gesetzt, dass sie um 18:00 abläuft, Haken **Als Strafe**.

Vollständig abbildbar — seit dem Dauer-Modus. Vorher hätte „1 Stunde" bei 30 Minuten Kulanz eine halbe
Stunde bedeutet.

**Rest-Lücke:** die Kulanz wird in **Minuten** eingegeben, gemeint ist aber eine Uhrzeit. Um 14:00
gestellt heisst „bis 18:00" = 240 eintippen — Kopfrechnen, das genau die Sorte Fehler einlädt, um die
es hier geht. → *Lücke C*

---

### Fall 5 — Morgen bei der Arbeit pinker Slip über dem KG, 3× täglich ein Foto, ab 20:00 Slip frei, KG bleibt

**Abbildung**

- **Sperrzeit** für den KG, terminiert auf morgen früh, Ende nach dem Sport.
- **Drei Kontrollen**, terminiert auf verteilte Zeiten während der Arbeitszeit — oder Auto-Kontrollen
  mit `perDay = 3` und Auslöse-Fenster = Arbeitszeit, wenn die Zeitpunkte überraschen sollen.
- Aufgabe für den Slip: Anweisungstext, Frist **Endet um 20:00**.

**Warum verteilt.** Zwei Kleidungsstücke mit **verschiedenen Enden** (Slip 20:00, KG weiter) passen
nicht in eine Aufgabe: alle Bedingungen einer Aufgabe teilen sich eine Frist.

**Rest-Lücken**

- Die Aufgabe für den Slip ist nicht terminierbar — du musst sie morgen früh selbst stellen. → *Lücke A*
- Zwei Enden in einer Anweisung. → *Lücke E*
- Auto-Kontrollen zielen nur auf den KG, nicht auf eine Kategorie. → *Lücke H*

---

### Fall 6 — Heimkommen „üblicherweise 19:00": Bad geputzt, Dienstmädchen-Dress, KG + passendes Halsband, Outfit den ganzen Tag getragen

**Abbildung**

- Aufgabe: Bedingungen KG + **das bestimmte Halsband**, Frist **Endet um 19:00**, Nachweis-Foto vom
  Bad, Anweisungstext für das Dress.
- „Den ganzen Tag getragen" als **Trainingsziel** (Mindeststunden/Tag auf der Kategorie) — oder, wenn
  das Dress als Gerät geführt wird, als zweite Aufgabe im Dauer-Modus.

**Rest-Lücken**

- Die Frist ist **unscharf** („üblicherweise"), das Formular verlangt einen exakten Zeitpunkt. Kommst
  du um 18:45, ist eine auf 19:00 gestellte Aufgabe formal noch nicht fällig; kommst du um 19:20, war
  sie schon verletzt. Eine Kulanz gibt es nur am **Anfang**, nicht am Ende. → *Lücke F*
- „Den ganzen Tag" ist ohne Gerät nicht messbar. Eine **Selbstauskunft mit einem Tap** (Baustein B11)
  wäre die verhältnismässige Antwort — sie macht die Dauer messbar, ohne ein Kleider-Inventar zu
  verlangen; belegt wird sie weiterhin durch das Foto.

---

### Fall 7 — Diese Woche jede Nacht Plug, 22:00 bis frühestens 06:00

**Abbildung**

- **Sieben** Aufgaben, jede mit Bedingung Plug und Frist „Endet um 06:00" — von Hand, Abend für Abend.
- Alternativ ein **Trainingsziel** „8 Stunden/Tag" auf der Kategorie Plug: das misst die Menge, bindet
  sie aber an keine Uhrzeit.

Über Mitternacht ist unproblematisch — Fristen sind absolute Zeitpunkte.

**Rest-Lücke:** es gibt keine Serie. Sieben gleiche Aufgaben von Hand ist die einzige Antwort, und
spätestens am dritten Abend vergisst man eine. → *Lücke D*

---

### Fall 8 — Heute nur der KG, kein Halsband, kein Plug, und der KG bleibt zu

**Abbildung**

- **Sperrzeit** bis Tagesende, Reinigungsausnahme nach Wunsch. Deckt die zweite Hälfte vollständig ab.
- Die erste Hälfte („nichts anderes tragen") nur als Anweisungstext — und bei Verstoss ein **Vergehen
  von Hand**.

**Rest-Lücke:** eine Bedingung lässt sich nur bejahen, nicht verneinen. „Trage X" geht, „trage gerade
kein X" nicht — obwohl die Daten dafür da wären: eine laufende Trage-Session ist genau das, was eine
verneinte Bedingung prüfen müsste. → *Lücke I*

---

### Fall 9 — Nach dem Sport duschen, sofort wieder verschliessen, höchstens 20 Minuten, Foto mit Code

**Abbildung — hier braucht es gar keine Aufgabe.**

- **Reinigungsregel**: erlaubt, `maxMinutes = 20`, Tages-Fenster auf die Zeit nach dem Sport,
  `maxPerDay = 1`.
- Die Kontrolle mit Code entsteht **von selbst**: auf jeden Wiederverschluss nach einer Reinigungspause
  folgt selbsttätig eine Kontrolle. Feste Regel, keine Einstellung.

Der einzige Fall, der bereits vollständig und ohne Umweg abgedeckt ist. Wer ihn als Aufgabe zu bauen
versucht, macht es schlechter.

**Rest-Lücke:** keine. „Nach dem Sport" wird zum Uhrzeit-Fenster — solange der Sport einen festen
Termin hat, ist das deckungsgleich.

---

### Fall 10 — Irgendwann heute eine Stunde nur für mich, Beginn vorher ankündigen, danach Bericht

**Abbildung**

- Aufgabe: Bedingung Halsband, Frist **Tragezeit 60 Minuten**, Kulanz bis Tagesende.
- Der **Bericht** ist die Notiz zur Erledigt-Meldung — dafür gibt es das Feld bereits.
- Die **Ankündigung** entsteht nebenbei: das Anlegen erzeugt einen Trage-Eintrag, und dafür gibt es
  eine Benachrichtigung an die Keyholderin. Nicht „vorher", aber im selben Moment.

Fast vollständig. „Handy weg" ist nicht prüfbar und bleibt Text.

**Rest-Lücke:** dieselbe wie bei Fall 4 — die Kulanz „bis Tagesende" muss in Minuten umgerechnet
werden. → *Lücke C*

---

### Fall 11 — Solange die Wäsche nicht gemacht ist, bleibt der Knebel drin

**Abbildung**

- Aufgabe: Bedingung Knebel, Frist notgedrungen **Endet um 23:59**, Selbstmeldung = „Wäsche fertig".

**Das ist ein Umweg, kein Abbild.** Gemeint ist „das Ende bestimmst du durch dein Tun"; gebaut wird
daraus „bis Mitternacht". Nimmt er den Knebel nach getaner Arbeit um 20:00 heraus, ist das nach dem
Modell ein **Abbruch** — also ein Vergehen für genau das Verhalten, das verlangt war.

**Rest-Lücke:** eine Aufgabe braucht zwingend ein Ende. Es fehlt „hält, bis erledigt gemeldet wird".
→ *Lücke B*

---

## 3. Was fehlt — Sammelliste

Sortiert nach Wirkung: wie viele der elf Fälle die Lücke berührt, und wie schwer sie wiegt.

### A. Aufgabe terminieren („wirksam ab") — **Fälle 2, 5, 6, 7**

Die grösste Lücke, und die billigste. Kontrolle, Verschluss-Anforderung und Sperrzeit haben
`wirksamAb` samt Poller-Zustellung bereits; nur die Aufgabe nicht. Ohne sie ist jede Anweisung für
„morgen" oder „heute Abend" Handarbeit zur richtigen Minute — oder sie wird zu früh sichtbar und
verlangt damit versehentlich stundenlanges Tragen.

Bestehende Bausteine: `computeDelayedTrigger`, `deadlineFromDispatch`, `isHiddenFromSub`, der
Minuten-Tick. Es wäre die Übernahme eines gelösten Musters, keine Erfindung.

### B. Bedingung endet mit der Erledigt-Meldung — **Fälle 1, 11**

Heute gilt: Bedingungen halten bis zur **Frist**. Gemeint ist oft: bis zur **Erledigung**. Wer früher
fertig ist und ablegt, bekommt ein Vergehen für vorbildliches Verhalten. Betrifft jede Anweisung der
Form „dabei trägst du X" — und das ist eine sehr häufige Form.

Denkbar als dritter Fristtyp neben „Endet um" und „Tragezeit": **„bis erledigt gemeldet"**, mit der
bestehenden Frist als Obergrenze.

### C. Startfrist als Uhrzeit statt Minutenzahl — **Fälle 4, 10**

„Zeit zum Anlegen" ist ein Minutenfeld. Gemeint ist fast immer eine Uhrzeit („beginnen bis 18:00").
Die Umrechnung im Kopf ist genau die Sorte Rechnung, die dieses Feld schon einmal falsch gemacht hat.
Das Frist-Feld daneben kann beides — hier fehlt es.

### D. Wiederholung / Serie — **Fall 7**

Sieben Abende = sieben Aufgaben von Hand. Kein anderes Instrument kennt Wiederholung, insofern eine
neue Fähigkeit — aber `RecurringContext` zeigt, dass das Datenmodell für Wochentags-Muster schon eine
Form hat.

### E. Bedingungen mit eigenen Enden — **Fall 5**

Alle Bedingungen einer Aufgabe teilen sich eine Frist. „Der Slip bis 20:00, der KG weiter" braucht
deshalb zwei Direktiven. Wäre gestaltbar als optionales Ende je Bedingung.

### F. Weiche Frist / Toleranz am Ende — **Fall 6**

Es gibt eine Kulanz am **Anfang**, aber keine am **Ende**. Reale Anweisungen hängen an einem Ereignis
(„wenn ich heimkomme"), das um eine halbe Stunde schwankt. Heute muss die Keyholderin sich für einen
harten Zeitpunkt entscheiden und liegt damit in der Hälfte der Fälle falsch.

### G. Nachweise ohne Reihenfolge-Zwang — **Fall 3**

Die Aufnahmezeiten müssen der Liste folgen, immer. Manchmal ist die Reihenfolge die Forderung
(Verschluss vor Plug), manchmal ist sie zufällig (Gemüse vor Blumen). Ein Schalter „Reihenfolge zählt"
je Aufgabe würde beides erlauben.

### H. Auto-Kontrollen auf eine Kategorie — **Fall 5**

Auto-Kontrollen prüfen nur den KG. Einzelne Kontrollen können längst auf eine Kategorie oder ein Gerät
zielen — die Automatik ist da noch nicht nachgezogen.

### I. Verneinte Bedingung — **Fall 8**

„Trage gerade kein X". Die Daten lägen vor (eine laufende Trage-Session ist genau die Antwort), das
Modell kennt aber nur bejahte Bedingungen.

---

## 4. Ohne Codeänderung sofort besser

- **Kleidung über Nachweis-Fotos führen, nicht über Geräte.** Ein Gerät verlangt, dass jedes An- und
  Ausziehen eingetragen wird — beim Plug verhältnismässig, beim Slip unter der Anzughose nicht. Die
  Praxis auf den Instanzen macht es bereits so (drei Kleidungs-Aufgaben, alle über Fotos gelöst).
  Ausführlich: `aufgaben-ausbau.md`, Abschnitt 2a.
- **Fall 9 nicht als Aufgabe bauen.** Die Reinigungsregel deckt ihn vollständig ab, inklusive der
  Kontrolle danach. Eine Aufgabe wäre hier die schlechtere Lösung.
- **Fall 2 als Kontrolle statt als Aufgabe.** „Zustand zu einem Zeitpunkt" ist die Frage, für die die
  Kontrolle gebaut ist. Eine Aufgabe würde daraus versehentlich eine Tragedauer machen.

---

## 5. Was bewusst NICHT fehlt

Damit die Liste oben nicht als Vollständigkeits-Anspruch gelesen wird:

- **„Kniend im Gang", „Handy weg", „blitzblank"** sind nicht maschinell prüfbar und sollen es nicht
  sein. Dafür gibt es Selbstmeldung, Nachweis-Foto und dein Urteil.
- **Eine Aufgabe, die alles kann.** Mehrere Fälle sind mit zwei Instrumenten *besser* abgebildet als
  mit einem — die Trennung zwischen „Zustand jetzt" (Kontrolle), „bleib zu" (Sperrzeit) und „tu etwas"
  (Aufgabe) trägt.
