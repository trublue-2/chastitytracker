# Trainingsziele

## Zweck

Eine Mindest-Tragezeit je Periode für eine Kategorie. Anders als alle anderen Direktiven **fordert
ein Trainingsziel nichts ein**: es misst. Es erzeugt keine Frist, keine Meldung und kein Vergehen —
es liefert dem Keyholder eine Zahl, die er bewerten kann.

## Stellschrauben

Neun, alle je Ziel — siehe [stellschrauben.md](stellschrauben.md). Die vier Perioden (`minProTagH`,
`minProWocheH`, `minProMonatH`, `minProJahrH`) gelten **nebeneinander**, nicht alternativ: ein Ziel
darf Tages- und Wochenvorgabe zugleich tragen.

Gemessen wird **Wanduhr-Zeit der Kategorie** — überlappende Geräte derselben Kategorie werden
verschmolzen. Nicht Gerätestunden; siehe [15-eintraege.md](15-eintraege.md).

## Verkettung: warum ein Enddatum manchmal von selbst wandert

Ziele derselben Kategorie werden automatisch aneinandergereiht: das Ende eines Ziels ergibt sich aus
dem Beginn des nächsten. Wer ein Ende **bewusst** setzt, schützt es mit `validUntilManual` — sonst
überschreibt die Verkettung es beim nächsten neuen Ziel.

Das ist der häufigste Überraschungsfall dieser Mechanik: ein von Hand gesetztes Enddatum verschwindet
scheinbar grundlos, weil das Flag fehlte.

## Kategorien können sich sperren

Eine Kategorie mit `allowVorgaben: false` lässt sich in keinem Trainingsziel verwenden. Eine
Kategorie mit `trackingEnabled: false` liefert per Design gar keine Sessions — ein Ziel darauf wäre
dauerhaft bei null.

## Löschen ist Soft-Delete

`deletedAt` markiert; die Zeile bleibt für die Historie erhalten. Supersession statt Löschen ist im
Tracker durchgängiges Prinzip — vorher galt für Trainingsziele das Gegenteil, harter Delete ohne
Spur.

## Wirkt auf

- **Sessions/Statistik** — liest sie aus, schreibt nichts.
- **MCP / Dashboard** — Zielerreichung und Adhärenz.

## Sichtbarkeit für den Sub

Vollständig, inklusive Zielerreichung — auch im geöffneten Zustand des Dashboards.

## Code

`vorgabeService.ts` (`reorderVorgabenDates`), `vorgaben.ts`, `categoryGoals.ts`,
`goalFulfillment.ts`.

## Tests

`vorgabeService.test.ts`, `vorgaben.test.ts`, `categoryGoals.test.ts`, `goalFulfillment.test.ts`,
`mcpEditTrainingGoal.test.ts`, `mcpListTrainingGoals.test.ts`.
