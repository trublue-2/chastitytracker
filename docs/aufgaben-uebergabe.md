# Aufgaben-Ausbau — Übergabe

Arbeitspapier für die Umsetzung der Etappen 1–4. Der **Fahrplan** (`aufgaben-fahrplan.md`) sagt
*was und warum*, dieses Dokument sagt *wo und wie* — Dateien, Funktionen, Reihenfolge, Fallstricke.

Stand: 15.08.2026 · v5.1.2 · Branch `claude/aufgaben-etappe-1-terminieren` (ab `main` @ `cebb7fd`)

| Dokument | Rolle |
|---|---|
| `aufgaben-abdeckung.md` | die elf realen Anweisungen · neun Lücken · **die Testsuite** |
| `aufgaben-ausbau.md` | die zwölf Bausteine im Detail (B1–B12, X1–X4) |
| `aufgaben-beschriftung.md` | Beschriftungs-Befunde |
| `aufgaben-fahrplan.md` | Etappen, Abdeckungs-Matrix, offene Entscheidungen |
| **dieses Dokument** | Umsetzung: Ankerpunkte im Code, Reihenfolge, Definition of Done |

---

## 1. Ausgangslage

**Etappe 0 ist umgesetzt und in `main`.** Ausgeliefert im 5.1.2-Bündel, läuft auf `:feature`
(nur Instanz `trublue`). Enthält ausserdem den Dauer-Modus der Haltezeit (`holdDurationMin`),
die drei Frist-Reiter im Keyholder-Formular und die Affordanz-Korrektur an den Zeilen-Links.

Was daraus für die Folge-Etappen wichtig ist:

- **`holdUntil` ist im Dauer-Modus die obere Schranke, nicht das wirksame Ende.** Das wirksame Ende
  liefert `effectiveHoldUntil(task, startedAt)` in `src/lib/tasks.ts`. Die Spalte bleibt gefüllt,
  weil Indizes, Sortierung und die SQL-Vorauswahl des Pollers daran hängen — **keine neue Frist-Art
  darf diese Schranke zu kurz schätzen.** Das ist per Test festgenagelt.
- **`TaskEvaluation` trägt `holdUntil`.** Jede Anzeige und jede Blockier-Logik liest ab jetzt
  `evaluation.holdUntil`, nie mehr `task.holdUntil` (`taskView.ts`, `taskIntervals.ts`,
  `mcp/dashboard.ts`). Neue Konsumenten desselben Werts machen es genauso.
- **Der Zustand einer Aufgabe ist abgeleitet, nie gestempelt.** `evaluateTask` rechnet ihn bei jedem
  Aufruf neu aus den Einträgen. Korrigiert die Keyholderin einen Eintrag, ändert sich rückwirkend das
  Urteil — **auch nach hinten.** Alles, was *zugestellt* wird, braucht deshalb einen eigenen Stempel
  (heute: `benachrichtigtAt` an den Anforderungen, `resultNotifiedAt` an der Aufgabe).

---

## 2. Etappe 1 — Terminieren

Ziel-Version **v5.2.0**. Vier Bausteine, in dieser Reihenfolge.

### B1 — `wirksamAb` · der einzige Kern-Eingriff der Etappe

**Das Muster existiert dreifach und wird übernommen, nicht neu erfunden.** Alles Nötige steht in
`src/lib/delayedTrigger.ts`:

| Funktion | Was sie tut |
|---|---|
| `computeDelayedTrigger(now, {delayMinutes, wirksamAbAt})` | → `{wirksamAb, benachrichtigtAt}` beim Anlegen |
| `isHiddenFromSub({wirksamAb, benachrichtigtAt})` | Lese-Seite: `wirksamAb !== null && benachrichtigtAt === null` |
| `deadlineFromDispatch(planned, sentAt)` | verschiebt die geplante Frist-**Spanne** auf die tatsächliche Zustellung |

Vorbilder im Bestand: `verschlussAnforderungService.ts`, `kontrolleService.ts`, dazu die Lese-Seite in
`strafbuch.ts`, `messageService.ts`, `mcpWrite.ts`.

**Schema** (`prisma/schema.prisma`, Model `Task`):

