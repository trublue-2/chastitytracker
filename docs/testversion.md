# Test-Version bauen

Stand: 25.08.2026 · Zweig `design/entwurf` · aufsetzend auf `main` v5.3.10

## Der eine Befehl

```bash
gh workflow run docker.yml --ref design/entwurf -f instances=trublue
```

Das baut das Image, taggt es als `:feature` und startet **nur trublues Instanz** neu. Danach:

```bash
gh run watch "$(gh run list --workflow=docker.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Grün heisst: `typecheck`, `build-and-push` und `deploy` sind durch.

## Bevor du das tust — eine Sache, die nicht abschaltbar ist

**Jeder Build von einem anderen Zweig als `main` verschiebt den `:feature`-Tag.** Das steht fest im
Workflow (`enable=${{ github.ref_name != 'main' || inputs.tagFeature }}`) und lässt sich über keine
Dispatch-Eingabe verhindern.

`instances=trublue` steuert nur, **wer sofort neu gestartet wird**. Der Tag wandert trotzdem — und
jede fremde Instanz, die auf `:feature` gepinnt ist, zieht diesen Stand beim nächsten Neustart ihres
Containers.

Das ist hier relevant, weil das Redesign **nicht fertig** ist: von zehn Bildschirmen sind zwei
überarbeitet. Wer mittestet, bekommt eine Anwendung, die zur Hälfte neu und zur Hälfte alt aussieht.

Wenn das nicht sein soll, gibt es genau zwei Wege:

1. Vorher ankündigen, dass auf `:feature` gerade ein Redesign liegt.
2. Warten, bis mehr Bildschirme fertig sind.

## Warum der Deploy risikoarm ist

Geprüft gegen `main`:

| | |
|---|---|
| Neue Migrationen | **keine** |
| Schema-Änderungen | **keine** |
| Neue Umgebungsvariablen | **keine** |
| Änderungsumfang | 76 Dateien, fast ausschliesslich Oberfläche |

Es gibt also **nichts zurückzurollen ausser dem Image**. Keine Datenbank wird angefasst, keine
bestehenden Daten werden umgeschrieben.

## Zurück zum alten Stand

```bash
gh workflow run docker.yml --ref main -f tagFeature=true
```

Baut `main` und zieht `:feature` darauf zurück. Ein Neustart, keine Datenmigration, kein Datenverlust.

## Welchen Build fahre ich gerade?

**Die Versionsnummer hilft nicht** — sie steht auf dem Zweig weiterhin auf `5.3.10`, genau wie
`main`. Das ist Absicht: `:v<version>`-Tags entstehen nur bei `main`-Builds, und eine Nummer auf
einem Zweig, der vielleicht nie gemergt wird, kollidiert später mit derselben Nummer auf `main`
(so geschehen im August 2026 mit v5.3.0, korrigiert per Force-Push).

Erkennen lässt sich der Build so:

- **Am Aussehen.** Der Unterschied ist nicht zu übersehen.
- Über `GET /api/version` — `buildDate` unterscheidet sich.
- Über das Image-Label: `docker buildx imagetools inspect ghcr.io/trublue-2/chastitytracker:feature
  --format '{{json .Image}}' | jq -r '.config.Labels["org.opencontainers.image.revision"]'`
  liefert den Commit.

## Was in diesem Stand drin ist

**Zwei Bildschirme sind überarbeitet:**

- *Träger-Übersicht* — die Dauer trägt den Bildschirm statt in einer Karte zu stehen; der Zustand
  wird einmal genannt statt dreimal; die Trainingsziele sagen, ob das Ziel noch zu schaffen ist,
  statt einen Prozentwert zu zeigen.
- *Keyholder-Übersicht* — beginnt mit der Zahl der offenen Entscheidungen; nur wer etwas braucht,
  steht ausgeklappt; der Rest ist eine leise Zeile.

**Überall wirksam:**

- Vier Themes aus einem Generator (`docs/design/tokens.mjs`), Farben nur noch über Tokens
- Acht Bedeutungsfarben auf drei zusammengelegt (zwei Paare waren vorher schon farbgleich)
- Kopfzeile und Navigation tragen die Rolle — Rose beim Träger, Indigo beim Keyholder
- Der Tragekalender läuft in einer Helligkeits-Rampe statt in Blau
- `Card` ohne Rahmen und Radius, `Button` ohne Schatten
- Eine Typo-Skala mit sechs nach ihrer Aufgabe benannten Stufen (definiert, erst teilweise benutzt)

**Zwei Fehler nebenbei behoben:** der Träger-Dunkelmodus zeigte helle Kategorie-Chips; drei
tickende Zahlen sprangen, weil ihnen tabellarische Ziffern fehlten.

**Nicht angefasst:** Einträge, Erfassen, Kategorien, Einstellungen, Sub-Detail, Kontrollen-Liste,
Statistik-Kacheln. Diese Bildschirme haben neue Farben, aber den alten Aufbau.

## Worauf beim Testen zu achten ist

1. **Beide Rollen und beide Modi** — das sind vier Fassungen, und Fehler traten bisher in genau
   einer davon auf (zuletzt: die Navigations-Beschriftung, nur hell und nur beim Keyholder).
2. **Der Wechsel zwischen den Bereichen.** Erkennst du ohne Nachdenken, ob du im Träger- oder im
   Keyholder-Bereich bist? Der Unterschied liegt in Kopfzeile und Navigation.
3. **Die Zielzeile am Abend.** Sie soll dann „… fehlen" in Koralle zeigen statt eines Prozentwerts.
4. **Der Bruch zwischen Neu und Alt.** Zwei Bildschirme sind gestaltet, acht nicht — sichtbar wird
   das vor allem beim Wechsel von der Übersicht in die Eintragsliste.

## Was der Zweig NICHT verträgt

**Kein Merge nach `main` in diesem Zustand.** Der Commit `9759e55` heisst „NICHT MERGEN" — er war
ein Prototyp zum Farbvergleich. Seine Wirkung ist von späteren Commits überschrieben (im Baum steht
kein `data-variant` mehr), aber er gehört vor einer Zusammenführung aus der Historie entfernt.

Auf `main` liegt weiterhin der funktionierende Stand. Er wurde in dieser Arbeit nicht angefasst.
