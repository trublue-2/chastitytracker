> **Nachtrag v6:** die hier als "Geruest" beschriebene Farbwelt-Wahl ist entschieden und samt
> `IdentToggle`, `src/lib/ident.ts` und dem erzeugten `[data-ident]`-Abschnitt entfernt. Auch der
> helle Modus ist weg. Die Welt leitet sich seither aus dem Verschluss-Zustand ab
> (`src/lib/theme.ts`): gruen verschlossen, rosa offen, indigo fuer die Keyholderin.

# Übergabe — Stand 25.08.2026, abends

Das Redesign ist vom Dokument in den Code gekommen und deckt jetzt die Fläche: keine Kästen mehr,
Farbe nur noch für das, was gerade etwas will, Verlaufslisten nach Tagen gruppiert. Die Farbfrage
ist **entschieden** (Rose + Indigo, siehe unten). Ein Testbild läuft als eigener Docker-Kanal.

**Lies zuerst den Abschnitt „Arbeitsweise".** Er ist der wertvollste Teil dieser Datei — Fehlläufe
gingen darauf zurück, dass er noch nicht geschrieben war.

## Wo was liegt

| | |
|---|---|
| `chastitytracker/` | Zweig `main`, v5.3.10 — **unangetastet**, die funktionierende App |
| `kg-cat-chips/` | Zweig `design/entwurf`, gepusht — das Redesign, 19 Commits vor `main` |
| Testbild | Docker-Kanal `:design` (**nicht** `:feature`) |
| Dev-Server | Port 3400 aus `kg-cat-chips`, DB `/tmp/kg-cat-chips/db.db`, Konten `testsub` / `testkh` |
| Anleitung zum Bauen | `docs/testversion.md` |

**`main` wird nicht angefasst.** Ausdrückliche Ansage: das gesamte Redesign lebt in EINEM Zweig,
kein Merge — auch nicht für Fehlerbehebungen, die für sich genommen dorthin gehörten.

**Der oberste Prototyp-Commit `9759e55` heisst „NICHT MERGEN".** Seine Wirkung ist von späteren
Commits überschrieben (im Baum steht kein `data-variant` mehr), aber er gehört vor einer
Zusammenführung aus der Historie entfernt.

## Arbeitsweise — bitte nicht neu lernen

**trublue ist kein Designer und kann Gestaltung nicht spezifizieren.** Seine eigenen Worte: „Ich
kann es nicht formulieren – ich bin kein Designer. Ich kann nur auf mein Bauchgefühl hören."

Daraus folgt die Arbeitsteilung, und sie ist nicht verhandelbar:

> **Vorlegen statt fragen.** Bilder aus der laufenden App, er entscheidet nach Bauchgefühl.
> Keine Fragen, die eine Design-Sprache voraussetzen.

Zwei Fehlläufe dieser Sitzung, damit sie sich nicht wiederholen:

1. **Nur umgefärbt.** Der erste Anlauf stellte Tokens um und liess die Struktur stehen — derselbe
   Bildschirm, neu angemalt. Ursache: Farbe und Kontrast sind messbar, Nutzen nicht. Also entstand
   das Messbare zuerst und fühlte sich wie Fortschritt an.
2. **UX statt Ästhetik gebaut.** Auf „die UX soll nicht schlechter werden" — eine BEDINGUNG — folgte
   ein Feature. Gewollt war eine Evolution des Aussehens.

Der Massstab für jeden Schritt lautet deshalb: **welche Beschriftung kann weg?** Erst danach:
welche Farbe kommt hin.

**Der Gestaltungs-Entwurf in `docs/design/README.md` ist ein VORSCHLAG, kein Briefing.** Er stammt
selbst aus einer früheren KI-Sitzung. Zwei seiner Regeln haben Schaden angerichtet:

- *„Die Rolle sitzt im Grund, nicht im Akzent."* Begründet damit, sonst hiesse „verschlossen" beim
  Träger rosa und beim Keyholder indigo. **Das traf nicht zu** — die Bedeutungsfarben waren in
  beiden Rollen schon immer identisch (`--color-lock` war überall `#0d9151`). Die Rolle sass nur in
  der Umgebung. Ich bin der Regel gefolgt, habe ein Signal von ΔE 49,8 auf 2,9 heruntergefahren
  und musste es zurückbauen.
