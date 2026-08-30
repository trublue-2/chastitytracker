# Orgasmus-Direktive

## Zweck

Ein Zeitfenster, in dem ein Orgasmus vorgesehen ist. Es ist immer nur **eine** Direktive aktiv.

## Zwei Charaktere, ein Modell

| `art` | Bedeutet | Ungenutzt |
|---|---|---|
| `ANWEISUNG` | Pflicht | erkanntes Vergehen (`missed_orgasm`) |
| `GELEGENHEIT` | Erlaubnis | folgenlos |

Der Unterschied steckt vollständig in diesem einen Feld — sonst ist die Mechanik identisch.

## Stellschrauben

Sieben, alle je Direktive: `art`, `beginntAt`, `endsAt`, `vorgegebeneArt`, `oeffnenErlaubt`,
`wirksamAb`, `message`. Siehe [stellschrauben.md](stellschrauben.md).

## `oeffnenErlaubt`: der einzige geplante Sperrbruch

Ist es gesetzt, darf der Sub sich im Fenster öffnen, ohne dass das als unautorisierte Öffnung zählt.
Das ist der **einzige** Weg, eine laufende Sperrzeit gezielt und folgenlos zu durchbrechen — jeder
andere Öffnungsgrund ausser einer erlaubten Reinigung hebt die Sperrzeit auf und bucht ins
Strafbuch.

## Es gibt kein Ändern

Als einzige Direktive hat das Orgasmus-Fenster **kein Änderungs-Werkzeug** — weder in der App noch
über den MCP. Sperrzeit, Einschliess-Anforderung, Aufgabe und Trainingsziel haben je eines; hier
kennt die Route nur das Zurückziehen.

Anders wollen heisst also: zurückziehen und neu stellen. Für den Träger sieht das aus wie zwei
Vorgänge, weil es zwei sind.

## Auslöser & Erfüllung

Der Keyholder stellt die Direktive (`request_orgasm` oder Admin-UI). Erfüllt wird sie **automatisch**
durch einen passenden `ORGASMUS`-Eintrag im Fenster — passend heisst: ist eine `vorgegebeneArt`
gesetzt, muss die Art stimmen.

Bei `wirksamAb` existiert die Direktive vorher für den Sub nicht: das Fenster gilt nicht, es erlaubt
kein Öffnen, und es erfüllt sich nicht.

## Wirkt auf

- **Sperrzeit** — über `oeffnenErlaubt`.
- **Strafbuch** — eine versäumte ANWEISUNG wird erkannt (nicht automatisch bestraft). Ein Orgasmus
  ohne deckende Direktive kann als `unauthorized_orgasm` zählen; ob überhaupt, entscheidet die
  Vergehensregel, und die steht standardmässig auf aus.
- **Einträge** — `vorgegebeneArt` verweist auf dieselbe Werteliste wie `User.orgasmusArtenConfig`.

## Sichtbarkeit für den Sub

Ab `wirksamAb` vollständig, inklusive Öffnungserlaubnis.

## Code

`orgasmusAnforderungService.ts`, `entryFulfilment.ts`, Modell `OrgasmusAnforderung`.

## Tests

`orgasmusAnforderungService.test.ts`, `entryFulfilment.test.ts`, `subOffenses.test.ts`.