```prisma
wirksamAb        DateTime?
benachrichtigtAt DateTime?
@@index([benachrichtigtAt, wirksamAb])
```

Beide `null`-bar, `null` = „sofort wirksam, wie bisher".

**Die Reihenfolge im Index ist genau andersherum, als sie hier ursprünglich stand** — `benachrichtigtAt`
gehört nach VORN. Die Zustellung schreibt `wirksamAb` auf den Zustell-Zeitpunkt fort, also liegt die
Spalte danach bei jeder ausgelieferten Zeile in der Vergangenheit; als führende Spalte träfe der
Bereichs-Vergleich damit fast die ganze Tabelle. Die Begründung steht ausführlich am Modell selbst.

**Der Umbau in `src/lib/tasks.ts`** — es ist eine **Verschiebung des Nullpunkts**, mehr nicht:

- `startDeadline(task)` ankert heute auf `task.createdAt` → künftig auf `task.wirksamAb ?? task.createdAt`.
  Am besten ein `taskAnchor(task)`-Einzeiler, den alle drei Stellen teilen, statt dreimal `??`.
- die Berechnung des spätestmöglichen Endes im Dauer-Modus (`taskService.checkTask`) ankert mit.
- der Kandidaten-Filter in `evaluateTask` (die Intervalle, die überhaupt als Beginn in Frage kommen)
  ankert mit.

**Der Fallstrick, der dieses Muster überhaupt begründet:** ein verspäteter Poller-Tick darf keine
unerfüllbare Frist zustellen. Wird eine Aufgabe erst um 17:04 zugestellt, obwohl sie um 17:00 wirksam
werden sollte, verschiebt `deadlineFromDispatch` die geplante Spanne — die Kulanz zum Anlegen zählt
ab der Zustellung, nicht ab dem Soll-Zeitpunkt. Ohne das verliert der Träger vier Minuten Kulanz für
etwas, wovon er nichts wusste.

**Zustellung:** neuer Block in `src/lib/kontrollePoller.ts`, direkt neben `processDueTasks` (heute bei
`kontrollePoller.ts:160`). Muss dieselbe Einmal-Zusage einhalten wie die Blöcke daneben: **erst
zustellen, dann `benachrichtigtAt` stempeln, nie umgekehrt**, und im `await`-Zweig, nicht
fire-and-forget (der `running`-Riegel des Tickers ist Teil der Zusage).

**Lese-Seite:** überall dort, wo die Aufgaben des Trägers geholt werden, `isHiddenFromSub` anwenden —
Dashboard, Posteingang, Karten-Liste, MCP-Sub-Sicht, Blockier-Logik in `taskIntervals.ts`. Eine noch
nicht wirksame Aufgabe darf **nichts** blockieren und in keiner Zählung auftauchen.

**MCP:** terminierte Aufgaben gehören in `scheduledDirectives` (`src/lib/mcp/dashboard.ts`, Typ
`ScheduledDirective` bei `dashboard.ts:346`, gebaut in der `Promise.all`-Liste bei `:533`). Das ist
**additiv** — aber `openTasks` ändert dadurch seine Bedeutung („offen" schliesst künftig terminierte
aus), und das ist eine Semantik-Änderung eines Bestandsfelds → **schemaVersion 10 → 11**. Dazu
`docs/mcp-keyholder-guide.md` (per Test erzwungen) und `explain_model` §6a.

**Formular:** `src/app/admin/tasks/TaskFields.tsx`. Ein Feld „Wirksam ab" mit derselben
Sofort/Terminiert-Bedienung wie die Verschluss-Anforderung — dort abschauen, nicht neu erfinden.

### B12 — Nachweis mit eigener Fälligkeit

`TaskProof.dueAt` bzw. `dueOffsetMin` (relativ zum Anker aus B1 — deshalb **nach** B1).
Berührt nur `evaluateProofs` in `tasks.ts:303` und den `TaskProofPicker`.

