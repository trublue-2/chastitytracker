# Aufgaben

## Zweck

Eine Aufgabe ist **Text plus 0..n Bedingungen, die durchgehend gelten müssen**, optional plus
Nachweis-Fotos. Sie ist die einzige Direktive mit zwei unabhängigen Erfüllungsachsen — Bedingungen
und Nachweise —, und erfüllt ist nur, was auf beiden stimmt.

## Der Zustand ist abgeleitet, nicht gestempelt

Er entsteht bei jedem Lesen aus den Einträgen des Subs. Ein nachgetragener Eintrag korrigiert die
Aufgabe von selbst, eine verschobene Frist wirkt sofort. Es gibt nichts manuell zu bestätigen —
`completedAt` ist die Selbstmeldung des Subs, nicht der Zustand.

## Bedingungen

`KG_LOCKED` (verschlossen bleiben) und/oder `WEAR` (ein Gerät je Kategorie tragen, optional ein
bestimmtes). Sie gelten **gleichzeitig**, nicht nacheinander — `sortOrder` ist nur Anzeigeordnung.

**Beginn** ist der erste Zeitpunkt, ab dem alle Bedingungen zugleich anliegen. Er muss innerhalb der
Kulanzfrist (`startGraceMin`, Vorgabe 30 min) nach dem Nullpunkt liegen; sonst wurde nicht
durchgehend gehalten, und „kurz vor Schluss alles anlegen" wäre eine Erfüllung.

## Zwei Fristformen — und die Wahl ist keine Geschmacksfrage

| Feld | Uhr läuft ab | Folge |
|---|---|---|
| `holdUntil` | fest | Die Kulanz geht **von der Tragezeit ab**. Wer sofort anlegt, trägt länger als wer sich Zeit lässt. |
| `holdDurationMin` | dem tatsächlichen Anlegen | 30 Minuten sind 30 Minuten, unabhängig vom Anlege-Zeitpunkt. |

Wer eine **Tragezeit** meint, braucht `holdDurationMin` — mit festem Ende bekäme der Sub
nachweislich weniger, als gesagt wurde. Ein festes Ende ist richtig, wenn wirklich der **Termin**
gemeint ist. Der Dauer-Modus braucht mindestens eine Bedingung: ohne sie gibt es kein Anlegen, an
dem die Uhr starten könnte.

`holdUntil` bleibt im Dauer-Modus gefüllt und ist dann die **obere Schranke** — daran hängen Indizes,
Sortierung und die Vorauswahl des Pollers, und keine davon darf zu kurz schätzen.

## Nachweise

Eine zweite Achse neben den Bedingungen.

- **Aufnahmezeit zählt, nicht Upload-Zeit.** Sonst genügte es, am Ende alles hochzuladen.
- **Reihenfolge** ist abschaltbar (`proofOrderMatters`). Ist sie zufällig — „ein Selfie in der
  Gemüse-, eines in der Blumenabteilung" —, erzeugte der Zwang ein Versäumnis für nichts.
  Abgeschaltet entfällt mit ihr auch die Sichtung wegen **fehlender** Aufnahmezeit: die war nur
  nötig, um die Reihenfolge zu belegen.
- **Eigene Frist je Nachweis** (`dueOffsetMin`, Minuten ab dem Nullpunkt): damit ist „drei Fotos über
  den Tag verteilt" **eine** Aufgabe statt dreier Kontrollen. Verstreicht eine unerfüllt, ist die
  Aufgabe **sofort** versäumt, nicht erst am Ende.
- **Nur `requireCode` entscheidet automatisch.** Jeder andere Nachweis — und jedes Foto ohne
  Aufnahmezeit — bringt die Aufgabe in die Sichtung. Auch ein durchgefallener Code-Check ist bewusst
  kein Vergehen: die Bilderkennung liest schräge Fotos falsch, und dafür soll niemand bestraft
  werden.

**Die Sichtung ist der einzige Ausweg** aus dem Wartezustand. Eine Annahme heilt alle drei Mängel —
zu spät, keine Aufnahmezeit, falsche Reihenfolge —, denn wo der Keyholder urteilt, urteilt er an
Stelle der Maschine.

## Ein Versäumnis, drei Vorwürfe

`unfulfilled_task` sagt nicht, was schiefging. Das tut erst die Ausfall-Art:

- **nie begonnen** — die Bedingungen lagen nie rechtzeitig gleichzeitig an
- **Nachweis fehlt** — durchgehalten, aber ein Foto fehlt, kam zu spät oder wurde abgelehnt
- **nicht erfüllt** — Aufgabe ohne Bedingungen; offen blieb die Meldung oder der Nachweis

In zwei von drei Fällen wäre „nie begonnen" nachweislich falsch.

## Terminieren

Bis zum Auslösen existiert die Aufgabe für den Sub **nicht** — er sieht sie nicht, sie blockiert
nichts, **keine** ihrer Fristen läuft. `wirksamAb` ist dann der **Nullpunkt** aller Fristen, nicht
das Stellen. Bei der Zustellung rückt der Poller ihn auf den tatsächlichen Zeitpunkt vor, damit ein
verspäteter Tick keine Kulanz verschluckt.

## Nicht änderbar nach dem Stellen

Bedingungen, Nachweise und `proofOrderMatters`. Sonst würde der Sub an etwas gemessen, das er nie
bekommen hat — und beim Nachweis wiegt das doppelt: ein nachträglich geänderter Code bände ihn an
eine Vorgabe, die er beim Fotografieren nicht kannte. Andere wollen heisst: zurückziehen und neu
stellen. **Zurückziehen wird nie ein Vergehen.**

## Wirkt auf

- **Strafbuch** — ein Versäumnis erzeugt genau ein `unfulfilled_task`.
- **Einträge** — die Bedingungen lesen sie; die Aufgabe schreibt keine.
- **Nachrichten / Benachrichtigungen** — Zustellung, verspäteter Nachweis, Ergebnis.
- **Strafaufgaben** hängen umgekehrt am Urteil (`StrafeRecord.taskId`): eine erfüllte Strafaufgabe
  schliesst das Urteil von selbst ab.

## Code

`taskService.ts` (prüfend, schreibfrei — dieselben Funktionen nutzt die MCP-Vorschau),
`taskProofService.ts`, `tasks.ts` (`taskAnchor`, `effectiveHoldUntil`, `proofDeadline`),
`taskProofNotify.ts`, `delayedTrigger.ts`.

## Tests

`taskService.test.ts`, `tasks.test.ts`, `taskView.test.ts`, `taskProofs.test.ts`,
`taskProofService.test.ts`, `taskProofNotify.test.ts`, `taskScheduling.test.ts`,
`taskBlocking.test.ts`, `taskPoller.test.ts`, `taskDashboardFilter.test.ts`,
`punishWithTask.test.ts`, `mcpEditTaskHold.test.ts`.