- *Die Marken-Rose als Identität.* Nie gefragt. trublues erste Reaktion: „es ist jetzt einfach
  schwarz/rot".

Wenn sein Bauchgefühl dem Entwurf widerspricht, gewinnt sein Bauchgefühl.

## Entschieden: Rose und Indigo

Die Frage war nie „welche von drei Varianten", sondern **zwei unabhängige**:

| | Antwort |
|---|---|
| Welche Farbe hat der Zustand „verschlossen"? | **Rose** — in BEIDEN Bereichen, es ist dieselbe Tatsache |
| Welche Farbe hat die Umgebung der Keyholderin? | **Indigo** — Kopfzeile, Navigation, Hauptknopf |

Das ist die Welt `rosa`, und sie ist die VORGABE: sie steht in den vier Theme-Blöcken selbst, ohne
Attribut. Am Code ändert die Entscheidung deshalb nichts.

**Was noch als Gerüst dasteht** und mit der Entscheidung verschwinden darf: der Umschalter in den
Einstellungen (`IdentToggle`), `src/lib/ident.ts` samt Test, das Ident-Skript im Wurzel-Layout, die
Welten-Tabelle in `tokens.mjs` und rund 400 erzeugte CSS-Zeilen für die zwei nicht gewählten
Welten. trublue wollte es bewusst noch stehen lassen, bis er die Bildschirme im Alltag gesehen hat
— die Entscheidung fiel an einem Bild, nicht an der Benutzung.

**Ein Vorbehalt, den er kennt und der seine Entscheidung nicht umstösst:** in Rose sind Warnung
(Koralle) und Zustand Nachbarn auf dem Farbkreis; das überfällige Kontroll-Banner verschmilzt mit
der grossen Zahl darunter zu einem warmen Feld. Falls das im Betrieb stört, ist die WARNFARBE die
kleinere Stellschraube (Richtung Bernstein) als die Identität.

## Was gestaltet ist

**Die zwei Muster, die das „hölzern" erklärten, sind weg** — und sie waren wichtiger als jede
Farbfrage:

1. **Alles sass in einem Kasten.** Ein Abschnitt ist jetzt eine leise Rubrik über dem Inhalt
   (`Section`), Listen laufen im Fluss der Seite, Zeilen trennt eine Haarlinie. Betroffen:
   Einträge (beide Rollen), Statistik, Einstellungen, Kategorien, Kontrollen, Sub-Detail, alle
   Erfassungs-Formulare, Sessions, Kalender, Kategorie-Ziele.
2. **Farbe sagte, WAS etwas ist.** Sie sagt jetzt nur noch „das will jetzt etwas von dir". Eine
   offene Kontrolle fällt auf, eine erfüllte nicht. `Badge` und die Kontroll-Zustände sind Schrift
   statt gefüllter Pillen; die zwölf korallenen „Kontrolle" untereinander gibt es nicht mehr.

**Dazu gestrichen statt hinzugefügt:** Verlaufslisten sind nach Tagen gruppiert (`DayGroups`), die
Zeile trägt nur die Uhrzeit — zwanzig Zeilen buchstabierten zwanzigmal dasselbe Datum aus. Und der
Ziel-Balken liegt UNTER seiner Zeile als Grundlinie statt darin, wo er um Breite konkurrierte.

**Überall wirksam:** vier Themes aus einem Generator, der jetzt SELBST ins Blatt schreibt
(`--write`) · acht Bedeutungsfarben auf drei zusammengelegt · Kopfzeile und Navigation tragen die
Rolle · Kalender in einer Helligkeits-Rampe · Typo-Skala mit sieben Stufen (`--text-kennzahl` kam
dazu: mitwachsend, weil unsere Kennzahlen wortteilige Dauern sind) · EIN Einzug für alles in einem
Abschnitt (`blockInsetCls`) — ohne Kasten garantiert kein Rahmen mehr die linke Flucht.

## Was NICHT gestaltet ist

- **Die zwölf Kategorie-Farben.** Andere Achse (WELCHE Kategorie, nicht was los ist), passen in
  ihrer Sättigung aber nicht zur neuen Zurückhaltung.
- **`ActionModal`** trägt die getönte Zeichen-Kachel weiter, die `AdminActionFormShell` verloren
  hat — dieselbe Figur, 15 Aufrufstellen ausserhalb des Umbaus. Auf demselben Bildschirm sichtbar.
