# Wiege-Freigabe: das Gewicht öffnet das Orgasmus-Fenster

**Status:** **gebaut** (23.08.2026) · **Erstellt:** 2026-08-23 · **Zugeschnitten:** 2026-08-23
**Setzt voraus:** `docs/gewicht-konzept.md` (Gewichtstracking, gebaut)
**Auslöser:** ein Selbstversuch-Thread aus dem KG-Forum, den trublue eingebracht hat.

---

## 1. Der Zuschnitt in einem Absatz

Die Keyholderin stellt eine **Vorgabe**: der nächste Orgasmus ist frei, sobald das **Mittel der
letzten drei Tage** eine Schwelle erreicht. Nicht der Tageswert — ein einzelnes Wiegen schwankt um
ein bis zwei Kilo (Salz, Mahlzeit, Tageszeit), und eine Freigabe daran zu hängen hiesse, Kochsalz
über den Orgasmus entscheiden zu lassen. Ist die Vorgabe erfüllt, entsteht eine gewöhnliche
`OrgasmusAnforderung` der Art `GELEGENHEIT`, und ab da läuft alles wie bei jeder anderen Freigabe.
Danach ist die Vorgabe **verbraucht**; die nächste stellt die Keyholderin.

## 2. Woher die Mechanik kommt

Aus einem öffentlich dokumentierten Selbstversuch. Der Autor koppelt seine „Erleichterung" ans
Körpergewicht:

> Samstag: unter 86,0 kg → Erleichterung erlaubt. Sonntag: unter 86,5 kg. Montag: unter 87,0 kg.
> Das Limit steigt jeden Tag um 0,5 kg. **Wichtigste Regel:** Es zählt ausschliesslich das erste
> Wiegen direkt nach dem Aufstehen. Kein mehrmaliges Nachwiegen am selben Tag, um das Ergebnis zu
> erzwingen.

Sein Reiz daran, in seinen Worten: der Zeitpunkt steht nicht von Anfang an fest, und es gibt einen
zusätzlichen Anreiz, auf das Gewicht zu achten.

**Zwei Dinge macht dieses Konzept anders als die Vorlage.** Sie prüft den Tageswert — hier ist es
das Dreitage-Mittel, aus dem Grund in Abschnitt 1. Und ihr täglicher Anstieg ist Pflicht — hier ist
er eine Option (Abschnitt 5), weil die Keyholderin die Vorgabe ohnehin jederzeit nachziehen kann.

## 3. Warum eine Freigabe und keine Strafe

`docs/gewicht-konzept.md` (Abschnitt 1) hält fest, dass eine Zahl auf der Waage **kein
Fehlverhalten** ist und ein Automatismus, der Kilos in Strafen umrechnet, in dieser App die falsche
Mechanik wäre. Diese Regel bleibt wörtlich stehen — und trotzdem hat das Gewicht Wirkung:

| | Kilos → Strafe | Kilos → Freigabe (dieses Konzept) |
|---|---|---|
| Was passiert | Vergehen, Aufgabe, verlängerte Sperre | ein Fenster geht auf, oder eben noch nicht |
| Strafbuch | neuer abgeleiteter Vergehenstyp | **unberührt** |
| Historisierung | zwingend (die Ableitung schreibt Vergangenheit um) | **nicht nötig** — die Vorgabe wirkt nur nach vorn |
| Wer entscheidet | die Maschine | die Keyholderin, indem sie die Vorgabe stellt |

Die Konsequenz ist **Warten**. Sie braucht keinen zusätzlichen Apparat und endet, sobald er liefert.

## 4. Datenmodell

Eine eigene Tabelle, kein Feld an `OrgasmusAnforderung`: die Vorgabe steht über viele Tage, die
Anforderung ist ein Fenster mit festem Anfang und Ende. Eine Bedingung in die Anforderung zu legen
hiesse, deren `beginntAt` dynamisch zu machen — und daran hängen Poller, Erfüllung, Rückzug und die
Vergehens-Ableitung.

