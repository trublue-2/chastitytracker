# Vergehen & Strafbuch

## Zweck

Das Strafbuch trennt zwei Dinge, die sonst dauernd verwechselt werden: **was der Server erkannt hat**
und **was der Keyholder entschieden hat**. Der Server zählt, der Mensch (oder die KI) urteilt.

## Erkannt ≠ bestraft

Ein erkanntes Vergehen ist eine **Vorlage für ein Urteil, keine Konsequenz**. Es gibt keine
automatische Strafe. Ein Vergehen zählt erst als bestraft, wenn ein Urteil vorliegt.

Die meisten Vergehen sind **live abgeleitet** — sie entstehen beim Lesen aus den Einträgen. Daraus
folgt: eine zurückgezogene Sperrzeit tilgt die daran hängenden Vergehen mit. Genau eine Art fällt aus
der Reihe.

## Die Arten

| Kanonisch | Entsteht aus |
|---|---|
| `unauthorized_opening` | Öffnung ohne Deckung |
| `late_control` / `rejected_control` | Kontrolle zu spät bzw. abgelehnt |
| `auto_removed_control` | Eskalationsstufe 2 hat die Abnahme gebucht |
| `cleaning_limit` | Tageskontingent der Reinigung überschritten |
| `cleaning_not_relocked` | nach der Reinigungspause nicht wieder verschlossen |
| `wrong_device` | anderes Gerät als angefordert |
| `missed_orgasm` | ANWEISUNG ungenutzt verstrichen |
| `unauthorized_orgasm` | Orgasmus ohne deckende Direktive |
| `late_lock` | Einschliess-Anforderung zu spät erfüllt |
| `unfulfilled_task` | Aufgabe nicht erfüllt |
| `admin_password_change` | Passwort eines Admin-Kontos während laufender Sperrzeit geändert |
| `manual_offense` | vom Keyholder von Hand notiert |

Diese dreizehn sind im Code die **einzige** Quelle der Taxonomie, und die Oberfläche leitet ihre
Liste daraus ab statt sie abzuschreiben. Eine weitere Art bricht dort den Build, statt still
unsichtbar zu bleiben — genau diese Lücke gab es einmal: fünf Arten waren über den MCP beurteilbar
und erschienen in keiner Oberfläche. Sie fiel nur auf, weil jemand die Liste von Hand nachzählte.

## Zwei Sonderfälle

**`admin_password_change`** wird im Moment des Vorgangs **festgeschrieben** statt live abgeleitet —
damit eine später zurückgezogene Sperrzeit ihn nicht tilgt. Gedacht als Selbstbindung: er verhindert
nichts, er macht sichtbar, dass sich jemand über das Postfach Zugang verschafft hat.

**`manual_offense`** notiert der Keyholder selbst, für alles, was der Tracker nicht sehen kann.
Notieren ist noch kein Urteil. Ein Rückzug nimmt es aus dem Strafbuch, lässt es aber nachlesbar — und
ein bereits gefälltes Urteil überlebt.

## Die Regeln sind eine Historie

Welche Arten überhaupt zählen, ist je Sub einstellbar (aus / nur während Sperrzeit / immer). Diese
Einstellung ist **kein Schalter, sondern eine Historie**: jede Tat wird nach der Fassung beurteilt,
die zu **ihrem** Zeitpunkt galt.

Zwei Folgen:

- Eine heute abgeschaltete Art kann weiterhin ältere Vergehen zeigen. Das ist richtig, nicht kaputt.
- `manual_offense` steht nicht in der Liste: ein ausdrücklich notiertes Vergehen ist nicht
  abschaltbar. Dafür gibt es das Verwerfen.

Wer sie umlegen darf und womit, steht im generierten Register
([01-funktionen.md](01-funktionen.md)) — hier bewusst nicht noch einmal. Genau diese Wiederholung war
der Fehler: der Satz behauptete jahrelang, es gebe dafür kein Werkzeug, während es längst eines gab.

## Das Urteil

Verwerfen, bestrafen (Freitext **oder** eine gestellte Aufgabe), erledigen, wieder aufnehmen. Es gibt
keinen Strafen-Typenzoo und keine automatische Sperre: wer eine Sperre als Strafe will, setzt sie
separat.

**Eine Strafaufgabe schliesst sich selbst.** Ist sie erfüllt, wird das Urteil von selbst als erledigt
markiert, statt auf einen Klick zu warten. Wird ein Urteil ersetzt oder zurückgenommen, zieht der
Tracker die daran hängende Aufgabe zurück.

Wer geurteilt hat, hält der Tracker nur als Kürzel fest (`ai` / `admin` / `system`) — **welcher
Mensch**, steht an keiner Stelle. Deshalb können die Meldungen „Strafe verhängt" und „Vergehen
verworfen" keinen Absendernamen tragen, die Meldung eines von Hand notierten Vergehens dagegen schon.

## Melde-Stichtag

Abgeleitete Vergehen mit einer Tatzeit **vor** dem Stichtag der Instanz werden dem Träger nie
gemeldet — sonst kippte der erste Lauf nach einem Update seine ganze Historie in den Posteingang. Von
Hand notierte Vergehen sind ausgenommen: die schreibt der Keyholder fast immer über etwas
Vergangenes.

## Wirkt auf

Nachrichten (Meldung an beide Seiten), Aufgaben (Strafaufgabe), MCP-Dashboard (offene Vergehen).
Auf die Mechanik selbst wirkt es **nicht** — ein Vergehen sperrt nichts und verlängert nichts.

## Code

`offenseTypes.ts` (Taxonomie, importfrei), `strafbuch.ts` (Ableitung), `strafurteilService.ts`
(Urteil), `offenseRules.ts` / `offenseRulesService.ts` (Regel-Historie), `manualOffenseService.ts`,
`offenseAnnounce.ts` (Meldung), `subOffenses.ts` (Sicht des Trägers).

## Tests

`strafbuch.test.ts`, `strafurteilService.test.ts`, `offenseTypes.test.ts`, `offenseRules.test.ts`,
`offenseRulesService.test.ts`, `offenseLabels.test.ts`, `offenseAnnounce.test.ts`,
`offenseDismissedNotice.test.ts`, `manualOffenseService.test.ts`, `subOffenses.test.ts`,
`judgeOffenseParity.test.ts`, `mcpRecordOffense.test.ts`, `passwordAudit.test.ts`.
