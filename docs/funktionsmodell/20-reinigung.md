# Reinigung

## Zweck

Eine Reinigungspause ist eine Öffnung, die die laufende Sperrzeit **nicht** bricht. Technisch ist
sie nichts weiter als ein Öffnen-Eintrag mit `oeffnenGrund = REINIGUNG` — an diesem einen Wert hängt
die gesamte Mechanik.

Zweiter, weniger offensichtlicher Zweck: **es gibt keinen eigenen Gerätewechsel.** Ein Wechsel läuft
über eine Reinigungsöffnung. Wer freie Wechsel will, muss die Reinigung erlauben und das
Tageskontingent hoch genug halten.

## Stellschrauben

Vier am Konto (siehe [stellschrauben.md](stellschrauben.md)) plus **eine je Sperrzeit**. Die
Erlaubnis ist zweistufig, und das ist die häufigste Verwechslung:

| Feld | Gilt | Bedeutung |
|---|---|---|
| `User.cleaningAllowed` | dauerhaft | darf dieser Sub grundsätzlich reinigen |
| `VerschlussAnforderung.cleaningAllowed` | je Sperrzeit | bricht eine Reinigungsöffnung DIESE Sperre nicht |

**Beide müssen zutreffen**, und bei mehreren aktiven Sperrzeiten müssen es **alle** erlauben.

## Die drei Bedingungen einer erlaubten Öffnung

`cleaningBlockReason` ist die eine Quelle dieser Frage. Sie beantwortet nicht nur „ob", sondern
„warum nicht" — damit die Anzeigen dem Sub den Grund nennen können, statt ihn nachzurechnen. Genau
diese Nachrechnung war die frühere Fehlerquelle: dieselbe Regel stand zusätzlich in `strafbuch.ts`
(ohne Fensterprüfung) und im Öffnen-Dialog (nur das User-Flag).

1. der Sub darf reinigen,
2. jede aktive Sperrzeit erlaubt es,
3. sind Fenster konfiguriert, liegt der Zeitpunkt in einem.

Das Tageskontingent gehört bewusst **nicht** dazu: es wird erkannt, nicht durchgesetzt. Über die
Ahndung entscheidet der Keyholder.

## Zeitfenster: wann sie überhaupt binden

`cleaningWindows` bindet **nur während einer aktiven Sperrzeit, die die Reinigung erlaubt**.
Ausserhalb dieses Kontexts ist eine Reinigungsöffnung immer erlaubt, egal was die Fenster sagen —
`cleaningWindowBindingStatus` nennt den Grund (`no-active-lock-period`, `user-not-allowed`,
`lock-period-forbids`, `no-windows-configured`).

Zwei Fallen:

- **Leere Fensterliste ist kein Verbot**, sondern „nicht an eine Tageszeit gebunden". Verboten wird
  mit `cleaningAllowed: false`.
- **Ein Fenster wrappt nicht über Mitternacht.** `22:00–06:00` braucht zwei Einträge.

Die Fenster sind Wanduhrzeit **des Subs** (`User.timezone`), nicht Serverzeit.

## Auslöser

Der Sub erfasst ein Öffnen mit Grund `REINIGUNG`. Kein Keyholder-Vorgang.

## Wirkt auf

- **Sperrzeit** — die erlaubte Pause hebt sie nicht auf; die unerlaubte schon (`endedReason:
  "opening"`), und das Strafbuch bucht.
- **Sessions/Statistik** — die Pause zerlegt die KG-Session in Segmente und wird von der Tragedauer
  abgezogen. Die Session bricht dabei **nicht**; ein Gerätewechsel erst recht nicht.
- **Auto-Kontrollen** — jeder selbst erfasste Wiederverschluss löst eine Kontrolle aus (siehe
  [30-kontrollen.md](30-kontrollen.md)).
- **Box** — ohne Erlaubnis bekommt sie kein Öffnungskommando.

## Historisiert, nicht geschaltet

Die vier Konto-Felder sind eine **Historie** (`CleaningRuleChange`): jede Öffnung wird nach der
Fassung beurteilt, die zu ihrem Zeitpunkt galt. Eine heute geänderte Regel schreibt die Vergangenheit
also nicht um.

Zwei Eigenheiten, die aus der Historie folgen:

- Die Grundzeile trägt `effectiveFrom = Epoch`, nicht das Anlagedatum des Kontos. Vor der ersten
  Änderung ist bekannt, **dass** diese Werte galten, nicht seit wann — ein erfundener Zeitpunkt liesse
  eine Lücke, in die eine Öffnung fallen könnte.
- Ein Speichern, das nichts ändert, schreibt keine Zeile. Sonst nennte `changedBy` irgendwann den,
  der zuletzt bestätigt hat, statt den, der geändert hat.

**Folge für den Betrieb:** die Historie beginnt je Sub erst mit seiner ersten Regeländerung nach dem
Update. Davor gilt rückwirkend der damalige Stand als „seit jeher".

## Sichtbarkeit für den Sub

Vollständig — er sieht Erlaubnis, Kontingent, Restdauer und die Begründung, wenn gerade nicht
geöffnet werden darf.

## Code

`queries.ts` (`cleaningBlockReason`, `cleaningWindowOpen`, `cleaningWindowBindingStatus`,
`isAllowedCleaningOpen`), `cleaningService.ts`, `cleaningRules.ts`, `boxCleaning.ts`.

## Tests

`cleaningRules.test.ts`, `reinigungService.test.ts`, `cleaningRuleHistory.test.ts`,
`queries.test.ts`, `cleaningRelockInspection.test.ts`, `lockPeriodInterruption.test.ts`.