- **`Pill`** behält die abgeschaffte Pillen-Optik; einzige Aufrufstelle ist die Komponenten-Schau,
  die damit die alte Norm zeigt.
- **Die Typo-Skala ist nicht vollständig migriert.** Die angefassten Dateien ja, der Bestand nicht.

## Was der alte Entwurf noch vorschlägt

trublue hat sein altes Entwurfsbild noch einmal hervorgeholt; zwei Ideen daraus sind eingebaut (der
Balken als Grundlinie, das Zustandswort als WERT statt als Rubrik). Vier weitere sind FEATURES und
warten auf seine Entscheidung:

- **Reiter statt Auswahlfeld** für die Sub-Navigation (Übersicht · Einträge · Statistik ·
  Kontrollen · Strafbuch). Eine Tippgeste statt zwei, und man sieht, was es gibt.
- **„Wartet auf dich"** — die Entscheidung samt Knöpfen dort, wo die Information steht, statt
  eines Links auf eine andere Seite. Die stärkste Idee im Bild.
- **Kachelraster „Anordnen"** für die sechs häufigsten Keyholder-Handlungen, plus eine leise Zeile
  „Weitere sechs: …".
- **Eine zweite leise Zeile unter der Dauer**: „Schlüssel in der Box · Akku 82 %".

## Der UX-Durchgang vom 26.08.2026

Drei spezialisierte Durchgänge durch die laufende App — einmal quer über beide Rollen, einmal nur
der Posteingang, einmal nur der Block-Stapel von Dashboard und Statistik. Was sich als
Beschriftung oder kleine Umstellung lösen liess, ist mit dem Stand vom 26.08. **erledigt**:

- Der (+)-Knopf beantwortet die offene Kontrolle, statt einen neuen Code zu würfeln.
- Eine Ansicht zu speichern löscht die drei anderen nicht mehr (`mergeLayout`).
- `/dashboard/new` ist keine 404-Sackgasse mehr.
- Der Code-Hinweis sitzt an der Anzeige, „Unverifiziert" heisst „Nicht geprüft", das zweite
  „Art"-Feld hat einen eigenen Namen, „← Neu" heisst „← Übersicht", die Kategorien-Werbung steht
  hinter dem Willkommen-Block, und „Kontrolle anfordern" ohne E-Mail führt zur Behebung.

**Alles Übrige liegt als Issue.** Sie tragen die Herleitung mit — jede beschreibt die Situation, in
der jemand hängenbleibt, nicht ein Prinzip:

**Träger und Keyholderin, allgemein**

