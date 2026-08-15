# Aufgaben — Fahrplan

Der eine Plan über alles: **Texte und Funktionen**, in der Reihenfolge, in der ich sie bauen würde.
Fasst die drei Vorarbeiten zusammen und macht sie umsetzbar.

| Vorarbeit | Inhalt |
|---|---|
| `aufgaben-abdeckung.md` | Elf reale Anweisungen gegen den Werkzeugkasten · neun Lücken |
| `aufgaben-ausbau.md` | Zwölf Bausteine · das Prinzip „Direktive erzeugt Direktive" |
| `aufgaben-beschriftung.md` | Elf Beschriftungs-Befunde gegen dieselben elf Fälle |

Stand: v5.1.3 · 15.08.2026 · **Etappe 0 ist umgesetzt (v5.1.3), Etappen 1–4 sind Plan.**

---

## Der Ausgangspunkt in drei Sätzen

Die Aufgabe ist das einzige Instrument, das **einen Satz an den Träger richtet** — also fängt die
Keyholderin dort an zu tippen, egal was die Anweisung technisch verlangt. Heute muss sie danach
übersetzen („das ist eigentlich eine Sperrzeit"), und das ist eine Eigenschaft der App, nicht ihrer
Anweisung. **Sechs der elf Fälle scheitern dabei nicht an einer fehlenden Funktion, sondern an einer
Beschriftung** — deshalb steht Etappe 0 vor allem anderen.

---

## Etappe 0 — Die Texte · ✅ *umgesetzt in v5.1.3*

**Aufwand: klein** (ein halber Tag) · **Risiko: praktisch null** · reine `messages/*.json`, eine
Ausnahme mit einer Zeile Code.

Behebt die Missverständnisse in den Fällen 1, 2, 3, 4, 5, 10, 11 — ohne eine einzige neue Funktion.
Das ist der beste Aufwand-Nutzen-Schnitt im ganzen Plan.

### Die konkreten Formulierungen

| Schlüssel | heute | neu |
|---|---|---|
| `requirementsLabel` | Bedingungen | **Durchgehend tragen** |
| `requirementsHint` | …müssen GLEICHZEITIG erfüllt sein, damit die Zeit läuft. | Alle gewählten Bedingungen müssen **GLEICHZEITIG und ohne Unterbrechung** gelten. Ohne Bedingung ist es eine reine Textaufgabe. |
| `holdUntilHintRequirements` | Alle Bedingungen müssen ab dem Stellen durchgehend gelten. Wer später anlegt, trägt entsprechend kürzer. | Alle Bedingungen müssen ab dem Stellen durchgehend gelten — **bis zum Ende der Frist, nicht nur bis die Arbeit getan ist.** Wer später anlegt, trägt entsprechend kürzer. |
| `holdModeLabel` | Frist | **Wie lange / bis wann?** |
| `holdFieldFromStart` *(neu, Feld)* | — | **Tragezeit ab dem Anlegen** |
| `holdFieldDuration` | Dauer | **Dauer ab jetzt** |
| `graceLabel` | Zeit zum Anlegen | **Spätester Beginn** |
| `graceHint` | So lange darf es nach dem Stellen dauern… | Bis dahin muss **begonnen** sein — alle Bedingungen liegen an. Wer später anfängt, hat nicht durchgehend gehalten; die Aufgabe gilt dann als versäumt. |
| `proofsHint` | …in der Reihenfolge, in der sie aufzunehmen sind. | …in der Reihenfolge, in der sie aufzunehmen sind. **Die Aufnahmezeiten müssen dieser Reihenfolge folgen — sonst gilt die Aufgabe als versäumt.** |
| `penaltyReasonFieldLabel` *(neu, Feld)* | — | **Wofür** |
| `titlePlaceholder` | z.B. Wohnung staubsaugen | **z.B. Halsband anlegen** |
| `stateNotStarted` | …die Zeit läuft, sobald alle Bedingungen erfüllt sind | Noch nicht begonnen — **beginnt, sobald alle Bedingungen gleichzeitig gelten** |

Dazu die eine Code-Zeile: **`holdMinHint` im Dauer-Modus weglassen** (dort steht die Zahl schon
darüber — „Ohne Unterbrechung 30min ab dem Anlegen" und „Mindestens zu halten: 30min" ist dieselbe
Aussage zweimal).

Englische Fassung jeweils sinngleich, nicht wörtlich.

**Beim Umsetzen dazugekommen** — drei Stellen, die der Prüfbericht nicht hatte:

- `holdFromStartHint` und `previewEndTooSoon` **verwiesen namentlich auf „Zeit zum Anlegen"** und
  zeigten nach der Umbenennung auf eine Beschriftung, die es nicht mehr gibt. Wer einen Feldnamen
  ändert, muss die Texte durchsuchen, die ihn zitieren.
- `penaltyReasonLabel` wird **auch auf der Träger-Karte** benutzt („Anlass: zu spät"). Als „Wofür: zu
  spät" liest sich das dort schlechter. Die Karte behält „Anlass", das Formular bekam einen eigenen
  Schlüssel: „Wofür" ist die Frage an ein leeres Feld, „Anlass" die Überschrift über einer Antwort.
- Der **Reiter** muss kurz bleiben („Tragezeit"), damit drei Reiter auf 420 px in eine Zeile passen —
  der Anker steht deshalb an der Feld-Beschriftung darunter, mit eigenem Schlüssel.

### Warum diese Etappe zuerst

`Bedingungen` → `Durchgehend tragen` ist die wirksamste Änderung im ganzen Dokument. Das Wort
„Bedingung" liest sich wie eine Prüfung zu einem Zeitpunkt — und genau deshalb baut man Fall 2 („um
17:00 kniend, Halsband an") als Aufgabe und verlangt versehentlich acht Stunden Tragezeit. Ein Wort,
kein Code.

---

## Etappe 1 — Terminieren · *v5.2.0*

**Aufwand: mittel** · **Risiko: mittel** (ein Kern-Baustein)

| Baustein | Was | Aufwand |
|---|---|---|
| **B1** | Aufgabe terminieren (`wirksamAb`) — bis dahin unsichtbar, Fristen starten erst dann | mittel |
| **B12** | Nachweis mit eigener Fälligkeit („3× am Tag ein Foto") | klein |
| **B3** | Spätester Beginn wahlweise als Uhrzeit statt Minutenzahl | klein |
| **B8** | Nachweis-Reihenfolge abschaltbar | klein |

**B1 ist die Übernahme eines dreifach erprobten Musters** — Kontrolle, Verschluss-Anforderung und
Sperrzeit können das längst (`computeDelayedTrigger`, `isHiddenFromSub`, `deadlineFromDispatch`, der
Minuten-Tick). Nur die Aufgabe nicht.

**Danach reine Aufgaben:** Fälle 2, 3, 4, 10 · Fall 5 schrumpft auf Aufgabe + Sperrzeit.

**Nebenwirkung, die dazugehört:** terminierte Aufgaben gehören in `scheduledDirectives` des
MCP-Dashboards → schemaVersion-Bump.

---

## Etappe 2 — Das Ende richtig setzen · *v5.3.0*

**Aufwand: mittel-gross** · **Risiko: mittel-hoch** (zwei Kern-Bausteine)

| Baustein | Was | Aufwand |
|---|---|---|
| **B2** | Fristtyp „bis erledigt gemeldet" | mittel |
| **B9** | Weiche Frist (Toleranz **nach** der Frist, spiegelbildlich zur Kulanz davor) | klein-mittel |
| **B5** | Serie („jede Nacht diese Woche") | mittel |

**B2 ist inhaltlich der wichtigste Baustein überhaupt.** „Dabei trägst du X" ist die häufigste Form
einer Anweisung, und heute erzeugt sie ein Vergehen für vorbildliches Verhalten: wer nach getaner
Arbeit ablegt, bricht formal ab.

**Danach reine Aufgaben:** zusätzlich Fälle 1, 6, 7, 11.

---

## Etappe 3 — Die Aufgabe komponiert · *v5.4.0*

**Aufwand: gross** · **Risiko: gemischt** — B6 fasst den Kern *nicht* an, B4 und B7 bauen ihn um.

| Baustein | Was | Aufwand | Risiko |
|---|---|---|---|
| **B6** | **Folge-Aktionen** — die Aufgabe löst an ihren Wendepunkten andere Direktiven aus | mittel | mittel |
| **B11** | Bestätigte Bedingung ohne Gerät (ein Tap statt Inventar) | klein-mittel | gering |
| **B4** | Bedingung mit eigenem Ende | gross | **hoch** |
| **B7** | Verneinte Bedingung | mittel | mittel-hoch |

**Reihenfolge innerhalb der Etappe: B6 → B11 → B4 → B7.** B6 und B11 lassen `evaluateTask` unberührt
(B6 sind Nebenwirkungen, B11 liefert nur eine weitere Intervall-Quelle); B4 und B7 bauen die zentrale
Rechnung um. Wer sie vorzieht, riskiert das Strafbuch für zwei Fälle.

**Danach reine Aufgaben:** zusätzlich Fälle 5 und 8 — also **zehn der elf**.

---

## Etappe 4 — Komfort und Reichweite · *danach*

| Baustein | Was |
|---|---|
| **X1** | Vorlagen („Putzen mit Halsband") — billig, täglich spürbar, halbe Datenstruktur von B5 |
| **B13** | Auto-Kontrollen auf eine Kategorie statt nur auf den KG *(Lücke H)* |
| **X2** | Ereignis-Anker: Frist an einen Termin hängen („wenn ich heimkomme") statt an eine Uhrzeit |
| **X4** | Aufgaben-Kette — Sonderfall von B6, ohne eigenen Bauteil |
| **X3** | **Anweisung schreiben, Struktur vorschlagen lassen** |

**X3 ist der weiteste Vorschlag und der direkteste Angriff auf den Grundbefund.** Die Keyholderin
tippt ihren Satz, das Formular schlägt Bedingungen, Fristtyp und Nachweise vor; sie prüft und ändert,
abgeschickt wird nie automatisch. Der KI-Zugang existiert bereits (Bildprüfung, wahlweise selbst
gehostet). Es ist der einzige Punkt im Plan, der auch die Fälle trägt, an die niemand gedacht hat.

---

## Abdeckung über alle Etappen

| Fall | heute | E0 | E1 | E2 | E3 |
|---|---|---|---|---|---|
| 1 Küche putzen | 2 Aufgaben | 2 Aufgaben | 2 Aufgaben | **1 Aufgabe** | 1 |
| 2 17:00 kniend | Kontrolle | Kontrolle¹ | **1 Aufgabe** | 1 | 1 |
| 3 Einkaufen | 1 Aufgabe² | **1 Aufgabe** | 1 | 1 | 1 |
| 4 Knebel-Strafe | 1 Aufgabe² | **1 Aufgabe** | 1 | 1 | 1 |
| 5 Slip bei der Arbeit | 3 Instrumente | 3 | 2 | 2 | **1 Aufgabe** |
| 6 Dienstmädchen | 1 Aufgabe² | 1² | 1² | **1 Aufgabe** | 1 |
| 7 Plug jede Nacht | 7 Aufgaben | 7 | 7 | **1 Serie** | 1 Serie |
| 8 nur der KG | Sperrzeit + Text | + Text | + Text | + Text | **1 Aufgabe** |
| 9 Duschen nach Sport | **Regel ✓** | ✓ | ✓ | ✓ | ✓ |
| 10 Stunde für mich | 1 Aufgabe² | **1 Aufgabe** | 1 | 1 | 1 |
| 11 Wäsche/Knebel | Umweg | Umweg | Umweg | **1 Aufgabe** | 1 |

¹ Etappe 0 verhindert wenigstens, dass sie es *versehentlich* als Aufgabe baut und acht Stunden verlangt.
² geht schon, aber mit Kopfrechnen bzw. mit einer Reihenfolge, die niemand wollte — Etappe 0 räumt das aus.

**Fall 9 bleibt bewusst draussen:** eine Dauerregel ohne Frist und ohne Adressaten ist keine Aufgabe.

---

## Was zu jeder Etappe dazugehört

Nicht optional, sonst ist die Etappe nicht fertig:

- **Tests am Kern.** Jeder Baustein, der `evaluateTask` anfasst (B1, B2, B4, B7, B9), braucht Fälle
  in `tasks.test.ts` — und zwar die aus `aufgaben-abdeckung.md`, nicht erfundene. Die elf Anweisungen
  sind die beste Testsuite, die dieses Feature bekommen kann.
- **Rückwärtskompatibilität.** Jede neue Spalte ist `null`-bar und `null` bedeutet „wie bisher". Auf
  19 Instanzen stehen 20 Aufgaben; keine davon darf ihr Urteil ändern.
- **MCP.** Neue Felder in `openTasks` sind additiv; **geänderte Semantik eines Bestandsfelds ist ein
  schemaVersion-Bump** (CLAUDE.md). Betrifft mindestens B1 (scheduledDirectives), B2 und B4.
- **`explain_model`.** Abschnitt 6a beschreibt das Aufgaben-Modell für den Keyholder-Agenten — jede
  Etappe zieht ihn nach, sonst rät die KI mit veraltetem Wissen.
- **Changelog + Version** im selben Commit wie die Änderung, `/simplify` danach.

---

## Entscheidungen, die von dir kommen müssen

1. **Etappe 0, Umbenennung „Bedingungen" → „Durchgehend tragen".** Verschiebt das Denkmodell. Ich
   halte es für die wirksamste Einzeländerung im Plan, aber es ist deine Oberfläche.
2. **B2: darf eine späte Selbstmeldung die Frist dehnen?** Mein Vorschlag: nein — die Meldung beendet
   die Haltepflicht, aber nur innerhalb der Obergrenze. Sonst heilt eine Meldung von morgen eine
   Frist von gestern.
3. **B4 oder X4?** Mehrere Enden in *einer* Aufgabe sind auf einer Handy-Karte womöglich gar nicht
   verständlich darzustellen. Dann wären zwei verkettete Aufgaben (X4, billiger und ohne Kern-Umbau)
   die ehrlichere Lösung — und B4 fiele ganz weg.
4. **B7 und die Erfassungstreue.** Eine verneinte Bedingung belohnt Nicht-Erfassen. Reicht ein
   Hilfetext, oder soll sie nur auf lückenlos geführten Kategorien erlaubt sein?
5. **Wie weit?** Etappe 0–2 deckt neun der elf Fälle und lässt den Kern weitgehend in Ruhe. Etappe 3
   ist der grosse Schritt — er lohnt sich wegen des offenen Raums danach, nicht wegen der zwei
   restlichen Fälle.

---

## Was ich zuerst machen würde

**Etappe 0, heute.** Ein halber Tag, kein Risiko, behebt die Missverständnisse in sieben der elf
Fälle. Danach eine Woche im echten Betrieb schauen, ob die Aufgaben, die gestellt werden, anders
aussehen — das ist die billigste Rückmeldung, die im ganzen Plan zu haben ist.

**Dann B1** (terminieren) als einzelner Schritt, weil er ein erprobtes Muster überträgt und für sich
allein schon vier Fälle bewegt.

**Dann B2** (bis erledigt gemeldet), weil es die häufigste Form einer Anweisung betrifft und heute
ein Vergehen für erlaubtes Verhalten erzeugt.

Alles Weitere danach entscheiden — mit der Erfahrung aus dem Betrieb statt aus diesem Dokument.
