# Einträge & Sessions

## Zweck

Der Eintrag ist der Rohstoff. **Fast nichts im Tracker wird gestempelt — es wird abgeleitet.** Ob
eine Aufgabe erfüllt ist, ob eine Sperre gebrochen wurde, wie lange getragen wurde: all das entsteht
beim Lesen aus den Einträgen. Deshalb korrigiert ein nachgetragener oder berichtigter Eintrag
Folgezustände von selbst — und deshalb kann ein falscher Eintrag mehr kaputtmachen als eine falsche
Einstellung.

## Die sechs Arten

| Art | Bedeutet |
|---|---|
| `VERSCHLUSS` | KG zu — öffnet eine KG-Session |
| `OEFFNEN` | KG auf — schliesst sie |
| `PRUEFUNG` | Kontroll-Nachweis (Foto) |
| `ORGASMUS` | Orgasmus, mit Art |
| `WEAR_BEGIN` / `WEAR_END` | Trage-Session einer anderen Kategorie (Plug, Halsband …) |

Der KG ist bewusst **keine** Trage-Kategorie: ein `WEAR_BEGIN` auf ihn wird abgewiesen.

## Stellschrauben

Nur vier, alle **je Eintrag** — siehe [stellschrauben.md](stellschrauben.md). Der wichtigste ist
`oeffnenGrund`: der Wert `REINIGUNG` ist der eine Schalter, an dem die gesamte Reinigungsmechanik
hängt. Dazu `keyInBox` (steuert, ob die Box überhaupt ein Sperr-Kommando bekommt), `deviceId` und
`startTime`.

## Sessions und Segmente

- Eine **KG-Session** ist ein Paar `VERSCHLUSS → OEFFNEN`.
- Sie zerfällt an Reinigungsöffnungen in **Segmente**, pro Segment genau ein Gerät.
- Ein **Gerätewechsel bricht die Session nicht** — die Tragezeit läuft als Ganzes weiter.
- **Trage-Sessions** (Wear) sind eigene Paare, nicht Teil der KG-Rechnung.

Das massgebliche Gerät eines Segments ist nicht das deklarierte, sondern das **effektive**: bei
einem Konflikt zwischen Bild und Deklaration **gewinnt das Bild**. Innerhalb eines
Lookalike-Clusters ist ein solcher Konflikt allerdings nie ein Vergehen — die Geräte sehen gleich
aus.

## Zwei Arten, Stunden zu zählen

Das ist die Unterscheidung, an der Zahlen auseinanderlaufen, die dasselbe zu messen scheinen:

- **Kategorie-Tragestunden** rechnen **Wanduhr-Zeit**: überlappende Geräte derselben Kategorie
  werden verschmolzen, eine Stunde bleibt eine Stunde.
- **Session-Kennzahlen und Geräte-Statistik** rechnen **Gerätestunden**: zwei gleichzeitig getragene
  Geräte ergeben zwei Stunden.

Und bei den Rekorden:

- `longestUnbrokenSegmentHours` ist die ehrliche Dauertrage-Marke — das längste **einzelne**
  ununterbrochene Segment mit einem Gerät.
- `longestRunHours` / `maxHours` sind Brutto-Summen über Pausen und Wechsel hinweg. Arithmetisch
  höher, aber keine tatsächlich durchgehaltene Strecke.

## Rückdatieren: zwei Pfade, bewusst verschieden

| Pfad | Rückdatieren | Erfüllt Direktiven ab |
|---|---|---|
| Sub erfasst selbst | begrenzt | Server-Uhr (`new Date()`) |
| Keyholder erfasst für den Sub | erlaubt | `startTime` des Eintrags |

Der Grund für die Asymmetrie: könnte der Sub frei rückdatieren und würden Direktiven danach
erfüllt, datierte er sich aus jeder Frist heraus. Auf beiden Pfaden gilt zusätzlich, dass ein
Nachtrag nur erfüllt, was es zu seinem Zeitpunkt schon gab.

Diese Asymmetrie ist Absicht und **kein Kandidat für Vereinheitlichung**.

## Wirkt auf

Alles. Sperrzeit (Bruch oder erlaubte Pause), Reinigung, Kontrollen (Erfüllung), Aufgaben
(Bedingungen), Orgasmus-Direktive, Sessions/Statistik, Trainingsziele, Strafbuch, Box.

## Sichtbarkeit

Der Sub sieht seine Einträge vollständig und kann sie bearbeiten. Beratende Prüfergebnisse
(`deviceCheck`, `keyDetected`) sieht der Keyholder; sie blockieren nichts.

## Code

`utils.ts` (`buildWearPairs`, `wearingHoursFromPairs`), `sessionModel.ts` (`buildSessions`,
`segmentsByDevice`, `effectiveDevice`), `entryFulfilment.ts`, `src/app/api/entries/route.ts`,
`src/app/api/admin/entries/route.ts`.

## Tests

`sessionModel.test.ts`, `wearSessions.test.ts`, `utils.test.ts`, `utils.time.test.ts`,
`entryFulfilment.test.ts`, `entryFormRoute.test.ts`, `entryErrors.test.ts`, `entryNotify.test.ts`,
`deviceUsage.test.ts`, `statsBuilders.test.ts`.