```prisma
model WeightRelease {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  /// Die Schwelle, gegen die das Mittel geprüft wird (kg, immer metrisch — wie WeightEntry.weightKg)
  thresholdKg    Float
  /// "below" = das Mittel muss darunter liegen · "above" = darüber (Zunehmen als Vorgabe)
  direction      String   @default("below")
  /// Breite des Mittels in KALENDER-Tagen des Trägers
  averageDays    Int      @default(3)
  /// Wie viele zählende Messungen im Fenster liegen müssen, damit das Mittel gilt
  minMeasurements Int     @default(2)
  /// Optionaler Tagesanstieg der Schwelle. 0 = konstante Schwelle
  stepKg         Float    @default(0)

  /// Mindestlaufzeit: vor diesem Zeitpunkt öffnet nichts, egal was die Waage sagt
  notBeforeAt    DateTime
  /// Wie lange das erzeugte Fenster offen steht
  windowHours    Int      @default(24)
  /// Wird an die erzeugte Anforderung durchgereicht (Öffnen zum Orgasmus erlaubt?)
  openingAllowed Boolean  @default(false)
  /// Freitext, der in der erzeugten Anforderung landet
  message        String?

  createdBy      String?
  createdAt      DateTime @default(now())
  /// Bezugspunkt des Tagesanstiegs — der Tag, an dem `thresholdKg` gilt
  armedAt        DateTime
  /// Gesetzt, sobald sie ausgelöst hat: die Vorgabe ist damit VERBRAUCHT
  releasedAt     DateTime?
  withdrawnAt    DateTime?

  @@index([userId, releasedAt, withdrawnAt])
}
```