Heute bleibt ein Nachweis bis zum Ende der Aufgabe offen; mit Fälligkeit wird er einzeln bewertbar
und einzeln erinnerbar. **`evaluateProofs` bekommt dadurch eine zweite Zeitachse** — vorher zählte nur
`Task.holdUntil` als Schnitt, jetzt hat jeder Nachweis seinen eigenen. Die bestehende Regel
(„nach `holdUntil` eingereicht zählt nicht") bleibt Obergrenze.

### B3 — Spätester Beginn als Uhrzeit

Reine Oberfläche. `startGraceMin` bleibt als Minutenzahl gespeichert (relativ zum Anker); das Formular
bekommt denselben Reiter-Umschalter, den der Frist-Block seit Etappe 0 hat (`FieldTabs` in
`TaskFields.tsx` — vorhanden, nur ein zweites Mal verwenden).

**Der Fehler, der in Etappe 0 schon einmal passiert ist:** beim Umschalten des Modus darf eine bereits
getippte Zahl **nicht still umgedeutet** werden. Tippen unter dem Fallback-Modus committet diesen
Modus — dasselbe Verhalten wie beim Frist-Block.

### B8 — Nachweis-Reihenfolge abschaltbar

`Task.proofOrderMatters Boolean @default(true)`. Nur `firstOutOfOrderProof` (`tasks.ts:282`) und
`evaluateProofs` überspringen die Prüfung. Kleinster Baustein der Etappe — als Aufwärmung geeignet.

---

## 3. Etappe 2 — Das Ende richtig setzen · v5.3.0

Reihenfolge **B2 → B9 → B5**.

**B2** (`holdUntilReported`) ist inhaltlich der wichtigste Baustein des ganzen Plans: „dabei trägst du
X" ist die häufigste Form einer Anweisung und erzeugt heute ein Vergehen für vorbildliches Verhalten.
`effectiveHoldUntil` liefert dann `completedAt ?? min(now, obergrenze)` — die bestehende Frist wird zur
**Pflicht**-Obergrenze, nicht zur Kür. Ablegen nach der Meldung: erlaubt. Davor: Abbruch.

**Entschieden (§5):** die Selbstmeldung ist heute unbefristet nachholbar; als Frist-Ende darf eine
späte Meldung die Frist NICHT rückwirkend dehnen — die Obergrenze gewinnt.

**B9** (`endGraceMin`) ist die Kulanz *nach* der Frist, spiegelbildlich zu `startGraceMin` davor.
Kern, aber nur eine Kante.

**B5** (Serie) lässt `evaluateTask` **unberührt** — der Poller instanziiert einzelne Aufgaben aus einer
`TaskSeries`. Jede Nacht ist eine eigene Zeile mit eigenem Urteil. **Nicht** die Serie als Ganzes
bewerten; das machte aus sieben Nächten ein unteilbares Urteil.

**Dazu (Entscheidung 3 aus §5): die Ergebnis-Meldung vorziehen.** `processDueTasks` wählt heute über
`holdUntil` vor — steht das Urteil früher fest, wartet der Versand trotzdem bis zum Aufgaben-Ende.
Braucht eine mitgeschriebene Spalte `min(holdUntil, Nullpunkt + kleinste Nachweis-Frist)`; der
Zustand selbst ist bereits sofort richtig, es geht allein um den Versand. Passt zu B9, weil beide
dieselbe Vorauswahl anfassen.

---

## 4. Etappe 3 — Die Aufgabe komponiert · v5.4.0

Reihenfolge **B6 → B11 → B4 → B7**. Die ersten beiden lassen den Kern in Ruhe, die letzten beiden
bauen ihn um — wer sie vorzieht, riskiert das Strafbuch.

**B6 (Folge-Aktionen)** ist der eigentliche Hebel: die Aufgabe löst an ihren Wendepunkten andere
Direktiven aus. Alle Auslösepunkte existieren bereits als abgeleiteter Zustand, alle Aktionen als
Dienst — es ist **kein neuer Mechanismus, nur eine Verdrahtung.** Das Prinzip „Direktive erzeugt
Direktive" steht dreimal im Bestand (`VerschlussAnforderung.dauerH`, `scheduleCleaningRelockInspection`,
`punishWithTask`).