- ✨ [#55](https://github.com/trublue-2/chastitytracker/issues/55) — Keyholder-Übersicht: „braucht deine Entscheidung“ bietet keine Entscheidung an
- 🐞 [#56](https://github.com/trublue-2/chastitytracker/issues/56) — Dashboard und Statistik: dieselbe Zahl, zwei Balken mit gegenteiliger Aussage
- ✨ [#57](https://github.com/trublue-2/chastitytracker/issues/57) — Kontrollen-Liste: „81 Alarme“, und der eine echte steht zwischen achtzig harmlosen
- 🐞 [#58](https://github.com/trublue-2/chastitytracker/issues/58) — Aktionen-Liste: der Untertitel bedeutet zweierlei und wird abgeschnitten
- ✨ [#59](https://github.com/trublue-2/chastitytracker/issues/59) — Einträge-Liste zeigt den Prüf-Status einer Kontrolle nicht
- ✨ [#74](https://github.com/trublue-2/chastitytracker/issues/74) — Träger sieht nie, was ihm angelastet wurde
- ✨ [#75](https://github.com/trublue-2/chastitytracker/issues/75) — Was darf die Keyholderin, wenn eine Frist verstreicht?

**Posteingang**

- 🐞 [#60](https://github.com/trublue-2/chastitytracker/issues/60) — Posteingang: Auswahl-Einstieg liegt unter der Liste und springt beim Antippen weg
- 🐞 [#61](https://github.com/trublue-2/chastitytracker/issues/61) — Posteingang: kein „alles markieren“, und die Auswahl fällt beim Blättern stumm weg
- 🐞 [#62](https://github.com/trublue-2/chastitytracker/issues/62) — Posteingang: das Kästchen ist 20 px breit — wer danebengreift, quittiert die Nachricht
- 🐞 [#63](https://github.com/trublue-2/chastitytracker/issues/63) — Posteingang: „Alle als gelesen markieren“ ignoriert den aktiven Filter
- ✨ [#64](https://github.com/trublue-2/chastitytracker/issues/64) — Posteingang: der Zähler steht nur in der Glocke, nie auf der Seite
- 🐞 [#65](https://github.com/trublue-2/chastitytracker/issues/65) — Posteingang: nach „Weiter“ landet man mitten in der neuen Seite
- ✨ [#66](https://github.com/trublue-2/chastitytracker/issues/66) — Posteingang: 14 von 19 Zeilen tragen Warnfarbe — die eine mit Forderung sticht nicht hervor
- 🐞 [#67](https://github.com/trublue-2/chastitytracker/issues/67) — Posteingang: Sammel-Löschen warnt weniger als Einzel-Löschen, und danach fehlt die Rückmeldung

**Dashboard und Statistik zusammenstellen**

- 🐞 [#68](https://github.com/trublue-2/chastitytracker/issues/68) — Dashboard anpassen: kein Abbrechen, kein Weg zurück auf Standard
- ✨ [#69](https://github.com/trublue-2/chastitytracker/issues/69) — Dashboard anpassen: die Liste nennt 15 Blöcke, der Bildschirm zeigt 5 Rubriken — mit anderen Wörtern
- 🐞 [#70](https://github.com/trublue-2/chastitytracker/issues/70) — Dashboard anpassen: ein Block mit Frist lässt sich stumm wegschalten
- ✨ [#71](https://github.com/trublue-2/chastitytracker/issues/71) — Dashboard anpassen: heisst überall gleich, steht überall ganz unten, gilt aber je Ansicht anderes
- ✨ [#72](https://github.com/trublue-2/chastitytracker/issues/72) — Dashboard anpassen: Umsortieren jagt den Knopf über den Schirm
- ✨ [#73](https://github.com/trublue-2/chastitytracker/issues/73) — Keyholder-Sub-Ansicht: die offene Kontrolle steht erst an fünfter Stelle

**Desktop** — [#76](https://github.com/trublue-2/chastitytracker/issues/76) ist **erledigt.**

Der Kern war nicht die Breite, sondern dass es kein Mass GAB. Zwei sind es jetzt, benannt in
`components/inputStyles.ts`: `readingColCls` (672 px — Fliesstext, Formulare, die ganze
Träger-Seite) und `wideColCls` (768 px — Listen mit Bild und Aktionsmenü im Keyholder-Bereich).
Neunzehn Stellen schrieben ihr Mass vorher selbst hin.

Der zweite Teil, die „uneinheitlichen Abstände", war ein Block ohne `gap`: jeder Abschnitt darin
setzte seinen Abstand von Hand (20 px, 24 px), während die achtzehn Abschnitte darunter auf 16 px
lagen. Ein Rhythmus, der einmal aussetzt, ist keiner mehr. Dazu kam eine Rubrik mit eigener
Laufweite (0,16 em gegen 0,05 em überall sonst) — sie war als einziger von 82 Abschnitten nicht
über `Section` gebaut.

**Damit das nicht zurückkommt:** `src/lib/pageMeasures.test.ts`. Er verbietet, dass eine Seite ihre
eigene Spalte aufspannt, und dass jemand die Block-Rubrik von Hand nachbaut. Die Abweichung ist
sonst unsichtbar — 672 gegen 768 px fällt in keinem Review auf, und auf 390 px, wogegen dieses
Redesign entstanden ist, fällt sie gar nicht erst an.

Was dabei aufgeschlagen ist und eigene Fäden bekam:

- ✨ [#77](https://github.com/trublue-2/chastitytracker/issues/77) — die Spalte gehört ins Bereichs-Layout, nicht auf jede Seite (braucht eine Produkt-Entscheidung: welche Seite ist Liste, welche Formular)
- ✨ [#78](https://github.com/trublue-2/chastitytracker/issues/78) — 14 Dateien bauen `BlockHeading` von Hand nach; der Test hält den fünfzehnten auf, räumt die vierzehn nicht weg
- ✨ [#79](https://github.com/trublue-2/chastitytracker/issues/79) — die Datums-Formatierer bauen pro Aufruf ein neues `Intl`-Objekt (40–100 je Darstellung)
- 🐞 [#80](https://github.com/trublue-2/chastitytracker/issues/80) — `StatusBanner` behält die Zwei-Inseln-Aufteilung, die der Rest abgelegt hat
- ✨ [#81](https://github.com/trublue-2/chastitytracker/issues/81) — zwei Blöcke bauen `Section` nach, und stellen dabei die Frage, ob `Section` seine Rubrik einrücken soll

Zwei davon sind **Produkt-Entscheidungen**, keine UI-Fragen, und blockieren die Bildschirme
darüber: [#74](https://github.com/trublue-2/chastitytracker/issues/74) (bekommt der Träger Einsicht
in seine Akte?) und [#75](https://github.com/trublue-2/chastitytracker/issues/75) (was darf die
Keyholderin, wenn eine Frist verstreicht?). Solange #75 offen ist, bricht jeder Bildschirm sein
Versprechen, der „braucht deine Entscheidung" sagt.

**Und ein Befund, der keiner UX-Prüfung entsprang, sondern dem Nachmessen:** `useLiveHours`
rechnete auf dem Server mit `nowMs = 0` und schrieb „496 602h fehlen" ins ausgelieferte HTML — die
Epoche in Stunden, mit Vorzeichen. Behoben. Die Lehre steht unten bei den Fallen.

## Werkzeuge in `docs/design/`

| Datei | Was |
|---|---|
| `tokens.mjs` | erzeugt alle vier Theme-Blöcke UND schreibt sie selbst: `node docs/design/tokens.mjs --write` |
| `kontrast.mjs` | Kontrast-Abzug über die Entwurfs-Blätter |
| `spiegeln.mjs` | spiegelt ein dunkles Entwurfsblatt nach hell; bricht ab statt zu raten |
| `README.md` / `hell.md` | der Entwurf (Vorschlag!) samt Herleitung |
| `umsetzung.md` | was im Code angekommen ist und warum |

`--write` ersetzt die vier Theme-Blöcke in `globals.css` und den erzeugten Abschnitt darunter. Es
ist idempotent und bricht ab, wenn ein Block nicht eindeutig getroffen wird — von Hand einsetzen
war die stille Fehlerquelle (der Generator lief, die Werte sahen im Terminal richtig aus, und im
Blatt stand weiter der alte Stand).

Die Farbwelten stehen in der `WELTEN`-Tabelle: `rosa` ist die Vorgabe, `gruen` und `geteilt` kommen
als Abweichung unter `[data-ident="…"]` dazu. Eine weitere Welt ist eine Zeile. `src/lib/ident.ts`
hält die Liste für den Umschalter, `ident.test.ts` prüft, dass beide Seiten zusammenpassen.

## Fallen, die diese Sitzung gekostet haben

**Textstufen gelten nur für den Untergrund, gegen den sie gemessen wurden.** Dreimal
durchgefallen: die leise Stufe schafft auf dem Grund 5,0:1 und fällt auf `surface-raised` auf 4,32,
auf einem getönten Chip auf 4,2 und auf der aktiven Navigationsfläche auf 4,41. Sie ist jetzt gegen
die jeweils UNGÜNSTIGSTE Fläche kalibriert. Wer eine neue getönte Fläche einführt, prüft das mit.

**Am gerenderten Bild prüfen, nicht an der Token-Tabelle.** Alle Befunde dieser Sitzung hingen
daran — am Token gerechnet war jede einzelne Farbe korrekt.

**Der Kontrast-Abzug muss die Sichtbarkeit von VORFAHREN prüfen.** `getComputedStyle` meldet für ein
Kind eines `display:none`-Elters trotzdem dessen eigenen Wert. So wurde auf einem 390-px-Schirm die
ausgeblendete Desktop-Seitenleiste mitgemessen und vier Durchfaller gemeldet, die niemand sehen
kann. `el.checkVisibility()` fragt den gerenderten Zustand.

**Eine Textersetzung, die nicht trifft, schweigt.** Zweimal ist eine Ersetzung im Generator ins
Leere gelaufen, weil der Suchtext vorher schon einmal geändert worden war — die Werte sahen danach
plausibel aus und waren unverändert. Jede Ersetzung braucht ein `assert`.

**Der Dev-Server übersetzt CSS nicht immer neu.** Nach einer Änderung an `globals.css` hilft ein
`printf '\n' >> src/app/globals.css` plus ein paar Sekunden Wartezeit. Das hat in diesem Durchgang
noch einmal Zeit gekostet: eine neue Regel griff nachweislich nicht, obwohl sie im Blatt stand.

**Ein Kontrast-Abzug über die Hintergrundfarben der VORFAHREN sieht keine Verläufe.** Die Tönung
hinter der grossen Zahl ist ein `radial-gradient` auf einem Geschwister-Element; ein Abzug, der
`backgroundColor` nach oben verfolgt, findet sie nie und meldet fröhlich null Durchfaller — während
die leise Stufe dort auf 4,41:1 lag. Wer dort messen will, blendet den Text aus, fotografiert die
Fläche und liest den PIXEL.

**Wer beim Messen bei 6 px vom linken Rand tastet, trifft das Zeichen, nicht den Grund.** Derselbe
Pixel-Abzug meldete 77 Durchfaller, die alle daher kamen: Farbpunkte, Icons und die Schrift eines
`<select>`, das sich von `color: transparent` nicht beeindrucken lässt. Ein Abzug, der Unsinn
misst, ist schlimmer als keiner — er kostet die Zeit ZWEIMAL.

**Der Login läuft nach zehn Anmeldungen in 15 Minuten in ein 429.** Die Sperre steht im Speicher
des Dev-Servers (`proxy.ts`, `loginBucket`), nicht in der Datenbank — Tabelle leeren hilft nicht,
Server neu starten schon. Wer viele Playwright-Läufe macht: EINMAL anmelden, `storageState`
aufheben und wiederverwenden.

## Testbild bauen

```bash
# Der Normalfall, sobald die Instanz auf :design gepinnt ist:
gh workflow run docker.yml --ref design/entwurf -f publishAs=design

# Nur bauen, ohne die Instanz anzufassen:
gh workflow run docker.yml --ref design/entwurf -f publishAs=design -f deploy=false
```

**Steht die Instanz noch NICHT auf `:design`, gehört `pinnedTo` mit dem ALTEN Pin dazu** — der
Pin-Filter wählt vor dem Umpinnen, also nach dem Tag, auf dem die Instanz gerade steht:

```bash
gh workflow run docker.yml --ref design/entwurf -f publishAs=design \
  -f channel=design -f instances=trublue -f pinnedTo=feature
```

(Erledigt am 25.08.2026 — die Instanz steht seither auf `:design` und nicht mehr auf `:feature`,
zieht also keine `:feature`-Builds mehr.)

`publishAs` ist neu (dieser Zweig): es veröffentlicht einen eigenen rollenden Kanal **statt**
`:feature`. Grund: auf `:feature` sitzen fremde Mittester, und der Tag wandert unabhängig davon,
welche Instanzen der Deploy anfasst. Reservierte Namen (`portal`, `latest`, `feature`, `v*`,
`sha-*`) brechen den Lauf ab — sonst publizierte ein Zweig am Promote-Riegel vorbei.

Kein Version-Bump auf diesem Zweig: `:v<version>`-Tags entstehen nur bei `main`-Builds, und eine
Nummer auf einem Zweig, der vielleicht nie gemergt wird, kollidiert später mit `main`.

## Testumgebung neu aufsetzen

Falls `/tmp` geleert wurde:

```bash
cd kg-cat-chips
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" npx prisma migrate deploy
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" ADMIN_USERNAME=testkh ADMIN_PASSWORD='…' node scripts/seed.js
# testsub anlegen + Beziehung zu testkh, dann:
DATABASE_URL="file:/tmp/kg-cat-chips/db.db" node scripts/seed-testdata.mjs testsub
```

Für aussagekräftige Bildschirme braucht es zusätzlich zwei Kategorien (eine mit Gerät), zwei
Trainingsvorgaben und eine offene Kontrolle — sonst rendern nur wenige Blöcke.

Bilder nimmt man mit Playwright auf; das Anmelde-Rezept steht in `scripts/dashboard-snapshot.mjs`
(`/api/auth/callback/credentials` mit CSRF-Token, `maxRedirects: 0`).