**Eine offene Vorgabe je Sub** — wie bei der `OrgasmusAnforderung` („one active at a time"): zwei
Bedingungen, die dasselbe Fenster öffnen, wären für den Träger nicht mehr lesbar. Eine neue
Vorgabe zieht die offene zurück, im selben Vorgang.

**Verbraucht statt wiederkehrend.** Nach dem Auslösen ist die Zeile Geschichte, und die Keyholderin
stellt die nächste. Das ist eine bewusste Entscheidung gegen eine sich selbst fortschreibende Regel:
eine Schwelle, die die Maschine aus dem letzten Gewicht ableitet, trifft eine Aussage über das
nächste Ziel — und die gehört der Keyholderin, nicht dem Rechenkern.

## 5. Die Rechnung

Rein und ohne Datenbank in `src/lib/weightRelease.ts` — testbar, und die MCP-Dry-Run-Vorschau ruft
dieselbe Funktion auf, statt die Kette abzuschreiben (Muster: `checkTask()`).

**Das Mittel** kommt aus `movingAverage()` in `weightSeries.ts` — schon gebaut, getestet und über
ein **Kalender-Fenster** gerechnet, nicht über die letzten N Punkte. Genau der Unterschied ist hier
tragend: Wer vier Tage nicht gewogen hat und dann wieder anfängt, bekäme bei einer Punkt-Zählung ein
„Dreitage-Mittel", das über eine Woche mittelt — die Freigabe hinge dann an Werten, die längst
überholt sind.

**Die Schwelle des Tages:**

```
threshold(dayKey) = thresholdKg + stepKg × daysBetween(dayKey(armedAt), dayKey)
```

Mit `stepKg = 0` (Vorgabe) ist sie konstant. Gerechnet wird in **Tagesschlüsseln des Trägers**
(`weightDayKey`), nicht in Millisekunden — sonst hinge die Schwelle an der Uhrzeit des Wiegens.

**Erfüllt**, wenn alle vier Bedingungen gelten:

1. `now >= notBeforeAt`
2. mindestens `minMeasurements` zählende Messungen im Fenster der letzten `averageDays` Tage
3. `direction === "below"` → `mittel < threshold(heute)`; `"above"` → `mittel > threshold(heute)`
4. keine `OrgasmusAnforderung` offen (Abschnitt 7)

Streng kleiner beziehungsweise grösser, nicht kleiner-gleich: „unter 86,0" heisst unter 86,0.

**Warum `minMeasurements`:** Läge nur ein Wert im Fenster, wäre das „Mittel" dieser eine Wert — und
damit genau das Tagesrauschen zurück, dessen Vermeidung der Grund für das Mittel war. Zwei von drei
Tagen ist der Vorschlag: belastbar genug, und ein vergessener Tag verschiebt die Freigabe nicht
sofort. Die Zahl ist einstellbar, weil „drei von drei" eine legitime Verschärfung ist.

## 6. Welche Messung zählt

Drei Bedingungen, alle drei nötig:

1. **Die erste Messung des Tages.** Ausgewertet wird nur, wenn an diesem Tag noch keine stand
   (`recordWeight()` weiss das bereits: `replaced === false`). Wer nachwiegt, hat seine Chance für
   heute vertan — die „wichtigste Regel" der Vorlage. Sie bleibt auch beim Mittel nötig: ein
   ersetzter Tageswert verschöbe sonst rückwirkend das Mittel, und er könnte so lange wiegen, bis
   es passt. Eine Korrektur wirkt deshalb erst ab dem nächsten Tag mit.
2. **Innerhalb eines Wiege-Fensters** (`inWindow`). Sonst geht ein Abendwert ins Mittel, und die
   Freigabe misst die Tageszeit mit. Führt der Sub keine Fenster (leere Liste = keine
   Fensterpflicht), zählt jede Messung — dann ist die Uhrzeit die Entscheidung der Keyholderin,
   nicht ein Loch in der Regel.
3. **Der Tag liegt nicht vor `notBeforeAt`.** Davor darf er sich wiegen, es öffnet nur nichts.

**Die Auswertung läuft im Erfassungspfad**, nicht im Poller: er steht auf der Waage, tippt die Zahl
ein und erfährt im selben Moment, ob er frei ist. Dieser Augenblick ist der ganze Reiz; ein Poller
schöbe ihn in eine Push-Nachricht eine Minute später.

**Daraus folgt: ohne Wiegen keine Freigabe.** Läuft die Schwelle mit `stepKg` dem Mittel an einem
Tag ohne Messung davon, bemerkt es niemand, bis er das nächste Mal auf der Waage steht. Das ist
kein Versehen: die Freigabe hängt an einer Meldung, nicht am Kalender.

## 7. Was beim Auslösen passiert

`createOrgasmusAnforderung()` — derselbe Dienst, den Oberfläche und MCP benutzen, mit
`art: "GELEGENHEIT"`, `beginntAt: jetzt`, `endetAt: jetzt + windowHours`, `openingAllowed` und
`message` aus der Vorgabe, `createdBy: "system"`.

Danach ist es eine gewöhnliche Freigabe: Banner im Dashboard, Erfüllung über einen ORGASMUS-Eintrag
im Fenster, kein Vergehen (`GELEGENHEIT` ungenutzt ist folgenlos), und `unauthorized_orgasm` greift
im Fenster nicht.

**Meldung an beide.** Ihm als Freigabe, den Keyholdern als Ereignis — nach dem Muster von
`announceTargetEvent()`: fire-and-forget nach dem Commit, denn ein fehlgeschlagener Versand darf die
Messung nicht rückgängig machen.

**Ist bereits eine Anforderung offen, feuert die Vorgabe nicht** und bleibt stehen. Sie würde die
offene sonst verdrängen (die Anlage zieht offene Zeilen zurück) — eine Anweisung der Keyholderin
darf eine Automatik nicht wegräumen. Sobald die Anforderung erledigt oder abgelaufen ist, greift
die Vorgabe beim nächsten Wiegen wieder.

## 8. Was bewusst NICHT eingebaut wird

**Kein Sicherheitsnetz, das die Freigabe irgendwann von selbst gewährt.** Eine Vorgabe, die er nicht
erreicht, bleibt unerfüllt — beliebig lange. Das ist eine ausdrückliche Entscheidung von trublue
(23.08.2026) gegen den Rat aus dem Forum-Thread, wo ein Teilnehmer davor warnt, dass Erleichterungen
„von Zeit zu Zeit sein müssen". Im Betrieb heisst das: die Keyholderin justiert selbst nach —
Schwelle lockern, Vorgabe zurückziehen oder eine Freigabe von Hand stellen. Genau dafür hat sie den
vollen Zugriff (Abschnitt 9).

**Was bleibt, sind die zwei Gesundheits-Schranken**, denn die schützen nicht vor Härte, sondern vor
Schaden:

- **Gesundheits-Halt.** Ist ein `HealthHold` aktiv, wird nicht ausgelöst — dieselbe Stelle, an der
  schon die Meldepflicht pausiert. Der Tagesanstieg läuft dabei **weiter**, und das ist Absicht: er
  ist ein Entgegenkommen, kein Zähler gegen ihn. Ihn während einer Krankheit anzuhalten hiesse, den
  Träger für sie büssen zu lassen.
- **Untergewicht.** Eine Vorgabe, deren Schwelle unter BMI 18,5 führt, wird beim Anlegen abgelehnt
  (`isUnderweightTarget()` gibt es bereits). Bei `direction: "below"` ist die niedrigste Schwelle die
  am ersten Tag — genau die Zahl, die geprüft werden muss.

## 9. Rollen und Rechte

| | Sub | Keyholder |
|---|---|---|
| Vorgabe stellen, ändern, zurückziehen | — | **ja, jederzeit** |
| Bedingung und Schwelle sehen | **ja, vollständig** | ja |
| Über MCP | — | lesen und schreiben |

**Die Keyholderin darf eine laufende Vorgabe verschärfen UND lockern.** Der Forum-Thread lebt vom
Gegenteil — dort ist der Zeitsafe eine Selbstbindung, die Zeit lässt sich nur verlängern. Übertragen
wäre das aber eine Fessel für **sie**, und die gehört nicht in ein Werkzeug, das ihr die Kontrolle
geben soll. Entscheidung trublue, 23.08.2026.

**MCP ist Pflicht im selben Zweig** (`CLAUDE.md`, „MCP-Vollständigkeit"): `set_weight_release` zum
Stellen und Zurückziehen, Bestand in `get_context`, der aktuelle Stand (heutige Schwelle, aktuelles
Mittel, Abstand) im `keyholder_dashboard`. Ein Werkzeug für die ganze Familie, Muster `set_cleaning`.

## 10. Was der Träger sieht

Ein Dashboard-Block und eine Zeile in „Meine Regeln":

```
FREIGABE-VORGABE
Mittel der letzten 3 Tage:  74,6 kg
Nötig:                      unter 74,0 kg      noch 0,6 kg
Frühestens ab:              27.08.2026
```

Das ist der Punkt, an dem die Mechanik überhaupt wirkt. Eine Bedingung, die er erst im Nachhinein
erfährt, ist Willkür; eine, gegen die er rechnen kann, erzeugt den Druck. Im Verlaufs-Diagramm der
Statistik-Karte kommt die Schwelle als zweite gestrichelte Linie dazu — das Zielgewicht hat dort
bereits eine, und beide sind Vorgaben, keine Messungen.

## 11. Wechselwirkungen

- **Sperrzeit:** `openingAllowed` reicht durch wie bei jeder Anforderung. Läuft eine Sperrzeit und
  ist es nicht gesetzt, ist die Freigabe eine Erlaubnis ohne Öffnen — bewusst die Entscheidung der
  Keyholderin, nicht der Vorgabe.
- **`missed_orgasm`:** entsteht nur bei `ANWEISUNG`. Die erzeugte Freigabe ist eine `GELEGENHEIT` —
  ungenutzt folgenlos, und das soll so sein: sie ist ein Preis, keine Pflicht.
- **Zielgewicht:** unabhängig. Das Ziel beschreibt, wohin es gehen soll; die Vorgabe, was ein
  Orgasmus kostet. Beide dürfen nebeneinander stehen, und die Schwelle darf über dem Ziel liegen.
- **Gewichtstracking aus:** keine Messungen, also keine Auslösung. Die offene Vorgabe wird beim
  Abschalten mit zurückgezogen — dieselbe Logik wie bei der Meldepflicht
  (`weightSettingsService.ts`), und aus demselben Grund: eine Bedingung, die er nicht mehr erfüllen
  KANN, wäre eine Dauersperre ohne Ausweg.

## 12. Etappen

| # | Inhalt | Kern |
|---|---|---|
| 1 ✅ | Schema + Migration + `src/lib/weightRelease.ts` (Schwelle, Mittel-Prüfung, Auswertung) samt Tests | rein und testbar, kein UI |
| 2 ✅ | Vorgabe stellen: Aktions-Formular unter `/admin/users/[id]/aktionen`, Service, API-Route, Untergewichts-Schranke | Muster `OrgasmusAnforderungForm` |
| 3 ✅ | Auswertung in `recordWeight()` → `createOrgasmusAnforderung()`, Meldungen an beide Seiten | **die heikelste Etappe**: hier entsteht eine Direktive automatisch |
| 4 ✅ | Sichtbarkeit für den Träger: Dashboard-Block, „Meine Regeln", zweite Linie im Diagramm | die Etappe, ohne die das Feature seinen Zweck verfehlt |
| 5 ✅ | Gesundheits-Halt, Untergewicht, Kopplung an den Tracking-Schalter | wenig Code, hohe Wirkung |
| 6 ✅ | MCP: `set_weight_release`, `get_context`, `keyholder_dashboard` | Muster vorhanden, Tests dazu |

Etappe 4 ist **nicht optional** und gehört nicht ans Ende: eine Bedingung, die der Träger nicht
sieht, ist keine Bedingung, sondern eine Überraschung.

## 13. Entschieden

Alles am 23.08.2026 durch trublue, in dieser Reihenfolge gefragt und beantwortet:

- **Mittel statt Tageswert.** Drei Tage, nicht die Einzelmessung
- **Mindestlaufzeit individuell** je Vorgabe, keine feste Zahl im Code
- **Volle Kontrolle der Keyholderin** — verschärfen und lockern, kein Ratchet
- **Nach einer Freigabe eine neue Vorgabe.** Keine Wiederholung, keine abgeleitete Folgeschwelle
- **Kein Netz**, das die Freigabe irgendwann von selbst gewährt (Abschnitt 8)

`minMeasurements` steht wie vorgeschlagen bei zwei von drei Tagen — einstellbar je Vorgabe.

## 14. Wie es gebaut wurde

| Baustein | Wo |
|---|---|
| Rechnung (Schwelle des Tages, Mittel-Prüfung) | `src/lib/weightRelease.ts` — rein, ohne Datenbank |
| Vorgang (stellen, zurückziehen, Stand, auslösen) | `src/lib/weightReleaseService.ts` |
| Auslösung | `recordWeight()` ruft `applyWeightRelease()`, **nur** bei `replaced === false` |
| Keyholderin | `/admin/users/[id]/aktionen/gewichts-freigabe`, Route `POST/DELETE /api/admin/weight-release` |
| Träger | Dashboard-Block `weightRelease`, Abschnitt in „Meine Regeln", zweite Linie im Verlaufs-Diagramm |
| KI | `set_weight_release`; Stand in `keyholder_dashboard.weight.release` und `get_context.weightRelease` |

Das Mittel kommt aus `movingAverage()` (`weightSeries.ts`) — derselbe Rechenweg, der im Diagramm die
Trendlinie zeichnet, nur über drei Tage statt sieben. Die Schwelle steht dort als zweite gestrichelte
Linie in der Warn-Farbe: das Zielgewicht ist ein Vorhaben, diese Linie eine Bedingung mit Folgen.