> **Der eine Punkt, an dem B6 scheitern würde:** der Zustand ist abgeleitet und kann rückwärts gehen.
> Ein Auslöser darf nie „aus dem Zustand" feuern, sondern nur **einmalig mit Stempel**
> (`TaskActionFired`). Ausgelöstes wird nie automatisch zurückgenommen — das macht die Keyholderin.

**B11** liefert Intervalle in derselben Form wie Trage-Sessions (bestätigte Bedingung ohne Gerät) und
ist deshalb billig. **B4** (Bedingung mit eigenem Ende) baut die zentrale Rechnung um: aus „Deckung
gegen den Schnitt aller Bedingungen" wird „Prüfung je Bedingung über ihr eigenes Fenster".
**B7** (verneinte Bedingung) ist das Komplement innerhalb des Aufgaben-Fensters.

---

## 5. Entscheidungen

### Getroffen am 16.08.2026 (aus den Reviews der Etappe 1)

1. **Verspäteter Poller-Tick: die Kulanz zählt ab der Zustellung, nicht ab der genannten Uhrzeit.**
   Wird eine für 17:00 terminierte Aufgabe erst um 17:04 zugestellt, hat der Träger bis 18:04 statt
   bis 18:00. Er wird nie strenger behandelt als angekündigt; dass „18:00" real 18:04 heisst, ist der
   bewusst in Kauf genommene Preis. **Bleibt wie gebaut** (`deadlineFromDispatch`) — kein absolutes
   Frist-Feld, kein Kern-Eingriff.
2. **Eine späte Annahme rettet die Aufgabe.** Nimmt die Keyholderin einen nach der Frist eingereichten
   Nachweis an, ist die Aufgabe erfüllt — kein Vergehen. Ablehnen bleibt das Versäumnis. Das folgt dem
   Prinzip, das seit dem Aufnahmezeit-Fix ohnehin gilt: *wo sie urteilt, urteilt sie an Stelle der
   Maschine.* Gilt für BEIDE Fristen (eigene Nachweis-Fälligkeit und Aufgaben-Ende). Umgesetzt in
   Etappe 1; der Anzeige-Widerspruch (Urteil „versäumt" bei Zeile „erbracht") fällt damit weg.
3. **Das Ergebnis wird gemeldet, sobald das Urteil feststeht** — nicht erst zum Aufgaben-Ende.
   Der Keyholder-Guide verspricht das an anderer Stelle bereits; heute stimmt es dort nicht, weil
   `processDueTasks` über `holdUntil` vorwählt. **Eingeplant für Etappe 2**, weil es eine
   mitgeschriebene Spalte braucht: `min(holdUntil, Nullpunkt + kleinste Nachweis-Frist)`.

### Getroffen am 16.08.2026 (vor dem Beginn der Etappe 2)

4. **B2 — eine späte Selbstmeldung dehnt die Frist NICHT.** Die Obergrenze gewinnt:
   `effectiveHoldUntil` liefert `completedAt ?? min(now, obergrenze)`. Meldet der Träger erst nach der
   Frist, endet die Aufgabe trotzdem zur Frist — die Meldung kann sie nicht rückwirkend verlängern.
   Ablegen davor bleibt Abbruch, danach erlaubt. Die Verspätung wird nicht zusätzlich als eigenes
   Vergehen notiert.

### Noch offen

1. **Die Verspätungs-Meldung: Auslöser oder Sweep?** Heute hängt sie an zwei Ereignissen (Hochladen,
   vorgezogene Frist). Ein Block im Minuten-Tick deckte stattdessen JEDE Ursache ab und holte
   zusätzlich einen gescheiterten fire-and-forget-Versand nach — dafür braucht er eine bewusst
   begrenzte Abfrage (nur offene Aufgaben), sonst wächst die Kandidatenmenge unbegrenzt. Aufgeworfen
   vom Review zu v5.1.3; die heutige Fassung ist korrekt und getestet, die Frage ist die Flughöhe.
2. **B4 oder X4?** Mehrere Enden in *einer* Aufgabe sind auf einer Handy-Karte womöglich nicht
   verständlich darstellbar. Zwei verkettete Aufgaben (X4) wären billiger und ohne Kern-Umbau — dann
   fiele B4 ganz weg.
