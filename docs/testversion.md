# Test-Version bauen

Stand: 25.08.2026 · Zweig `design/entwurf` · aufsetzend auf `main` v5.3.10

## Der eine Befehl

Baut das Image und veröffentlicht es als `:design`. **Keine Instanz wird angefasst** — das
`docker-compose.yml` ziehst du selbst nach:

```bash
gh workflow run docker.yml --ref design/entwurf -f publishAs=design -f deploy=false
```

Lauf verfolgen:

```bash
gh run watch "$(gh run list --workflow=docker.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Danach in der `docker-compose.yml` der Instanz:

```yaml
image: ghcr.io/trublue-2/chastitytracker:design
```

und `docker compose pull && docker compose up -d`.

Soll der Workflow das Umpinnen und den Neustart selbst übernehmen, geht auch:

```bash
gh workflow run docker.yml --ref design/entwurf -f publishAs=design -f channel=design -f instances=trublue
```

## Warum ein eigener Kanal

Ein Build von einem Nicht-`main`-Zweig taggt normalerweise `:feature`. Auf diesem Ring sitzen
inzwischen auch fremde Mittester — ein halbfertiges Redesign dorthin zu schieben trifft Leute, die
etwas anderes erwarten, und zwar beim nächsten Neustart ihres Containers, ohne dass sie es wählen.

`publishAs=design` veröffentlicht **statt** `:feature` einen eigenen rollenden Kanal. `:feature`
bleibt unberührt.

Reservierte Namen (`portal`, `latest`, `feature`, `v*`, `sha-*`) brechen den Lauf ab. Ohne diese
Schranke veröffentlichte ein Zweig-Build direkt in die Portal-Flotte oder den Release — die Ringe
garantieren nur etwas, solange das nicht geht.

## Zurück auf den alten Stand

Im `docker-compose.yml` wieder auf `:feature` (oder `:portal`) zeigen und neu ziehen. Ein Neustart,
keine Datenmigration, kein Datenverlust — dieser Zweig ändert weder Schema noch Daten.

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
