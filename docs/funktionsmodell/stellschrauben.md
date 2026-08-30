# Stellschrauben-Register

<!-- GENERIERT — nicht von Hand ändern. Quelle: prisma/schema.prisma +
     src/lib/funktionsmodellRegistry.ts · neu erzeugen: `npm run funktionsmodell` -->

Jedes Feld, das Verhalten steuert: 132 Stellschrauben über 41 Modelle.
Typ und Default stammen aus dem Schema, die Bedeutung aus der Registry — beides wird bei jedem
Testlauf gegeneinander geprüft, ein neues Feld ohne Eintrag lässt `npm test` fehlschlagen.

**Gilt** unterscheidet den Dauerschalter am Konto von dem Wert, der nur für EINE Direktive gilt.
Die beiden `cleaningAllowed` sind der Fall, an dem das regelmässig schiefgeht: beide müssen zutreffen.

## Einträge & Sessions

Steckbrief: [15-eintraege.md](15-eintraege.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.mobileDesktopUpload` | Boolean | `false` | dauerhaft | Erlaubt auf Mobilgeräten die Dateiauswahl statt nur die Kamera — schwächt jeden Foto-Nachweis, deshalb Admin-Feld. | Keyholder (UI) | Kontrollen, Aufgaben, Einträge, Oberfläche | — |
| `User.orgasmusArtenConfig` | String? | — | dauerhaft | Auswahlliste der Orgasmus-Arten im Erfassungsformular (JSON). Leer = die eingebauten Arten. | Keyholder (UI) | Einträge, Orgasmus | `reasonsService.ts` |
| `User.oeffnenGruendeConfig` | String? | — | dauerhaft | Auswahlliste der Öffnungsgründe. `REINIGUNG` ist der Grund, an dem die gesamte Reinigungslogik hängt — er lässt sich nicht wegkonfigurieren. | Keyholder (UI) | Einträge, Reinigung, Sperrzeit | `reasonsService.ts` |
| `Entry.startTime` | DateTime | (keiner) | je Eintrag | Der Zeitpunkt, den der Eintrag behauptet. Auf dem Sub-Pfad gegen Rückdatierung begrenzt, auf dem Keyholder-Pfad frei — dort erfüllt ein Nachtrag nur, was es zu seinem Zeitpunkt schon gab. | Sub, Keyholder (UI) | Sessions/Statistik, Strafbuch | `entryFulfilment.ts` |
| `Entry.keyInBox` | Boolean? | — | je Eintrag | Erklärung beim Verschluss, ob der Schlüssel in die Box wandert. `false` = er behält ihn, die Box bekommt bewusst KEIN Sperr-Kommando. `null` = nicht gefragt. | Sub | Box, Sperrzeit | `boxCommand.ts` |
| `Entry.oeffnenGrund` | String? | — | je Eintrag | Grund einer Öffnung. `REINIGUNG` ist der eine Wert, an dem die gesamte Reinigungsmechanik hängt — er entscheidet, ob die Sperrzeit fällt. | Sub, Keyholder (UI) | Reinigung, Sperrzeit, Strafbuch, Sessions/Statistik | `queries.ts:isAllowedCleaningOpen` |
| `Entry.deviceId` | String? | — | je Eintrag | Welches Gerät der Eintrag betrifft. Bei einem Konflikt mit dem Bild gewinnt das Bild, nicht diese Deklaration. | Sub, Keyholder (UI) | Geräte, Sessions/Statistik, Kontrollen | — |

## Sperrzeit & Verschluss

Steckbrief: [10-sperrzeit.md](10-sperrzeit.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `VerschlussAnforderung.message` | String? | — | je Direktive | Begleittext an den Sub; erscheint in der Meldung und im Posteingang. | Keyholder (UI), Keyholder (MCP) | Nachrichten | — |
| `VerschlussAnforderung.endsAt` | DateTime? | — | je Direktive | Bei einer SPERRZEIT das Ende (leer = indefinite), bei einer ANFORDERUNG die Frist zum Einschliessen. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Box, Strafbuch | `queries.ts:foldActiveLockPeriods` |
| `VerschlussAnforderung.minDurationHours` | Float? | — | je Direktive | Mindest-Tragedauer einer Anforderung; die Uhr startet beim tatsächlichen Verschluss. Alternative zu `lockEndsAt`. | Keyholder (UI), Keyholder (MCP) | Sperrzeit | `entryFulfilment.ts` |
| `VerschlussAnforderung.lockEndsAt` | DateTime? | — | je Direktive | Absolutes Sperr-Ende einer Anforderung (feste Wanduhr). Ein später Verschluss verschiebt es NICHT — anders als `minDurationHours`. | Keyholder (UI), Keyholder (MCP) | Sperrzeit | `entryFulfilment.ts` |
| `VerschlussAnforderung.deviceId` | String? | — | je Direktive | Verlangt ein bestimmtes Gerät. Nur hieraus entsteht das Vergehen „falsches Gerät“ — der Bild-Abgleich allein tut es nie. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Geräte, Strafbuch | — |
| `VerschlussAnforderung.cleaningAllowed` | Boolean | `false` | je Direktive | Erlaubt DIESE Sperrzeit eine Reinigungsöffnung (und damit einen Gerätewechsel)? Es müssen ALLE gleichzeitig aktiven Sperrzeiten erlauben, nicht nur die neueste. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Reinigung, Box, Geräte | `queries.ts:foldActiveLockPeriods` |
| `VerschlussAnforderung.wirksamAb` | DateTime? | — | je Direktive | Terminierte Auslösung. Bis dahin existiert die Direktive für den Sub nicht: keine Anzeige, keine Meldung, keine laufende Frist. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Benachrichtigungen | — |

## Reinigung

Steckbrief: [20-reinigung.md](20-reinigung.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.cleaningAllowed` | Boolean | `false` | dauerhaft | Ob Reinigungspausen überhaupt erlaubt sind. Notwendig, nicht hinreichend — eine aktive Sperrzeit muss es zusätzlich erlauben. | Keyholder (UI), Keyholder (MCP) | Reinigung, Sperrzeit, Box, Strafbuch, Geräte | `queries.ts:cleaningBlockReason` |
| `User.cleaningMaxMinutes` | Int | `15` | dauerhaft | Höchstdauer EINER Pause. Darüber hinaus zählt die Pause als Tragezeit-Unterbrechung und wird zum erkannten Vergehen. | Keyholder (UI), Keyholder (MCP) | Reinigung, Strafbuch, Sessions/Statistik | `cleaningRules.ts:cleaningRulesAt` |
| `User.cleaningMaxPerDay` | Int | `0` | dauerhaft | ANZAHL Öffnungen pro Kalendertag des Subs (kein Minutenbudget). 0 = unbegrenzt. Wird nur erkannt, nie durchgesetzt. | Keyholder (UI), Keyholder (MCP) | Reinigung, Strafbuch | `cleaningService.ts:maxPausesPerDaySentinel` |
| `User.cleaningWindows` | String? | — | dauerhaft | Tages-Zeitfenster (JSON-Liste). Binden NUR während einer Sperrzeit, die die Reinigung erlaubt. Leere Liste = nicht zeitgebunden, kein Verbot. | Keyholder (UI), Keyholder (MCP) | Reinigung, Box | `queries.ts:cleaningWindowBindingStatus` |

## Kontrollen

Steckbrief: [30-kontrollen.md](30-kontrollen.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.autoKontrolleAktiv` | Boolean | `false` | dauerhaft | Hauptschalter der Automatik. Aus schaltet BEIDES ab: den gewürfelten Tagesplan und die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen, Kontrollen, Strafbuch | `autoKontrolleService.ts` |
| `User.autoKontrollePerDayMin` | Int | `0` | dauerhaft | Untergrenze der pro Tag gewürfelten Anzahl. Zusammen mit Max auf 0 bleibt nur die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:generateAutoKontrollen` |
| `User.autoKontrollePerDayMax` | Int | `0` | dauerhaft | Obergrenze derselben Auslosung. Unter Min gesetzt wird er auf Min angehoben statt abgelehnt. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:clampPerDay` |
| `User.autoKontrolleRuheVon` | String | `"22:00"` | dauerhaft | Beginn des Schlaf-Fensters (Wanduhr des Subs). Darin wird weder ausgelöst noch eine Frist platziert. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:isInQuietMinutes` |
| `User.autoKontrolleRuheBis` | String | `"06:00"` | dauerhaft | Ende des Schlaf-Fensters. Das Komplement daraus ist das Wach-Fenster, über das der Tagesplan verteilt wird. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:awakeWindow` |
| `User.autoKontrolleFristVon` | Int | `15` | dauerhaft | Untergrenze der Erfüllungsfrist je Kontrolle (Minuten). Bleibt sie vor dem Schlaf-Beginn nicht mehr ganz übrig, entfällt der Slot. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:windowDeadline` |
| `User.autoKontrolleFristBis` | Int | `60` | dauerhaft | Obergrenze derselben Frist; je Kontrolle wird zufällig aus der Spanne gezogen. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:clampFrist` |
| `User.autoKontrolleFensterVon` | String | `""` | dauerhaft | Beginn eines optionalen festen Auslöse-Fensters. Leer = ganzes Wach-Fenster. Wrappt bewusst nicht über Mitternacht. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:fixedWindowMinutes` |
| `User.autoKontrolleFensterBis` | String | `""` | dauerhaft | Ende desselben Fensters. Liegt es vollständig im Schlaf-Fenster, wird die Kombination abgelehnt statt wirkungslos gespeichert. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen | `autoKontrolleService.ts:triggerWindowAllQuiet` |
| `User.autoKontrolleNurBeiSperre` | Boolean | `false` | dauerhaft | Stellt den Tagesplan nur während einer laufenden Sperrzeit zu. Gilt NICHT für die Kontrolle nach dem Wiederverschluss. | Keyholder (UI), Keyholder (MCP) | Auto-Kontrollen, Sperrzeit | `autoKontrolleService.ts` |
| `User.inspectionReminderEnabled` | Boolean | `false` | dauerhaft | Stufe 1: mahnt eine überfällige Kontrolle an. Setzt nur den Uhr-Anker für Stufe 2 — ohne sie beginsAt Stufe 2 nie. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Benachrichtigungen | `inspectionEscalationService.ts` |
| `User.inspectionReminderDelayMinutes` | Int | `5` | dauerhaft | Verzug bis zur Mahnung, gemessen ab dem Ablauf der Kontroll-Frist. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Benachrichtigungen | `inspectionEscalationService.ts` |
| `User.inspectionAutoMarkEnabled` | Boolean | `false` | dauerhaft | Stufe 2: bucht die unbeantwortete Kontrolle selbst als Öffnung bzw. Ablegen. Hebt dabei bewusst KEINE Sperrzeit auf. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Einträge, Sessions/Statistik, Strafbuch | `queries.ts:releaseLockPeriodsOnOpen` |
| `User.inspectionAutoMarkDelayMinutes` | Int | `60` | dauerhaft | Verzug bis zu dieser Buchung, gemessen ab dem Stempel der Stufe 1. | Keyholder (UI), Keyholder (MCP) | Kontrollen | `inspectionEscalationService.ts` |
| `KontrollAnforderung.categoryId` | String? | — | je Direktive | ZIEL der Kontrolle: leer = der KG (verlangt einen aktiven Verschluss), gesetzt = eine Trage-Kategorie. Je Ziel darf nur eine Kontrolle laufen. | Keyholder (UI), Keyholder (MCP) | Kontrollen | `kontrolleService.ts:hasActiveKontrolle` |
| `KontrollAnforderung.deviceId` | String? | — | je Direktive | Verengt das Ziel auf genau ein Gerät und hat Vorrang vor der Kategorie. Es muss das getragene sein, sonst ist die Kontrolle nicht erfüllbar. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Geräte | — |
| `KontrollAnforderung.kommentar` | String? | — | je Direktive | Begleittext an den Sub. | Keyholder (UI), Keyholder (MCP) | Nachrichten | — |
| `KontrollAnforderung.deadline` | DateTime | (keiner) | je Direktive | Erfüllungsfrist. Nach Ablauf verschwindet die Kontrolle nicht, sie wird überfällig — und ist der Startpunkt der Eskalation. | Keyholder (UI), Keyholder (MCP) | Kontrollen, Strafbuch | `inspectionEscalationService.ts` |
| `KontrollAnforderung.wirksamAb` | DateTime? | — | je Direktive | Terminierte Zustellung; bis dahin für den Sub unsichtbar und ohne laufende Frist. Auch der Weg, auf dem der Tagesplan vorab angelegt wird. | Keyholder (UI), Keyholder (MCP), System | Kontrollen, Auto-Kontrollen | — |
| `Device.requireInspectionCode` | Boolean | `true` | dauerhaft | Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? Aus: die Erfüllung läuft über die eine offene Anforderung statt über den Code-Vergleich. | Keyholder (UI), Keyholder (MCP) | Kontrollen | `kontrolleService.ts` |

## Orgasmus-Direktive

Steckbrief: [35-orgasmus.md](35-orgasmus.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `OrgasmusAnforderung.art` | String | (keiner) | je Direktive | ANWEISUNG = Pflicht (ungenutzt ist ein Vergehen), GELEGENHEIT = Erlaubnis (ungenutzt folgenlos). Der ganze Unterschied der Direktive. | Keyholder (UI), Keyholder (MCP) | Orgasmus, Strafbuch | — |
| `OrgasmusAnforderung.message` | String? | — | je Direktive | Begleittext an den Sub. | Keyholder (UI), Keyholder (MCP) | Nachrichten | — |
| `OrgasmusAnforderung.beginsAt` | DateTime | (keiner) | je Direktive | Beginn des Fensters. Es ist immer nur EINE Direktive aktiv. | Keyholder (UI), Keyholder (MCP) | Orgasmus | — |
| `OrgasmusAnforderung.endsAt` | DateTime | (keiner) | je Direktive | Ende des Fensters. Danach ist eine ANWEISUNG versäumt. | Keyholder (UI), Keyholder (MCP) | Orgasmus, Strafbuch | — |
| `OrgasmusAnforderung.requiredType` | String? | — | je Direktive | Verlangt eine bestimmte Orgasmus-Art; leer = beliebig. Nur ein passender Eintrag erfüllt. | Keyholder (UI), Keyholder (MCP) | Orgasmus, Einträge | — |
| `OrgasmusAnforderung.openingAllowed` | Boolean | `false` | je Direktive | Erlaubt das Öffnen im Fenster, ohne dass es als unautorisiert zählt — der einzige Weg, eine Sperrzeit gezielt zu durchbrechen. | Keyholder (UI), Keyholder (MCP) | Orgasmus, Sperrzeit, Strafbuch | — |
| `OrgasmusAnforderung.wirksamAb` | DateTime? | — | je Direktive | Terminierte Auslösung. Vorher gilt das Fenster nicht, erlaubt kein Öffnen und erfüllt sich nicht. | Keyholder (UI), Keyholder (MCP) | Orgasmus | `delayedTrigger.ts` |

## Aufgaben

Steckbrief: [40-aufgaben.md](40-aufgaben.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `Task.title` | String | (keiner) | je Direktive | Was zu tun ist. Der Textteil ist maschinell nicht prüfbar — dafür gibt es die Selbstmeldung. | Keyholder (UI), Keyholder (MCP) | Aufgaben | — |
| `Task.description` | String? | — | je Direktive | Ausführlichere Fassung des Auftrags. | Keyholder (UI), Keyholder (MCP) | Aufgaben | — |
| `Task.holdUntil` | DateTime | (keiner) | je Direktive | Festes Ende: bis dahin müssen alle Bedingungen durchgehend gelten. Im Dauer-Modus nur noch die obere Schranke. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Strafbuch | `tasks.ts:effectiveHoldUntil` |
| `Task.startGraceMin` | Int | `30` | je Direktive | Kulanz zum Anlegen ab dem Nullpunkt. Wer später beginsAt, hat nicht durchgehend gehalten — sonst wäre 'kurz vor Schluss alles anlegen' eine Erfüllung. | Keyholder (UI), Keyholder (MCP) | Aufgaben | `tasks.ts:taskAnchor` |
| `Task.holdDurationMin` | Int? | — | je Direktive | Dauer-Modus: die Uhr läuft ab dem tatsächlichen Anlegen. Gemeint ist eine Tragezeit — mit festem Ende bekäme der Sub nachweislich weniger. | Keyholder (UI), Keyholder (MCP) | Aufgaben | `tasks.ts:effectiveHoldUntil` |
| `Task.proofOrderMatters` | Boolean | `true` | je Direktive | Müssen die Aufnahmezeiten der Nachweise ihrer Reihenfolge folgen? Aus entfällt auch die Sichtung wegen fehlender Aufnahmezeit. Nach dem Stellen nicht mehr änderbar. | Keyholder (UI), Keyholder (MCP) | Aufgaben | `taskProofService.ts` |
| `Task.isPunishment` | Boolean | `false` | je Direktive | Als Strafe gestellt. Rein kennzeichnend — die Verknüpfung zum Urteil steht in `StrafeRecord.taskId`. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Strafbuch | — |
| `Task.penaltyReason` | String? | — | je Direktive | Begründung der Strafaufgabe. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Strafbuch | — |
| `Task.wirksamAb` | DateTime? | — | je Direktive | Terminierte Auslösung UND Nullpunkt jeder Frist dieser Aufgabe. Bei der Zustellung rückt der Poller ihn auf den echten Zeitpunkt vor, damit ein verspäteter Tick keine Kulanz frisst. | Keyholder (UI), Keyholder (MCP) | Aufgaben | `delayedTrigger.ts:deadlineFromDispatch` |
| `TaskRequirement.type` | String | (keiner) | je Direktive | `KG_LOCKED` (verschlossen bleiben) oder `WEAR` (etwas tragen). Der KG ist bewusst keine Trage-Kategorie. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Einträge | — |
| `TaskRequirement.categoryId` | String? | — | je Direktive | Geforderte Kategorie bei einer Trage-Bedingung. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Geräte | — |
| `TaskRequirement.deviceId` | String? | — | je Direktive | Das konkrete Gerät; enger als die Kategorie und hat Vorrang. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Geräte | — |
| `TaskRequirement.sortOrder` | Int | `0` | je Direktive | Anzeigereihenfolge der Bedingungen. Keine zeitliche Reihenfolge — alle gelten gleichzeitig. | Keyholder (UI), Keyholder (MCP) | Aufgaben | — |
| `TaskProof.sortOrder` | Int | `0` | je Direktive | Soll-Reihenfolge der Aufnahmen — wirksam nur, solange `Task.proofOrderMatters` gilt. | Keyholder (UI), Keyholder (MCP) | Aufgaben | — |
| `TaskProof.description` | String | (keiner) | je Direktive | Was auf dem Bild zu sehen sein muss. | Keyholder (UI), Keyholder (MCP) | Aufgaben | — |
| `TaskProof.requireCode` | Boolean | `false` | je Direktive | Verlangt einen handschriftlichen Zufallscode. NUR damit ist der Nachweis maschinell entscheidbar; jeder andere geht zur Sichtung. | Keyholder (UI), Keyholder (MCP) | Aufgaben | `taskProofService.ts` |
| `TaskProof.dueOffsetMin` | Int? | — | je Direktive | Eigene Frist dieses Nachweises, in Minuten ab dem Nullpunkt der Aufgabe. Verstreicht sie unerfüllt, ist die Aufgabe SOFORT versäumt, nicht erst am Ende. | Keyholder (UI), Keyholder (MCP) | Aufgaben, Strafbuch | `tasks.ts:proofDeadline` |

## Trainingsziele

Steckbrief: [45-trainingsziele.md](45-trainingsziele.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `TrainingVorgabe.categoryId` | String? | — | je Direktive | Für welche Kategorie das Ziel gilt. Kategorien mit `allowVorgaben: false` sind hier nicht wählbar. | Keyholder (UI), Keyholder (MCP) | Trainingsziele, Geräte | — |
| `TrainingVorgabe.gueltigAb` | DateTime | (keiner) | je Direktive | Beginn der Geltung. Ziele derselben Kategorie werden daran automatisch aneinandergekettet. | Keyholder (UI), Keyholder (MCP) | Trainingsziele | `vorgabeService.ts:reorderVorgabenDates` |
| `TrainingVorgabe.gueltigBis` | DateTime? | — | je Direktive | Ende der Geltung. Ohne `validUntilManual` ergibt es sich aus dem Beginn des Folgeziels. | Keyholder (UI), Keyholder (MCP) | Trainingsziele | — |
| `TrainingVorgabe.validUntilManual` | Boolean | `false` | je Direktive | Schützt ein bewusst gesetztes Enddatum vor der automatischen Verkettung. | Keyholder (UI), Keyholder (MCP) | Trainingsziele | `vorgabeService.ts:reorderVorgabenDates` |
| `TrainingVorgabe.minProTagH` | Float? | — | je Direktive | Mindest-Tragestunden pro Tag. Gemessen wird Wanduhr-Zeit der Kategorie, nicht Gerätestunden. | Keyholder (UI), Keyholder (MCP) | Trainingsziele, Sessions/Statistik | `vorgaben.ts` |
| `TrainingVorgabe.minProWocheH` | Float? | — | je Direktive | Dasselbe je Woche. Die vier Perioden gelten nebeneinander, nicht alternativ. | Keyholder (UI), Keyholder (MCP) | Trainingsziele, Sessions/Statistik | — |
| `TrainingVorgabe.minProMonatH` | Float? | — | je Direktive | Dasselbe je Monat. | Keyholder (UI), Keyholder (MCP) | Trainingsziele, Sessions/Statistik | — |
| `TrainingVorgabe.minProJahrH` | Float? | — | je Direktive | Dasselbe je Jahr. | Keyholder (UI), Keyholder (MCP) | Trainingsziele, Sessions/Statistik | — |
| `TrainingVorgabe.notiz` | String? | — | je Direktive | Begleittext zum Ziel. | Keyholder (UI), Keyholder (MCP) | Trainingsziele | — |

## Vergehen & Strafbuch

Steckbrief: [50-strafbuch.md](50-strafbuch.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `ManualOffense.occurredAt` | DateTime | (keiner) | je Direktive | Wann es passiert ist, nicht wann notiert wurde. Danach richtet sich die Einordnung UND welche Regel-Fassung gilt. | Keyholder (UI), Keyholder (MCP) | Strafbuch | — |
| `ManualOffense.title` | String | (keiner) | je Direktive | Worum es geht. Für alles, was der Tracker nicht sehen kann — gebrochene Abmachung, Unhöflichkeit. | Keyholder (UI), Keyholder (MCP) | Strafbuch, Nachrichten | — |
| `ManualOffense.description` | String? | — | je Direktive | Ausführlichere Fassung. | Keyholder (UI), Keyholder (MCP) | Strafbuch | — |
| `OffenseRuleChange.offenseType` | String | (keiner) | dauerhaft | Welche Vergehensart die Zeile umlegt (kanonischer Schlüssel, z.B. `unauthorized_opening`). | Keyholder (UI), Keyholder (MCP) | Strafbuch | `offenseRulesService.ts` |
| `OffenseRuleChange.mode` | String | (keiner) | dauerhaft | Ob diese Art zählt (aus / nur während Sperrzeit / immer). Eine HISTORIE, kein Schalter: jede Tat wird nach der Fassung ihrer Zeit beurteilt. | Keyholder (UI), Keyholder (MCP) | Strafbuch | `offenseRulesService.ts:setOffenseRule` |
| `OffenseRuleChange.effectiveFrom` | DateTime | (keiner) | dauerhaft | Ab wann diese Fassung gilt. Die Grundzeile trägt Epoch — vor der ersten Änderung ist nur bekannt, DASS die Werte galten, nicht seit wann. | Keyholder (UI), Keyholder (MCP) | Strafbuch | — |

## Geräte & Kategorien

Steckbrief: [55-geraete.md](55-geraete.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `DeviceCategory.name` | String | (keiner) | dauerhaft | Anzeigename der Kategorie; frei änderbar, der `slug` bleibt. | Sub, Keyholder (UI), Keyholder (MCP) | Oberfläche | — |
| `DeviceCategory.color` | String | (keiner) | dauerhaft | Farbmarke der Kategorie (CSS-Variablen-Suffix). | Sub, Keyholder (UI), Keyholder (MCP) | Oberfläche | — |
| `DeviceCategory.icon` | String | (keiner) | dauerhaft | Symbol der Kategorie (Name aus CATEGORY_ICONS). | Sub, Keyholder (UI), Keyholder (MCP) | Oberfläche | — |
| `DeviceCategory.trackingEnabled` | Boolean | `true` | dauerhaft | Aus = reine Inventar-Kategorie: keine Trage-Sessions, keine Statistik. Abwesenheit in den Auswertungen ist dann keine Nichtnutzung. Bei der eingebauten Kategorie unveränderlich. | Keyholder (UI), Keyholder (MCP) | Sessions/Statistik, Geräte, Einträge | `deviceCategoryService.ts:resolveCategoryRuleChanges` |
| `DeviceCategory.requirePhoto` | Boolean | `false` | dauerhaft | Ein Trage-Beginn dieser Kategorie verlangt ein Bild. Bei der eingebauten Kategorie unveränderlich. | Keyholder (UI), Keyholder (MCP) | Einträge, Geräte | `deviceCategoryService.ts:resolveCategoryRuleChanges` |
| `DeviceCategory.allowVorgaben` | Boolean | `true` | dauerhaft | Aus = die Kategorie lässt sich in keinem Trainingsziel verwenden — deshalb Keyholder-Feld: der Träger könnte sonst das Ziel aus der Hand nehmen. Bei der eingebauten Kategorie unveränderlich. | Keyholder (UI), Keyholder (MCP) | Trainingsziele | `deviceCategoryService.ts:resolveCategoryRuleChanges` |
| `DeviceCategory.sortOrder` | Int | `0` | dauerhaft | Reihenfolge in Listen und Auswahlfeldern. | Sub, Keyholder (UI), Keyholder (MCP) | Oberfläche | — |
| `Device.categoryId` | String? | — | dauerhaft | Zuordnung zur Kategorie — entscheidet, welche Kategorie-Regeln (Tracking, Pflichtfoto, Trainingsziele) für dieses Gerät gelten. | Sub, Keyholder (UI), Keyholder (MCP) | Geräte, Kontrollen, Trainingsziele, Sessions/Statistik | `deviceCategoryService.ts:resolveOwnedCategory` |
| `Device.name` | String | (keiner) | dauerhaft | Anzeigename. Geht zusätzlich in die Geräte-Erkennung ein, zusammen mit den Bildern und den drei optischen Feldern. | Sub, Keyholder (UI), Keyholder (MCP) | Geräte, Oberfläche | — |
| `Device.description` | String? | — | dauerhaft | Freitext — und eines der drei optischen Felder, die in die Geräte-Erkennung eingehen. Prosa über das Tragegefühl verwässert sie hier; die gehört in die Sitz-Notizen. | Sub, Keyholder (UI), Keyholder (MCP) | Geräte, Oberfläche | `deviceReferenceService.ts:visualTraitsOf` |
| `Device.archivedAt` | DateTime? | — | dauerhaft | Soft-Delete: gesetzt = archiviert, aus Auswahllisten raus, Historie bleibt. | Sub, Keyholder (UI), Keyholder (MCP) | Geräte, Sessions/Statistik | — |
| `Device.securityLevel` | String? | — | dauerhaft | SECURING oder TRUST_ONLY — Einordnung für die Keyholder-Entscheidung. Wird nirgends durchgesetzt. | Keyholder (MCP) | MCP | `mcp/devices.ts:set_device_meta` |
| `Device.lookalikeClusterId` | String? | — | dauerhaft · **rückwirkend** | Gleiche Optik = gleicher Cluster. Ein Bild-Konflikt INNERHALB eines Clusters ist nie ein Vergehen. | Keyholder (MCP) | Geräte, Sessions/Statistik, Strafbuch | `mcp/devices.ts:set_device_meta` |
| `Device.pullOffRisk` | Boolean? | — | dauerhaft | Abstreifbar? `null` = nie beurteilt, nicht „sicher“. Reine Beurteilung ohne Durchsetzung. | Keyholder (MCP) | MCP | `mcp/devices.ts:set_device_meta` |
| `Device.material` | String? | — | dauerhaft | Werkstoff. Geht als optisches Merkmal in die Geräte-Erkennung ein. | Sub, Keyholder (UI) | Geräte | `deviceReferenceService.ts:visualTraitsOf` |
| `Device.bauform` | String? | — | dauerhaft | Bauform. Ebenfalls ein optisches Merkmal der Erkennung. | Sub, Keyholder (UI) | Geräte | `deviceReferenceService.ts:visualTraitsOf` |

## Box (Heimdall)

Steckbrief: [60-box.md](60-box.md)

Kein einziges einstellbares Feld — was hier passiert, ergibt sich aus anderen Mechaniken.

## Nachrichten

Steckbrief: [70-nachrichten.md](70-nachrichten.md)

Kein einziges einstellbares Feld — was hier passiert, ergibt sich aus anderen Mechaniken.

## Benachrichtigungen

Steckbrief: [75-benachrichtigungen.md](75-benachrichtigungen.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `NotificationPreference.mail` | Boolean | `true` | dauerhaft | Ob dieses Ereignis per Mail zugestellt wird. | Sub, Keyholder (UI) | Benachrichtigungen | `notificationPrefs.ts` |
| `NotificationPreference.push` | Boolean | `true` | dauerhaft | Ob dieses Ereignis als Push zugestellt wird (Web-Push und native Geräte). | Sub, Keyholder (UI) | Benachrichtigungen | `notificationPrefs.ts` |

## Keyholder-Wissen & Kontext

Steckbrief: [80-kontext.md](80-kontext.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.mcpKeyholderInstructions` | String? | — | dauerhaft | Dauerauftrag an die Keyholder-KI; wird ihr bei jeder MCP-Verbindung mitgegeben. Der Sub sieht ihn nie. | Keyholder (UI) | MCP | `app/api/[transport]/route.ts` |
| `HealthHold.active` | Boolean | `true` | je Direktive | Gesundheits-Halt: setzt die Direktiven aus. Die eine Bremse, die über allem steht. | Keyholder (UI), Keyholder (MCP) | Sperrzeit, Kontrollen, Aufgaben, Auto-Kontrollen | — |
| `HealthHold.reason` | String | (keiner) | je Direktive | Warum ausgesetzt wurde. | Keyholder (UI), Keyholder (MCP) | MCP | — |
| `RecurringContext.label` | String | (keiner) | je Direktive | Name des wiederkehrenden Termins (Home Office, Pilates). | Keyholder (MCP) | MCP | — |
| `RecurringContext.weekday` | Int | (keiner) | je Direktive | Wochentag, 0 = Sonntag. | Keyholder (MCP) | MCP | — |
| `RecurringContext.ordinal` | Int? | — | je Direktive | Leer = jede Woche. 1..5 = n-ter Wochentag im Monat, -1 = letzter. | Keyholder (MCP) | MCP | — |
| `RecurringContext.deviceFree` | Boolean | `false` | je Direktive | Der Slot verlangt Gerätefreiheit — die Information, wegen der der Keyholder ihn überhaupt führt. | Keyholder (MCP) | MCP, Sperrzeit | — |
| `RecurringContext.exclusionDates` | String? | — | je Direktive | Ausnahme-Daten, an denen der Slot entfällt (JSON-Liste, iCalendar-Modell). | Keyholder (MCP) | MCP | — |
| `RecurringContext.note` | String? | — | je Direktive | Begleitnotiz. | Keyholder (MCP) | MCP | — |
| `Appointment.when` | DateTime | (keiner) | je Direktive | Zeitpunkt des einmaligen Termins. | Keyholder (MCP) | MCP | — |
| `Appointment.typ` | String? | — | je Direktive | Art des Termins (Therapie, Arzt). | Keyholder (MCP) | MCP | — |
| `Appointment.deviceFree` | Boolean | `false` | je Direktive | Der Termin verlangt Gerätefreiheit. | Keyholder (MCP) | MCP, Sperrzeit | — |
| `Appointment.note` | String? | — | je Direktive | Begleitnotiz. | Keyholder (MCP) | MCP | — |
| `KeyholderNote.type` | String | `"OBSERVATION"` | je Direktive | DIRECTIVE \| BOUNDARY \| OBSERVATION \| CORRECTION \| EQUIPMENT \| DATA \| HISTORY. Entscheidet mit, ob die Notiz gepinnt sichtbar wird. | Keyholder (MCP) | MCP | — |
| `KeyholderNote.status` | String | `"active"` | je Direktive | `active`, `superseded` oder `archived`. Supersession statt Löschen — eine abgelöste Notiz bleibt lesbar. | Keyholder (MCP) | MCP | — |
| `KeyholderNote.pinned` | Boolean | `false` | je Direktive | Gepinnte Notizen vom Typ DIRECTIVE oder BOUNDARY erscheinen im Keyholder-Dashboard. | Keyholder (MCP) | MCP | — |
| `KeyholderNote.validFrom` | DateTime? | — | je Direktive | Ab wann die Notiz gilt. | Keyholder (MCP) | MCP | — |
| `KeyholderNote.validUntil` | DateTime? | — | je Direktive | Bis wann sie gilt. | Keyholder (MCP) | MCP | — |

## Konto, Zugang & Darstellung

Steckbrief: [85-zugang.md](85-zugang.md)

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.role` | String | `"user"` | dauerhaft | `user` oder `admin`. Entscheidet über Admin-Oberfläche, MCP-Zugang und das Handeln für fremde Konten. | Keyholder (UI), Portal | Zugang, MCP | `authGuards.ts:requireAdminApi` |
| `User.timezone` | String | `"Europe/Zurich"` | dauerhaft | Die Wanduhr des Subs. Kalendertag, Reinigungsfenster und Schlaf-Fenster rechnen darin — nicht in der Serverzone. Historisiert: eine Umstellung wirkt ab jetzt, vergangene Öffnungen bleiben nach der damaligen Zone beurteilt. | Sub | Reinigung, Auto-Kontrollen, Sessions/Statistik | `timezoneRules.ts:timezoneRulesFrom` |
| `User.startPage` | String | `"auto"` | dauerhaft | Startseite nach der Anmeldung; `auto` wählt sie nach Rolle. | Sub | Oberfläche | `userSelfField.ts` |
| `User.hideOwnTracker` | Boolean | `false` | dauerhaft | Blendet den eigenen Tracker in der Keyholder-Ansicht aus — für Admin-Konten, die selbst keinen führen. | Sub | Oberfläche | `ownTracker.ts` |
| `User.locale` | String | `"de"` | dauerhaft | Sprache der Oberfläche UND aller Anschreiben — auch der Portal-Mails, die sie von hier lesen. | Sub, Keyholder (UI) | Oberfläche, Benachrichtigungen | `emailI18n.ts` |
| `User.dashboardLayout` | String? | — | dauerhaft | Abweichungen vom Standard-Dashboard (ausgeblendete Blöcke, eigene Reihenfolge) als JSON je Oberfläche. Leer = Standard. | Sub | Oberfläche | `dashboardLayout.ts:resolveLayout` |
| `User.noticeSeenVersion` | String? | — | dauerhaft | Welche Umstellung dieser Nutzer quittiert hat, als Versionsnummer. Leer = der Hinweis zur laufenden Umstellung erscheint beim nächsten Aufruf. Reine Anzeige-Quittung: er ändert nichts an Regeln, Fristen oder Beurteilung. | Sub | Oberfläche | `notice.ts:NOTICE_VERSION` |
| `AdminUserRelationship.adminId` | String | (keiner) | dauerhaft | Wer diesen Sub steuern darf. Ohne Zeile sieht ein Admin ihn nicht — die Zuordnung ist die eigentliche Berechtigung. | Keyholder (UI) | Zugang, MCP, Nachrichten | — |
| `AdminUserRelationship.userId` | String | (keiner) | dauerhaft | Der zugeordnete Sub. | Keyholder (UI) | Zugang | — |

## Gewicht

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `User.weightTrackingEnabled` | Boolean | `false` | dauerhaft | Schaltet das Gewichtstracking für diesen Träger frei. Aus = Erfassung, Anzeigen und MCP-Schreiben verschwinden; die Daten bleiben. Zusätzlich muss die Instanz das Feature führen (`ENABLE_WEIGHT_TRACKING`). | Keyholder (UI) | Gewicht, Oberfläche | `authGuards.ts:weightTrackingGate` |
| `User.heightCm` | Int? | — | dauerhaft · **rückwirkend** | Aktuelle Körpergrösse — die Grundlage jedes BMI. Jede Änderung wird zusätzlich in `HeightChange` protokolliert; gerechnet wird heute überall mit diesem aktuellen Wert. | Sub | Gewicht | `weight.ts:bmi` |
| `User.unitSystem` | String | `"metric"` | dauerhaft | Anzeige-Einheit DESSEN, DER SCHAUT (metrisch/imperial). Gespeichert wird immer metrisch — eine Keyholderin darf Pfund sehen, während ihr Träger in Kilogramm einträgt. | Sub | Oberfläche | `weight.ts:weightForDisplay` |
| `User.targetWeightKg` | Float? | — | dauerhaft | Zielgewicht, das sich der Träger selbst vorgenommen hat. Wirksam, solange die Keyholderin keines führt; erreicht oder wieder verloren meldet es ihr — sie entscheidet, ob etwas folgt. | Sub | Gewicht, Nachrichten | `weight.ts:effectiveTarget` |
| `User.targetWeightSetAt` | DateTime? | — | dauerhaft | Wann er sein Ziel gesetzt hat — der Bezugspunkt des Fortschritts: gerechnet wird ab der Messung, die damals galt. Ein unveränderter Wert bewegt den Zeitpunkt nicht. | System | Gewicht | `weightService.ts:targetStartWeight` |
| `User.targetWeightKeyholderKg` | Float? | — | dauerhaft | Zielgewicht der Keyholderin. Es GILT, solange sie eines führt — auch wenn es strenger ist als seines; seines bleibt daneben sichtbar. Zurückgenommen gilt wieder seines. | Keyholder (UI) | Gewicht, Nachrichten | `weight.ts:effectiveTarget` |
| `User.targetWeightKeyholderSetAt` | DateTime? | — | dauerhaft | Wann sie ihr Ziel gesetzt hat — derselbe Bezugspunkt des Fortschritts wie auf seiner Seite. | System | Gewicht | `weightService.ts:targetStartWeight` |
| `User.weighingWindows` | String? | — | dauerhaft | Tägliche Zeitfenster fürs Wiegen (Wanduhrzeit des Trägers). Leer = keine Fensterpflicht. Ein Wert ausserhalb wird markiert, nicht geahndet — er misst nur eine andere Tageszeit mit. | Keyholder (UI) | Gewicht | `weightWindows.ts:inWeighingWindow` |

## Betrieb & Stichtage

| Feld | Typ | Default | Gilt | Wirkung | Schreibt | Wirkt auf | Anker |
|---|---|---|---|---|---|---|---|
| `AppMeta.key` | String | (keiner) | dauerhaft | Name eines instanzweiten Werts. Hier liegen die STICHTAGE, ab denen eine Regel auf DIESER Instanz gilt — etwa die Reinigungsfenster-Regel und die Vergehens-Meldungen. | System | Strafbuch, Reinigung, Nachrichten | `appMeta.ts:deployCutoff` |
| `AppMeta.value` | String | (keiner) | dauerhaft · **rückwirkend** | Der Wert dazu. Migrationen schreiben ihn beim ersten Start selbst; eine ENV-Variable kann ihn bewusst überschreiben. | System | Strafbuch, Reinigung, Nachrichten | `appMeta.ts:deployCutoff` |

## Rückwirkende Einstellungen

Die Ausnahmen: Werte, deren Umlegen die VERGANGENHEIT verändert. Alle übrigen tun das nicht —
die Regeln sind historisiert, jede Tat wird nach der Fassung ihrer Zeit beurteilt. Diese hier
sind die wenigen, bei denen das nicht gilt, und deshalb die gefährlichsten im Register.

| Feld | Was ein Umlegen rückwirkend tut |
|---|---|
| `User.heightCm` | Eine neue Zahl verschiebt JEDEN angezeigten BMI, auch den zu alten Messungen — gerechnet wird stets mit der aktuellen Grösse, nicht mit der von damals. |
| `Device.lookalikeClusterId` | Rechnet die Geräte-Zuordnung JEDER historischen Session mit Bild-Konflikt neu. Vorher die Vorschau prüfen. |
| `AppMeta.value` | Einen Stichtag zurückzudatieren beurteilt Vergehen vor diesem Datum neu und kann sie nachträglich melden. |

## Bewusst keine Stellschrauben

Der Rest der geprüften Modelle, mit dem Grund, warum er nichts steuert. Diese Liste ist der
eigentliche Vollständigkeitsbeweis: ein Feld, das weder oben noch hier steht, gibt es nicht.

| Feld | Art | Warum keine Stellschraube |
|---|---|---|
| `User.id` | Identität | Primärschlüssel. |
| `User.username` | Identität | Anmeldename, zugleich die Kennung in Meldungen. |
| `User.passwordHash` | Identität | bcrypt-Hash. Kein Verhalten, sondern der Zugang selbst. |
| `User.email` | Identität | Zustelladresse; steuert nichts, ausser dass ohne sie keine Mail geht. |
| `User.createdAt` | Identität | Anlage-Zeitpunkt. |
| `User.autoInspectionPlannedFor` | Laufzeitzustand | Merker des Planers: bis wann der Tagesplan gewürfelt ist. Wird vom Poller gesetzt, nicht von Hand. |
| `User.weightReminderMark` | Laufzeitzustand | Für welches Wiege-Fenster zuletzt erinnert wurde (`<Tag>#<Startzeit>`). Kein Schalter, sondern die Merkfähigkeit des Minuten-Pollers: sie verhindert die Wiederholung und erlaubt zugleich das Nachholen nach einem Neustart. |
| `Entry.id` | Identität | Primärschlüssel. |
| `Entry.clientRequestId` | Laufzeitzustand | Merkfähigkeit gegen die doppelte Zustellung: erkennt einen wiederholten Anlege-Versuch als denselben, statt einen zweiten Eintrag zu schreiben. Kein Teil dessen, was der Eintrag festhält — leer, wo der Versuch nicht wiederholbar ist. |
| `Entry.userId` | Identität | Eigentümer der Zeile. |
| `Entry.type` | Datensatz | VERSCHLUSS \| OEFFNEN \| PRUEFUNG \| ORGASMUS \| WEAR_BEGIN \| WEAR_END — die Art des Ereignisses, nicht einstellbar. |
| `Entry.imageUrl` | Datensatz | Foto des Geräts bzw. des Siegels. |
| `Entry.imageExifTime` | Datensatz | Aufnahmezeit aus den EXIF-Daten; massgeblich, wo Reihenfolge zählt. |
| `Entry.codeImageUrl` | Datensatz | Bildersafe: versiegeltes Foto des Schlüsselbox-Codes, wird erst freigegeben, wenn Öffnen erlaubt ist. |
| `Entry.codeReadable` | Laufzeitzustand | Ob im Bildersafe-Foto überhaupt Ziffern erkennbar waren. Die Zahl selbst wird bewusst nicht gespeichert. |
| `Entry.boxImageUrl` | Datensatz | Aufnahme durch das Sichtfenster der Box als Schlüssel-Nachweis. |
| `Entry.keyDetected` | Laufzeitzustand | Hat die Bilderkennung im Sichtfenster einen Schlüssel gesehen? Beratend, blockiert nichts — und erkennt 'ein Schlüssel', nicht 'der richtige'. |
| `Entry.note` | Datensatz | Freitext des Erfassenden. |
| `Entry.orgasmusArt` | Datensatz | Art des Orgasmus; die Auswahlliste steuert `User.orgasmusArtenConfig`. |
| `Entry.kontrollCode` | Laufzeitzustand | Der bei dieser Kontrolle geforderte Code. |
| `Entry.verifikationStatus` | Laufzeitzustand | Ergebnis der Foto-Prüfung. `null` heisst 'nicht bestätigt' und ist ohne den Grund daneben nicht deutbar. |
| `Entry.verifikationReason` | Laufzeitzustand | Warum die Prüfung nicht gematcht hat (sprachneutraler Code). |
| `Entry.verifikationReasonDetected` | Laufzeitzustand | Die abweichend gelesene Nummer, wo es eine gibt. |
| `Entry.deviceCheck` | Laufzeitzustand | Geräte-Abgleich des Kontroll-Fotos. Beratend: 'wrong' ist KEIN Vergehen, das entsteht nur aus einer Anforderung. |
| `Entry.deviceCheckNote` | Laufzeitzustand | Das erkannte Gerät, zum Prüfzeitpunkt eingefroren. |
| `Entry.deviceCheckExpected` | Laufzeitzustand | Das erwartete Gerät, zum Prüfzeitpunkt eingefroren. |
| `Entry.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Entry.source` | Nachweis | `user` oder `system`. `system` trägt heute nur der Öffnen-Eintrag, den die Kontroll-Eskalation selbst bucht. |
| `Device.id` | Identität | Primärschlüssel. |
| `Device.userId` | Identität | Eigentümer der Zeile. |
| `Device.imageUrl` | Datensatz | Titelbild. Referenzbilder für die Erkennung stehen in DeviceReferenceImage. |
| `Device.purchasePrice` | Datensatz | Inventarangabe. |
| `Device.currency` | Datensatz | Währung zur Inventarangabe. |
| `Device.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Device.healthFlags` | Datensatz | Beobachtungen zur Verträglichkeit (JSON-Liste). Bewusst NICHT in der Erkennung: ein Urteil über Tragekomfort ist im Bild nicht nachprüfbar. |
| `Device.retentionNotes` | Datensatz | Freitext zum Sitz des Geräts. Aus demselben Grund von der Erkennung ausgenommen. |
| `Device.version` | Laufzeitzustand | Optimistic-Concurrency-Token der MCP-Edits. |
| `DeviceCategory.id` | Identität | Primärschlüssel. |
| `DeviceCategory.userId` | Identität | Eigentümer der Zeile. |
| `DeviceCategory.slug` | Identität | Stabile Kennung; `kg` ist die eingebaute Kategorie. |
| `DeviceCategory.isBuiltIn` | Datensatz | Nur für den KG gesetzt; verhindert das Löschen. |
| `DeviceCategory.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `DeviceReferenceImage.id` | Identität | Primärschlüssel. |
| `DeviceReferenceImage.deviceId` | Identität | Das Gerät, das dieses Bild zeigt. |
| `DeviceReferenceImage.imageUrl` | Datensatz | Referenzbild der Erkennung. Sie sieht nur Bilder und Namen — keine Metadaten. |
| `DeviceReferenceImage.sourceEntryId` | Datensatz | Herkunft, falls aus einem bestehenden Eintrag übernommen. |
| `DeviceReferenceImage.note` | Datensatz | Begleitnotiz. |
| `DeviceReferenceImage.embedding` | Laufzeitzustand | Vektor-Darstellung des Bildes. |
| `DeviceReferenceImage.embeddingModel` | Laufzeitzustand | Welches Modell ihn erzeugt hat — für die Invalidierung. |
| `DeviceReferenceImage.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `VerschlussAnforderung.id` | Identität | Primärschlüssel. |
| `VerschlussAnforderung.userId` | Identität | Eigentümer der Zeile. |
| `VerschlussAnforderung.art` | Datensatz | `ANFORDERUNG` oder `SPERRZEIT` — die Bauart der Zeile, nicht einstellbar: sie ergibt sich daraus, welche Direktive gestellt wurde. |
| `VerschlussAnforderung.createdBy` | Nachweis | Wer die Direktive angeordnet hat; wird an die daraus entstehende Sperrzeit vererbt. `null` = System. |
| `VerschlussAnforderung.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `VerschlussAnforderung.fulfilledAt` | Laufzeitzustand | Gesetzt, wenn der Sub sich eingeschlossen hat. |
| `VerschlussAnforderung.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen oder beim Bruch durch eine Öffnung. |
| `VerschlussAnforderung.endedReason` | Nachweis | WARUM zurückgezogen: `keyholder` (bewusst), `released` (vorzeitig freigegeben per Sofort-Aufschluss), `opening` (vom Sub gebrochen) oder `obsolete` (beim Auslösen schon gegenstandslos). Ohne das Feld sähen alle gleich aus; nur `opening` speist die Anzeige der gebrochenen Sperrzeit. |
| `VerschlussAnforderung.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `KontrollAnforderung.id` | Identität | Primärschlüssel. |
| `KontrollAnforderung.userId` | Identität | Eigentümer der Zeile. |
| `KontrollAnforderung.code` | Laufzeitzustand | Zufallscode fürs Foto — vom Server erzeugt. `null`, wenn das Gerät keinen verlangt (`Device.requireInspectionCode`). |
| `KontrollAnforderung.createdBy` | Nachweis | Wer die Kontrolle gestellt hat; `null` = die Automatik. |
| `KontrollAnforderung.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `KontrollAnforderung.fulfilledAt` | Laufzeitzustand | Serverseitig beim erfüllenden Prüf-Eintrag gesetzt, nie editierbar. |
| `KontrollAnforderung.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen. |
| `KontrollAnforderung.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `KontrollAnforderung.auto` | Laufzeitzustand | Kennzeichnet die vom Tagesplan erzeugten Zeilen. |
| `KontrollAnforderung.entryId` | Laufzeitzustand | Der erfüllende Prüf-Eintrag. |
| `KontrollAnforderung.benachrichtigtReminderAt` | Laufzeitzustand | Stempel der Stufe 1 — zugleich der Uhr-Anker, ab dem Stufe 2 zählt. |
| `KontrollAnforderung.autoMarkedRemovedAt` | Laufzeitzustand | Stempel der Stufe 2. |
| `KontrollAnforderung.autoMarkedEntryId` | Laufzeitzustand | Der von Stufe 2 erzeugte Öffnen-Eintrag — bewusst eine eigene Spalte, nicht die des erfüllenden Eintrags. |
| `KontrollAnforderung.cleaningRelock` | Laufzeitzustand | Herkunft: aus einem Wiederverschluss nach einer Reinigungspause statt aus dem Tagesplan. Nicht aus der Zeile rekonstruierbar. |
| `OrgasmusAnforderung.id` | Identität | Primärschlüssel. |
| `OrgasmusAnforderung.userId` | Identität | Eigentümer der Zeile. |
| `OrgasmusAnforderung.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `OrgasmusAnforderung.fulfilledAt` | Laufzeitzustand | Gesetzt beim passenden Orgasmus-Eintrag im Fenster. |
| `OrgasmusAnforderung.entryId` | Laufzeitzustand | Der erfüllende Eintrag. |
| `OrgasmusAnforderung.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen. |
| `OrgasmusAnforderung.createdBy` | Nachweis | Wer die Direktive angeordnet hat; `null` = System. |
| `OrgasmusAnforderung.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `TrainingVorgabe.id` | Identität | Primärschlüssel. |
| `TrainingVorgabe.userId` | Identität | Eigentümer der Zeile. |
| `TrainingVorgabe.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `TrainingVorgabe.deletedAt` | Laufzeitzustand | Soft-Delete: die Zeile bleibt für die Historie stehen. Supersession statt Löschen ist hier durchgängiges Prinzip. |
| `Task.id` | Identität | Primärschlüssel. |
| `Task.userId` | Identität | Eigentümer der Zeile. |
| `Task.createdBy` | Nachweis | Wer die Aufgabe gestellt hat; `null` = System. |
| `Task.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Task.benachrichtigtAt` | Laufzeitzustand | Wann die Zustellung rausging. |
| `Task.completedAt` | Laufzeitzustand | Selbstmeldung des Subs. Mit Bedingungen zusätzlich nötig, ohne Bedingungen IST sie die Erfüllung. |
| `Task.completionNote` | Datensatz | Begleittext seiner Meldung. |
| `Task.withdrawnAt` | Laufzeitzustand | Gesetzt beim Zurückziehen; wird nie ein Vergehen. |
| `Task.resultNotifiedAt` | Laufzeitzustand | Versand-Stempel der Ergebnismeldung. Kein Zustand — der wird immer aus den Einträgen abgeleitet. |
| `TaskRequirement.id` | Identität | Primärschlüssel. |
| `TaskRequirement.taskId` | Identität | Zugehörige Aufgabe. |
| `TaskProof.id` | Identität | Primärschlüssel. |
| `TaskProof.taskId` | Identität | Zugehörige Aufgabe. |
| `TaskProof.code` | Laufzeitzustand | Der geforderte Zufallscode; leer ohne Code-Pflicht. |
| `TaskProof.imageUrl` | Datensatz | Das eingereichte Foto. |
| `TaskProof.imageExifTime` | Datensatz | Aufnahmezeit — massgeblich für die Reihenfolge. Die Upload-Zeit wäre wertlos, weil dann alles am Schluss hochgeladen passte. |
| `TaskProof.submittedAt` | Laufzeitzustand | Wann eingereicht. Nach dem Ende der Aufgabe zählt es nicht mehr. |
| `TaskProof.verifikationStatus` | Laufzeitzustand | Ergebnis der Code-Erkennung. |
| `TaskProof.verifikationReason` | Laufzeitzustand | Warum sie nicht gematcht hat (sprachneutraler Code). |
| `TaskProof.verifikationReasonDetected` | Laufzeitzustand | Die abweichend gelesene Nummer. |
| `TaskProof.lateNotifiedAt` | Laufzeitzustand | Wann der Keyholderin ein verspäteter Nachweis gemeldet wurde. |
| `TaskProof.reviewedAt` | Nachweis | Wann gesichtet wurde. |
| `TaskProof.reviewAccepted` | Nachweis | Das Urteil der Sichtung. Eine Annahme heilt Verspätung, fehlende Aufnahmezeit und falsche Reihenfolge gleichermassen. |
| `TaskProof.reviewNote` | Nachweis | Begründung der Sichtung. |
| `StrafeRecord.id` | Identität | Primärschlüssel. |
| `StrafeRecord.userId` | Identität | Eigentümer der Zeile. |
| `StrafeRecord.offenseType` | Datensatz | Welche Art von Vergehen beurteilt wurde. |
| `StrafeRecord.refId` | Datensatz | Das beurteilte Vergehen. Eindeutig — ein Vergehen trägt höchstens ein Urteil. |
| `StrafeRecord.bestraftDatum` | Nachweis | Zeitpunkt des Urteils. |
| `StrafeRecord.notiz` | Datensatz | Interne Notiz zum Urteil. |
| `StrafeRecord.status` | Nachweis | PUNISHED oder DISMISSED — das Urteil selbst, kein einstellbarer Wert. |
| `StrafeRecord.reason` | Datensatz | Der Straftext bei PUNISHED, ein optionaler Grund bei DISMISSED. |
| `StrafeRecord.judgedBy` | Nachweis | `ai`, `admin` oder `system` — ein Kürzel. Die Anzeige unterscheidet daran KI von Mensch; WELCHER Mensch, steht daneben. |
| `StrafeRecord.judgedByName` | Nachweis | Der Name des Urteilenden. `null` bei der KI (ihre Kennung steht im Kürzel), bei der automatischen Ahndung (dahinter steht niemand) und im Altbestand. |
| `StrafeRecord.erledigtAt` | Laufzeitzustand | Nur bei PUNISHED: leer = Strafe offen, gesetzt = erledigt. |
| `StrafeRecord.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `StrafeRecord.taskId` | Datensatz | Die Aufgabe, die DIESE Strafe ist. Eine erfüllte Aufgabe schliesst das Urteil von selbst ab. |
| `ManualOffense.id` | Identität | Primärschlüssel. |
| `ManualOffense.userId` | Identität | Eigentümer der Zeile. |
| `ManualOffense.createdBy` | Nachweis | Wer notiert hat. UNVERÄNDERLICH — darauf beruht, dass die Meldung an den Träger den Namen kopieren darf. |
| `ManualOffense.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `ManualOffense.withdrawnAt` | Laufzeitzustand | Zurückgezogen: fällt aus dem Strafbuch, bleibt nachlesbar, und ein bereits gefälltes Urteil überlebt. |
| `OffenseRuleChange.id` | Identität | Primärschlüssel. |
| `OffenseRuleChange.userId` | Identität | Eigentümer der Zeile. |
| `OffenseRuleChange.changedBy` | Nachweis | Wer umgelegt hat. |
| `OffenseRuleChange.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `CleaningRuleChange.id` | Identität | Primärschlüssel. |
| `CleaningRuleChange.userId` | Identität | Eigentümer der Zeile. |
| `CleaningRuleChange.allowed` | Datensatz | Abbild von `User.cleaningAllowed` in dieser Fassung. Gesetzt wird über die User-Spalte, nie hier. |
| `CleaningRuleChange.maxMinutes` | Datensatz | Abbild von `User.cleaningMaxMinutes`. |
| `CleaningRuleChange.maxPerDay` | Datensatz | Abbild von `User.cleaningMaxPerDay`. |
| `CleaningRuleChange.windows` | Datensatz | Abbild von `User.cleaningWindows`. |
| `CleaningRuleChange.effectiveFrom` | Datensatz | Ab wann die Fassung gilt. Die Grundzeile trägt Epoch, damit keine Lücke bleibt, in die eine Öffnung fallen könnte. |
| `CleaningRuleChange.changedBy` | Nachweis | Wer geändert hat; leer bei der Grundzeile, die niemand gesetzt hat. |
| `CleaningRuleChange.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `TimezoneChange.id` | Identität | Primärschlüssel. |
| `TimezoneChange.userId` | Identität | Eigentümer der Zeile. |
| `TimezoneChange.timezone` | Datensatz | Abbild von `User.timezone` in dieser Fassung. Gesetzt wird über die User-Spalte, nie hier. |
| `TimezoneChange.effectiveFrom` | Datensatz | Ab wann die Zone gilt. Die Grundzeile trägt Epoch, damit keine Lücke bleibt, in die eine Öffnung fallen könnte. |
| `TimezoneChange.changedBy` | Nachweis | Wer umgestellt hat; leer bei der Grundzeile. |
| `TimezoneChange.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `AdminPasswordChange.id` | Identität | Primärschlüssel. |
| `AdminPasswordChange.subUserId` | Identität | Der Sub, dessen Sperrzeit lief — Eigentümer des Vergehens. |
| `AdminPasswordChange.adminUserId` | Identität | Das Admin-Konto, dessen Passwort geändert wurde. |
| `AdminPasswordChange.adminUsername` | Nachweis | Abbild des Namens; überlebt Umbenennung und Löschung. |
| `AdminPasswordChange.via` | Nachweis | `reset_token` (über das Postfach Zugang verschafft), `self` oder `set_by_other`. Der interessante Fall ist der erste. |
| `AdminPasswordChange.actorUserId` | Nachweis | Wer ausgelöst hat; leer beim Token-Weg, dort gibt es keine Sitzung. |
| `AdminPasswordChange.lockPeriodId` | Datensatz | Die damals laufende Sperrzeit — für die Anzeige, ohne Fremdschlüssel-Zwang. |
| `AdminPasswordChange.lockPeriodEndsAt` | Datensatz | Deren Ende zum Zeitpunkt des Vorgangs. |
| `AdminPasswordChange.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `BoxStatus.id` | Identität | Primärschlüssel. |
| `BoxStatus.userId` | Identität | Eigentümer der Zeile. |
| `BoxStatus.boxId` | Identität | Stabile Geräte-Kennung der Box. |
| `BoxStatus.name` | Datensatz | Anzeigename der Box; kommt aus Heimdall. |
| `BoxStatus.locked` | Laufzeitzustand | Das SOLL: so soll die Box stehen. |
| `BoxStatus.reportedLocked` | Laufzeitzustand | Das IST der letzten Meldung. Seit dem Präsenz-Guard kann die Box offen stehen, obwohl sie zu sein soll. |
| `BoxStatus.lockUntil` | Laufzeitzustand | Die effektive Sperre aus eigener Frist und Tracker-Sperrzeit, gekappt. |
| `BoxStatus.simpleLock` | Laufzeitzustand | Einfache lokale Verriegelung ohne Frist. |
| `BoxStatus.keyholderLocked` | Laufzeitzustand | Durch eine Tracker-Sperrzeit gehalten; lokal nicht zu öffnen. |
| `BoxStatus.battery` | Laufzeitzustand | Ladestand in Prozent. |
| `BoxStatus.charging` | Laufzeitzustand | Ob gerade geladen wird. |
| `BoxStatus.boltPos` | Laufzeitzustand | Stellung des Riegels. |
| `BoxStatus.fwVersion` | Laufzeitzustand | Firmware-Stand der Box. |
| `BoxStatus.lastSyncAt` | Laufzeitzustand | Letzter Kontakt. Grundlage der Offline-Vorwarnung. |
| `BoxStatus.offlineOpenHours` | Datensatz | Offline-Schwelle der Box, aus Heimdall gespiegelt. Nicht im Tracker einstellbar — er soll die Firmware-Konstante nicht kopieren. |
| `BoxStatus.lowBatteryOpenPercent` | Datensatz | Akku-Schwelle, unter der die Box autonom öffnet. Ebenfalls gespiegelt; leer heisst keine Vorwarnung, nicht 'keine Schwelle'. |
| `BoxStatus.pendingCommand` | Laufzeitzustand | Aus einem Eintrag abgeleitetes, noch nicht vollzogenes Kommando. Die Box öffnet auf `open` und bleibt offen, bis ein `lock` kommt. |
| `BoxStatus.pendingCommandAt` | Laufzeitzustand | Wann das Kommando entstand. |
| `BoxStatus.updatedAt` | Laufzeitzustand | Letzte Änderung der Zeile. |
| `BoxEvent.id` | Identität | Primärschlüssel. |
| `BoxEvent.userId` | Identität | Eigentümer der Zeile. |
| `BoxEvent.deviceId` | Datensatz | Betroffenes Gerät, sofern zuordenbar. |
| `BoxEvent.type` | Datensatz | LOCKED \| UNLOCKED \| EARLY_OPEN \| UNAUTHORIZED_OPEN. |
| `BoxEvent.wakeReason` | Datensatz | Der von der Box gemeldete Öffnungsgrund. |
| `BoxEvent.battery` | Datensatz | Ladestand zum Ereignis. |
| `BoxEvent.fwVersion` | Datensatz | Firmware-Stand zum Ereignis. |
| `BoxEvent.at` | Datensatz | Zeitpunkt des Ereignisses, server-autoritativ aus dem Sync. |
| `BoxEvent.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Message.id` | Identität | Primärschlüssel. |
| `Message.subjectUserId` | Identität | Der Sub, um den es geht — IMMER der Scope-Schlüssel, auch bei Meldungen AN die Keyholder. |
| `Message.senderKind` | Datensatz | `system`, `keyholder` oder `ai`. Eine Art, kein Name. |
| `Message.senderName` | Datensatz | Der Name, wo ein Mensch dahintersteht. Nur zusammen mit `keyholder` gefüllt und bewusst KOPIERT statt nachgelesen. |
| `Message.audience` | Datensatz | `sub` oder `keyholders`. Eine Keyholder-Meldung ist EINE Zeile, die sich alle Keyholder teilen — jeder mit eigenem Lesestand. |
| `Message.bodyKey` | Datensatz | Übersetzungsschlüssel des Textes. |
| `Message.bodyParams` | Datensatz | Dessen Parameter als JSON. |
| `Message.body` | Datensatz | Vorformulierter Text, wo kein Schlüssel passt. |
| `Message.refEntityType` | Datensatz | Bezug aufs Tracking-Objekt. Freitexte werden VERLINKT statt kopiert, damit eine Korrektur rückwirkend richtig wirkt. |
| `Message.refEntityId` | Datensatz | Die id des bezogenen Objekts. |
| `Message.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `MessageRead.id` | Identität | Primärschlüssel. |
| `MessageRead.messageId` | Identität | Die gelesene Nachricht. |
| `MessageRead.userId` | Identität | Der LESER — nicht der Betroffene. Darauf beruht der geteilte Keyholder-Kanal. |
| `MessageRead.readAt` | Laufzeitzustand | Wann gelesen wurde. |
| `NotificationPreference.id` | Identität | Primärschlüssel. |
| `NotificationPreference.userId` | Identität | Eigentümer der Zeile. |
| `NotificationPreference.eventType` | Datensatz | Welches Ereignis die Zeile betrifft — die Zeile selbst ist der Schalter, nicht dieses Feld. |
| `PushSubscription.id` | Identität | Primärschlüssel. |
| `PushSubscription.userId` | Identität | Eigentümer der Zeile. |
| `PushSubscription.endpoint` | Identität | Zustelladresse des Browsers. |
| `PushSubscription.p256dh` | Identität | Öffentlicher Schlüssel der Verschlüsselung. |
| `PushSubscription.auth` | Identität | Auth-Geheimnis der Verschlüsselung. |
| `PushSubscription.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `NativePushToken.id` | Identität | Primärschlüssel. |
| `NativePushToken.userId` | Identität | Eigentümer der Zeile. |
| `NativePushToken.platform` | Datensatz | `ios` oder `android`. |
| `NativePushToken.token` | Identität | Gerätetoken der nativen App. |
| `NativePushToken.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `NativePushToken.updatedAt` | Laufzeitzustand | Letzte Erneuerung des Tokens. |
| `KeyholderNote.id` | Identität | Primärschlüssel. |
| `KeyholderNote.userId` | Identität | Eigentümer der Zeile. |
| `KeyholderNote.kg` | Datensatz | Altfeld: freier Bezug auf den Keuschheitsgürtel. |
| `KeyholderNote.kategorie` | Datensatz | Altfeld: freie Einordnung. |
| `KeyholderNote.text` | Datensatz | Der Notiztext. Der Sub sieht ihn nie. |
| `KeyholderNote.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `KeyholderNote.supersedesId` | Datensatz | Die Notiz, die diese hier ablöst. |
| `KeyholderNote.source` | Datensatz | `user-stated` oder `inferred` — trennt Nutzer-Fakt vom Schluss des Agenten. |
| `KeyholderNote.confidence` | Datensatz | Wie sicher der Schluss ist; vor allem bei `inferred`. |
| `KeyholderNote.doDont` | Datensatz | Strukturierte Do/Dont-Liste als JSON, für Grenzen-Notizen. |
| `KeyholderNote.version` | Laufzeitzustand | Optimistic-Concurrency-Token der MCP-Edits. |
| `NoteRef.id` | Identität | Primärschlüssel. |
| `NoteRef.noteId` | Identität | Die verknüpfte Notiz. |
| `NoteRef.entityType` | Datensatz | Art des bezogenen Objekts (Gerät, Session, Kontrolle, Vergehen …). |
| `NoteRef.entityId` | Datensatz | Dessen id. |
| `NoteRef.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `KeyholderActionLog.id` | Identität | Primärschlüssel. |
| `KeyholderActionLog.userId` | Identität | Der Sub, auf den die Aktion gewirkt hat. |
| `KeyholderActionLog.tool` | Nachweis | Welches MCP-Werkzeug gelaufen ist. |
| `KeyholderActionLog.actor` | Nachweis | Der handelnde Keyholder; leer bei Altbestand. |
| `KeyholderActionLog.reason` | Nachweis | Pflicht-Begründung. Jeder schreibende MCP-Aufruf braucht sie — es gibt keine stille Mutation. |
| `KeyholderActionLog.source` | Nachweis | `agent` oder `user-stated`. |
| `KeyholderActionLog.argsJson` | Nachweis | Die Eingaben des Aufrufs. |
| `KeyholderActionLog.resultRef` | Nachweis | Das erzeugte oder betroffene Objekt. |
| `KeyholderActionLog.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `HealthHold.id` | Identität | Primärschlüssel. |
| `HealthHold.userId` | Identität | Eigentümer der Zeile. |
| `HealthHold.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `HealthHold.resolvedAt` | Laufzeitzustand | Wann der Halt aufgehoben wurde. |
| `RecurringContext.id` | Identität | Primärschlüssel. |
| `RecurringContext.userId` | Identität | Eigentümer der Zeile. |
| `RecurringContext.version` | Laufzeitzustand | Optimistic-Concurrency-Token der MCP-Edits. |
| `RecurringContext.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Appointment.id` | Identität | Primärschlüssel. |
| `Appointment.userId` | Identität | Eigentümer der Zeile. |
| `Appointment.version` | Laufzeitzustand | Optimistic-Concurrency-Token der MCP-Edits. |
| `Appointment.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `AdminUserRelationship.id` | Identität | Primärschlüssel. |
| `AdminUserRelationship.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Passkey.id` | Identität | Primärschlüssel. |
| `Passkey.userId` | Identität | Eigentümer der Zeile. |
| `Passkey.credentialId` | Identität | Kennung des Schlüssels. |
| `Passkey.publicKey` | Identität | Öffentlicher Schlüssel. |
| `Passkey.counter` | Laufzeitzustand | Signaturzähler gegen Wiedereinspielung. |
| `Passkey.transports` | Datensatz | Übertragungswege, die das Gerät anbietet. |
| `Passkey.deviceName` | Datensatz | Anzeigename des Geräts. |
| `Passkey.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `Passkey.lastUsedAt` | Laufzeitzustand | Letzte Verwendung. |
| `PasswordResetToken.id` | Identität | Primärschlüssel. |
| `PasswordResetToken.token` | Identität | Das Rücksetz-Geheimnis. |
| `PasswordResetToken.userId` | Identität | Eigentümer der Zeile. |
| `PasswordResetToken.expiresAt` | Laufzeitzustand | Ablauf; eine Stunde. |
| `PasswordResetToken.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `PortalTokenUsed.jti` | Identität | Kennung eines bereits eingelösten Portal-Tokens. |
| `PortalTokenUsed.usedAt` | Laufzeitzustand | Wann eingelöst. Zusammen der Wiedereinspielungs-Schutz des Portal-Logins. |
| `RateLimit.key` | Identität | Zähler-Schlüssel, meist Route plus Client-IP. |
| `RateLimit.count` | Laufzeitzustand | Versuche im laufenden Fenster. |
| `RateLimit.resetAt` | Laufzeitzustand | Wann das Fenster neu beginsAt. |
| `OAuthClient.id` | Identität | Primärschlüssel. |
| `OAuthClient.clientId` | Identität | Kennung der verbundenen Anwendung. |
| `OAuthClient.clientName` | Datensatz | Anzeigename der Anwendung. |
| `OAuthClient.redirectUris` | Datensatz | Erlaubte Rücksprung-Adressen. |
| `OAuthClient.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `OAuthCode.id` | Identität | Primärschlüssel. |
| `OAuthCode.code` | Identität | Einmal-Code des Autorisierungsflusses. |
| `OAuthCode.clientId` | Identität | Anfragende Anwendung. |
| `OAuthCode.userId` | Identität | Eigentümer der Zeile. |
| `OAuthCode.redirectUri` | Datensatz | Verwendete Rücksprung-Adresse. |
| `OAuthCode.scopes` | Datensatz | Erteilte Berechtigungen. |
| `OAuthCode.codeChallenge` | Identität | PKCE-Challenge. |
| `OAuthCode.codeChallengeMethod` | Datensatz | Verfahren der Challenge. |
| `OAuthCode.expiresAt` | Laufzeitzustand | Ablauf des Codes. |
| `OAuthCode.usedAt` | Laufzeitzustand | Wann eingelöst; verhindert die zweite Einlösung. |
| `OAuthCode.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `OAuthToken.id` | Identität | Primärschlüssel. |
| `OAuthToken.tokenHash` | Identität | Hash des Zugriffstokens; das Token selbst wird nie gespeichert. |
| `OAuthToken.clientId` | Identität | Anwendung, für die es gilt. |
| `OAuthToken.userId` | Identität | Eigentümer der Zeile. |
| `OAuthToken.scopes` | Datensatz | Erteilte Berechtigungen. |
| `OAuthToken.expiresAt` | Laufzeitzustand | Ablauf. |
| `OAuthToken.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `OAuthRefreshToken.id` | Identität | Primärschlüssel. |
| `OAuthRefreshToken.tokenHash` | Identität | Hash des Erneuerungstokens. |
| `OAuthRefreshToken.clientId` | Identität | Anwendung, für die es gilt. |
| `OAuthRefreshToken.userId` | Identität | Eigentümer der Zeile. |
| `OAuthRefreshToken.scopes` | Datensatz | Erteilte Berechtigungen. |
| `OAuthRefreshToken.expiresAt` | Laufzeitzustand | Ablauf. |
| `OAuthRefreshToken.createdAt` | Datensatz | Anlage-Zeitpunkt. |
| `AppMeta.updatedAt` | Laufzeitzustand | Letzte Änderung. Das Portal liest daraus die Aktivität der Instanz. |