3. **B7 und die Erfassungstreue.** Eine Verneinung belohnt Nicht-Erfassen. Hilfetext, oder nur auf
   lückenlos geführten Kategorien erlauben?
4. **Wie weit?** Etappe 0–2 deckt neun der elf Fälle und lässt den Kern weitgehend in Ruhe.

---

## 6. Definition of Done — je Etappe

Nicht optional, sonst ist die Etappe nicht fertig:

- **Tests am Kern.** Jeder Baustein, der `evaluateTask` anfasst (B1, B2, B4, B7, B9), braucht Fälle in
  `src/lib/tasks.test.ts` — **die elf Anweisungen aus `aufgaben-abdeckung.md`, keine erfundenen.**
- **Rückwärtskompatibilität.** Jede neue Spalte `null`-bar, `null` = „wie bisher". Keine Bestands-
  aufgabe auf den Instanzen darf ihr Urteil ändern.
- **Die obere Schranke.** Jede neue Frist-Art muss `holdUntil` als gültige obere Schranke erhalten —
  sonst übersieht die SQL-Vorauswahl des Pollers eine fällige Aufgabe. Test dazu existiert.
- **MCP.** Additive Felder in `openTasks` sind frei; **geänderte Semantik eines Bestandsfelds ist ein
  schemaVersion-Bump.** Betrifft mindestens B1, B2, B4. Dazu `docs/mcp-keyholder-guide.md`
  (`mcpModelDoc.test.ts` erzwingt die Synchronität) und `explain_model` §6a.
- **i18n.** Jeder neue sichtbare String in `messages/de.json` **und** `messages/en.json`. Wer ein Feld
  umbenennt, muss die Texte durchsuchen, die den alten Namen **zitieren** — genau daran ist Etappe 0
  einmal vorbeigelaufen.
- **Changelog + Version** im selben Commit wie die Änderung. Erlaubte `type`-Werte: `feat`, `fix`,
  `security`, `perf`, `chore`, `ui` — **nicht** `refactor`. Ein bis zwei Sätze, keine Bedienungsanleitung.
- **`/simplify`** nach jeder Änderung, auch nach Einzeilern.

---

## 7. Umgebung — was in dieser Session Zeit gekostet hat

- **`npm ci` schlägt lokal fehl** (`Missing: @swc/helpers@0.5.23 from lock file`; Lockfile-Version 5
  gegen `package.json`). Auf dem CI-Runner läuft es. Lokal: **`npm install --no-save`**. Vorbestehend,
  nicht von den Aufgaben-Änderungen verursacht.
- **GitHub-API per `curl` gibt HTTP 403.** Immer die GitHub-MCP-Tools benutzen (`mcp__github__*`),
  auch fürs Beobachten von Workflow-Läufen. `gh` steht nicht zur Verfügung.
- **`git push origin --delete <branch>` gibt HTTP 403** — der Proxy blockt Branch-Löschungen, und der
  MCP hat kein Delete-Branch-Werkzeug. Aufgeräumt wird von Hand.
- **Playwright/Chromium** ist vorinstalliert (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`), **nie**
  `playwright install` aufrufen. Screenshots des laufenden Dev-Servers sind die zuverlässigste
  Kontrolle für Beschriftungs-Änderungen — der Etappe-0-Fehler (ein neuer i18n-Schlüssel wurde nie
  eingefügt) war nur so zu sehen.
- **Deploy-Rezept** für den Feature-Ring, nur die eigene Instanz:

  ```bash
  gh workflow run docker.yml --ref <branch> -f instances=trublue
  ```

  `:feature` trägt inzwischen auch fremde mittestende Instanzen — der `instances`-Filter ist deshalb
  kein Formalismus. Ein `main`-Build immer mit `-f tagFeature=true`.

---

## 8. Nächster Schritt

**B8**, dann **B1**. B8 ist der kleinste Baustein und berührt nur `evaluateProofs` — gut geeignet, um
die Testsuite und den Commit-Rhythmus einzulaufen. B1 danach als einzelner, für sich abgeschlossener
Schritt: er überträgt ein dreifach erprobtes Muster und bewegt allein schon vier der elf Fälle.
