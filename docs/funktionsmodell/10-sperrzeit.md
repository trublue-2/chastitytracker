# Sperrzeit & Verschluss-Anforderung

## Zweck

Die Sperrzeit ist der Zeitraum, in dem der Sub sich nicht selbst öffnen darf. Sie ist kein blosser
Vermerk: läuft eine Sperrzeit, hält die Box den Schlüssel physisch fest.

Die Einschliess-Anforderung ist das Gegenstück davor — „schliess dich bis X ein" — und bringt die
anschliessende Sperrzeit meist gleich mit.

## Stellschrauben

Alle in [stellschrauben.md](stellschrauben.md), Abschnitt *Sperrzeit & Verschluss*. Sie gelten
**je Direktive**, nicht dauerhaft am Konto: es gibt keinen Schalter „Sperrzeiten erlauben", es gibt
nur einzelne angeordnete Sperrzeiten.

Die zwei Fristformen sind die wichtigste Unterscheidung:

| Feld | Nullpunkt | Ein später Verschluss … |
|---|---|---|
| `dauerH` | der tatsächliche Verschluss | … verschiebt das Ende mit |
| `lockEndsAt` | feste Wanduhr | … verkürzt die Sperre |

Wer eine **Tragedauer** meint, nimmt `dauerH`. Wer einen **Termin** meint, `lockEndsAt`.

## Auslöser

- Keyholder ordnet direkt eine Sperrzeit an (Admin-UI oder `set_lock_period`).
- Keyholder stellt eine Anforderung; der Sub schliesst sich ein → die Sperrzeit entsteht beim
  Verschluss-Eintrag (`entryFulfilment.ts`).
- Der Poller stellt eine terminierte Anforderung zu (`wirksamAb`). Trifft sie einen bereits
  verschlossenen Sub, gilt sie als erfüllt und ihre Sperrzeit wird trotzdem gesetzt
  (`carryOverLockPeriodOnAlreadyLocked`) — der Sub hat nichts versäumt.

## Wirkt auf

- **Box** — währenddessen bleibt der Schlüssel eingeschlossen.
- **Reinigung** — nur wenn `reinigungErlaubt` DIESER Sperrzeit gesetzt ist. Und damit auch auf
  **Gerätewechsel**, denn der läuft über den Reinigungspfad.
- **Strafbuch** — eine Öffnung ohne Deckung ist ein erkanntes Vergehen; die Sperrzeit selbst wird
  dabei aufgehoben (`endedReason: "opening"`).
- **Auto-Kontrollen** — sofern `autoKontrolleNurBeiSperre` gesetzt ist, hängt der ganze Tagesplan
  daran.

## Mehrere gleichzeitig: die strengste gewinnt

Mehrere aktive Sperrzeiten sind normal — eine terminierte überlebt eine Öffnung (sie war noch nicht
aktiv), und schliesst der Sub sich danach über eine Anforderung wieder ein, entsteht eine zweite.

`foldActiveLockPeriods` faltet sie **nach der strengsten Regel, nicht nach der neuesten Zeile**:

- `endsAt`: unbefristet schlägt alles, sonst das **späteste** Ende.
- `reinigungErlaubt`: nur wenn **jede** aktive Sperre es erlaubt.

Die frühere Umsetzung nahm die zuletzt angelegte Zeile. Folge: die Box lief beim frühesten Ende auf,
die längere Sperre war stillschweigend verkürzt — physisch.

## Unterdrückt / aufgehoben von

- Ein Orgasmus-Fenster mit `openAllowed` erlaubt das Öffnen, ohne dass es als unautorisiert zählt.
- Eine **erlaubte** Reinigungsöffnung hebt die Sperrzeit nicht auf (siehe
  [20-reinigung.md](20-reinigung.md)).
- Die Buchung durch die Kontroll-Eskalation hebt sie bewusst **nicht** auf — sonst räumte ein
  Versäumnis die Konsequenz weg, die es nach sich ziehen soll.
- Box-Failsafes (leerer Akku, zu lange offline, absolutes Hard-Cap) öffnen physisch auch gegen eine
  laufende Sperrzeit. Der Tracker-Zustand ändert sich dadurch nicht.

## Sichtbarkeit für den Sub

Sofort, ausser bei `wirksamAb`: bis zum Auslösen existiert die Direktive für ihn nicht — keine
Anzeige, keine Meldung, keine laufende Frist.

## Code

`queries.ts` (`foldActiveLockPeriods`, `releaseLockPeriodsOnOpen`, `getActiveLockPeriod`),
`verschlussAnforderungService.ts`, `entryFulfilment.ts`, Modell `VerschlussAnforderung`.

## Tests

`queries.test.ts`, `verschlussAnforderungService.test.ts`, `lockPeriodInterruption.test.ts`,
`lockRequestCarryOver.test.ts`, `entryFulfilment.test.ts`, `mcpLockPeriodTarget.test.ts`.
