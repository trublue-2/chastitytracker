# Box (Heimdall)

## Zweck

Die Box ist die physische Schlüssel-Lockbox. Sie macht aus einer Sperrzeit mehr als einen
Datenbank-Eintrag: währenddessen ist der Schlüssel real eingeschlossen.

## Der Tracker steuert die Box nicht

**Diese Domäne hat keine einzige Stellschraube** — was die Box tut, ergibt sich aus den Einträgen des
Subs und aus der Firmware. Der Tracker leitet aus einem Eintrag ein Kommando ab (`lock` / `open`) und
spiegelt, was Heimdall meldet. Er setzt keine Schwellen und kennt keine Box-Konfiguration.

Auch die beiden Failsafe-Schwellen (`offlineOpenHours`, `lowBatteryOpenPercent`) sind **gespiegelt**,
nicht eingestellt: sie kommen aus demselben Heimdall-Push wie der übrige Zustand. Der Tracker soll
die Firmware-Konstante nicht ein drittes Mal kopieren.

## Soll und Ist sind zwei Felder

- `locked` ist das **SOLL**: so soll die Box stehen.
- `reportedLocked` ist das **IST** der letzten Meldung.

Seit dem Präsenz-Guard der Firmware können die beiden auseinanderfallen — die Box kann offen stehen,
obwohl sie zu sein soll. Wer nur `locked` liest, sieht das nicht.

Für die Frage „ist gerade wirklich verschlossen?" gilt der zuletzt gemeldete Stand, online-unabhängig.
Ist er negativ, gibt es dafür genau einen benannten Grund — etwa: der Sub hat den Schlüssel behalten.

## Der Schlüssel muss nicht in der Box sein

Beim Verschluss erklärt der Sub mit `Entry.keyInBox`, ob der Schlüssel hineinwandert. Sagt er nein
(Reise etwa), bekommt die Box bewusst **kein** Sperr-Kommando. Ohne dieses Feld wäre „nicht
hardware-vollstreckt" nicht von „Box war offline" zu unterscheiden.

## Kommandos haben keine Frist

Ein abgeleitetes Kommando wartet in `pendingCommand`, bis die Box es abholt. Es gibt **kein**
Reinigungs-Kommando und keine Frist: die Box öffnet auf `open` und bleibt offen, bis ein `lock`
kommt. Das Wiederverschliessen ist eine Handlung des Subs, keine Zeitschaltung.

Eine **verbotene** Öffnung bekommt gar kein Kommando — sonst vollzöge der Tracker das Vergehen, das
er dokumentiert.

## Failsafes öffnen gegen alles

Leerer Akku, zu lange offline, absolutes Hard-Cap: die Box öffnet autonom, auch gegen eine laufende
Sperrzeit und auch gegen den Keyholder. Der Tracker-Zustand ändert sich dadurch **nicht** — Sperrzeit
und Box laufen dann auseinander.

Vor den ersten beiden warnt der Tracker vor, solange er die Datenbasis hat. **Eine leere Warnliste
ist kein Freibrief**: sie heisst auch „nie gemeldet, Schwellen unbekannt". Und vor der Funkstille
kann die Box nicht warnen — eine Box ohne Netz meldet auch ihre Funkstille nicht.

Verhindern lässt sich beides nur, indem rechtzeitig jemand für Netz oder Strom sorgt.

## Wirkt auf

- **Sperrzeit** — sie wird physisch durchgesetzt, solange die Box mitspielt.
- **Reinigung** — eine erlaubte Pause erzeugt ein Öffnungskommando, eine unerlaubte nicht.
- **Kontrollen** — das Foto durch das Sichtfenster belegt, dass der Schlüssel drin liegt.

## Sichtbarkeit für den Sub

Vollständig: Zustand, Akku, Vorwarnungen und der Grund, wenn gerade nicht geöffnet werden darf.

## Code

`boxCommand.ts`, `boxStatus.ts`, `boxSync.ts`, `boxCleaning.ts`, `boxOpenOutlook.ts`,
`boxKeyProof.ts`, `detectKeyInBox.ts`, Modelle `BoxStatus` / `BoxEvent`. Firmware und Gegenstelle
liegen im Heimdall-Repo, siehe `docs/heimdall-box.md`.

## Tests

`boxCommand.test.ts`, `boxStatus.test.ts`, `boxOpenOutlook.test.ts`, `boxKeyProof.test.ts`,
`detectKeyInBox.test.ts`.
