# Tracker-Modell & Abhängigkeiten — Referenz für den MCP-Keyholder

> Spiegel von `src/lib/mcpModelDoc.ts` (Single Source). Das MCP-Tool `explain_model` gibt
> denselben Text zurück. Bei Änderungen beide synchron halten.

Diese Erklärung beschreibt, wie die Begriffe zusammenhängen, die du über den MCP siehst.
Sie setzt KEINEN Code-Zugriff voraus. Lies sie, wenn ein Feld oder eine Regel unklar ist —
sie verhindert die häufigsten Fehldeutungen.

## 1. Zwei Systeme, eine Wahrheit
- **ChastityTracker** — das, was du über den MCP siehst: Tragezeiten, Sperrzeiten, Reinigung,
  Kontrollen, Strafbuch, Notizen. Hier setzt du als Keyholderin Regeln.
- **Heimdall + die Box** — die physische Schlüssel-Lockbox (Hardware). Du steuerst sie NICHT
  direkt; du setzt Regeln im Tracker, die Box vollzieht sie. Du siehst die Box nur indirekt
  (über die Tragezeiten/Einträge, die entstehen).

## 2. Tragen & Sessions
- Eine **KG-Session** ist ein Paar **VERSCHLUSS** (zu) → **OEFFNEN** (auf). `wearingHoursKg`
  (heute/Woche/Monat) ist die Summe dieser Session-Zeiten.
- Ein **Geräte-Wechsel** innerhalb einer Session (KG A raus, KG B rein) **bricht die Session
  NICHT** — die Tragezeit läuft als Ganzes weiter. `wearingHoursKg` zählt das bereits korrekt
  durch; rechne Wechsel nicht doppelt und nimm nicht an, ein Wechsel beende die Kontinuität.
- **WEAR_BEGIN/WEAR_END** sind für Nicht-KG-Kategorien (Plug, Halsband, Knebel …), nicht für KG.

## 3. Lock & Sperrzeit
- `lock.isLocked` / `currentDurationHours`: aktueller Verschluss-Zustand & -Dauer.
- **Sperrzeit** (`activeSperrzeit`) = eine von dir angeordnete Sperrperiode (`endetAt` oder
  unbefristet). Während ihr **darf der Sub nicht selbst öffnen**.
- **`reinigungErlaubt` auf der Sperrzeit**: ob während GENAU DIESER Sperre Reinigungsöffnungen
  erlaubt sind. Das ist der Schalter, der entscheidet, ob ein Öffnen zur Reinigung (oder ein
  Wechsel) in der Sperre rechtmäßig ist (siehe §5).
- **Hard-Cap** (Heimdall, lokal): absolute Obergrenze der Verschlussdauer — nie überschreitbar,
  auch nicht durch dich. Sicherheits-Failsafes (low battery, offline) öffnen notfalls immer.

## 4. Reinigung — die Begriffe sauber
- `reinigung.allowed`: ob Reinigungspausen grundsätzlich erlaubt sind.
- `reinigung.maxMinutesPerBreak`: Max-**Minuten** pro EINZELNER Pause (z.B. 15).
- `reinigung.maxPausesPerDay`: Max-**ANZAHL** Reinigungsöffnungen pro **Kalendertag** (CH).
  **Das ist ein Stückzähler, KEINE Minutenangabe.** (Früher hieß das Feld irreführend
  "maxMinutesPerDay" — ein "2" bedeutet *zwei Öffnungen/Tag*, nicht zwei Minuten.)
- Eine **Reinigungsöffnung** = ein `OEFFNEN` mit `oeffnenGrund=REINIGUNG`.
- **"pro Tag" = CH-Kalendertag** (Reset um Mitternacht lokal), kein rollendes 24h-Fenster.

## 5. Geräte-Wechsel — wie er abgebildet ist (zentral!)
- Es gibt **keinen eigenen "Wechsel"-Vorgang.** Ein Wechsel läuft über die **Reinigungs-
  öffnung** (`OEFFNEN`, grund=REINIGUNG). Das ist bewusst so.
- Folge: Ein Wechsel **verbraucht das Tages-Reinigungskontingent** (`maxPausesPerDay`) wie
  jede andere Reinigungspause.
- Folge: Ein Wechsel **während einer Sperre** ist nur rechtmäßig, wenn die Sperre
  `reinigungErlaubt` hat (sonst gilt er als unautorisierte Öffnung, siehe §6).
- **Praxis:** Willst du dem Sub freie Wechsel erlauben → setze `reinigungErlaubt` auf der
  Sperrzeit UND halte `maxPausesPerDay` hoch genug.

## 6. Strafbuch — ERKANNT vs. BESTRAFT (wichtigster Punkt)
- `detectedOffenseCount` zählt vom System **erkannte** Auffälligkeiten. Die meisten sind
  **live abgeleitet** — sie sind KEINE Strafen.
- `punished` (pro Eintrag) bzw. `penalties.punishedCount` ist nur dann gesetzt, wenn DU
  tatsächlich bestraft hast (ein echter Straf-Record existiert). **Erkennung ≠ Strafe.**
- Kategorien:
  - **unauthorizedOpenings**: ein Öffnen während einer aktiven Sperrzeit, das KEINE erlaubte
    Reinigung war (erlaubt nur, wenn grund=REINIGUNG UND Reinigung beim User UND auf der Sperre
    erlaubt). Abgeleitet, `punished:false` bis du strafst.
  - **reinigungLimitViolations**: eine Reinigungsöffnung **über** dem Tageskontingent
    (`maxPausesPerDay`). Abgeleitet, `punished:false` bis du strafst. (Wird NICHT mehr
    automatisch bestraft.)
  - **lateControls / rejectedControls**: zu spät erfüllte bzw. abgelehnte Kontrollen.
  - **wrongDeviceViolations**: ein anderes Gerät getragen als die Anforderung verlangte.
  - **missedOrgasmInstructions**: eine **ANWEISUNG** (Orgasmus-Pflicht, §11), deren Fenster ablief,
    ohne dass ein passender ORGASMUS erfasst wurde. Abgeleitet, `punished:false` bis du strafst.
    (Eine GELEGENHEIT erzeugt KEIN Vergehen, wenn ungenutzt.)
- **Merke:** Eine erkannte Auffälligkeit ist eine **Vorlage für deine Beurteilung**, keine
  automatische Konsequenz. Ein vereinbarter Wechsel kann erkannt werden, ist aber kein Vergehen
  — du entscheidest, ob du ihn wertest.

## 7. Box-Steuerung (über den Tracker, nicht über dich)
- Der Sub kann aus der Tracker-App die Box **verschließen / öffnen / zur Reinigung öffnen**.
- **clean_open** = eine Reinigungspause, die die Box trotz Sperrzeit **temporär** öffnet (nur im
  Fenster + mit Kontingent) und danach wieder verschließt. **Die Sperrzeit bleibt bestehen** und
  greift nach der Frist weiter.
- Du als Keyholderin steuerst die Box nicht direkt per MCP — du setzt Sperrzeiten und
  Reinigungsregeln; die Box enforced sie lokal (auch offline).

## 8. Keyholder-Notizen
- `add_keyholder_note` / `list_keyholder_notes` / `delete_keyholder_note`: deine privaten
  Beobachtungen zum Trageverhalten (optional getaggt mit KG + Kategorie). Die jüngsten 8 stehen
  in `get_overview.keyholderNotes`. **Nur über den MCP** — der Sub sieht sie nie.

## 9. Die Abhängigkeiten in einem Satz
Geräte-Wechsel → wird als Reinigungsöffnung geloggt → verbraucht das Tageskontingent
(`maxPausesPerDay`, CH-Kalendertag) → **über Budget** ⇒ `reinigungLimitViolation` (erkannt,
nicht bestraft); **während einer Sperre ohne `reinigungErlaubt`** ⇒ zusätzlich
`unauthorizedOpening` (erkannt, nicht bestraft). In beiden Fällen entscheidest **du**, ob es
eine Strafe gibt.

## 10. Häufige Fehldeutungen (vermeiden)
- `maxPausesPerDay` ist eine **Anzahl**, keine Minuten. "2" = zwei Öffnungen/Tag.
- Eine **erkannte** Auffälligkeit ist **nicht automatisch bestraft** (`punishedCount`).
- Ein **Geräte-Wechsel** ist normal und läuft über den Reinigungspfad — kein Vergehen an sich.
- `wearingHoursKg` summiert bereits alle Sessions inkl. Wechsel — nicht doppeln, Kontinuität
  bleibt über einen Wechsel hinweg erhalten.

## 11. Orgasmus-Direktive (request_orgasm)
- Du kannst dem Sub einen Orgasmus mit **Zeitfenster** vorgeben (`request_orgasm`). Zwei Charaktere:
  - **ANWEISUNG** = Pflicht. Wird im Fenster kein passender ORGASMUS erfasst, entsteht ein
    `missedOrgasmInstructions`-Vergehen (§6, erkannt — nicht automatisch bestraft).
  - **GELEGENHEIT** = Erlaubnis. Ungenutzt ⇒ keine Konsequenz.
- Parameter: `art`, Fenster (`beginsAt`/`endsAt` oder `windowHours`), optional `requiredType`
  (verlangte Orgasmus-Art; sonst zählt jeder), `openAllowed`, `message`.
- **`openAllowed`**: erlaubt dem Sub, sich im Fenster zum Orgasmus zu **öffnen, ohne** dass das
  als unautorisierte Öffnung (§6) zählt — analog zur Reinigungs-Ausnahme. Ohne dieses Flag bleibt
  eine Sperrzeit unangetastet, d.h. Öffnen wäre ein Vergehen.
- **Erfüllung**: automatisch, sobald der Sub einen ORGASMUS im Fenster (und passend zu
  `requiredType`, falls gesetzt) erfasst. Es ist immer nur **eine** Direktive aktiv — eine neue
  ersetzt die vorige. Zurückziehen via `withdraw` mit `target:"orgasm_directive"`.
- **Lesen**: die aktuell offene Direktive steht in `get_overview.openOrgasmusAnforderung`;
  verpasste ANWEISUNGEN in `get_strafbuch.missedOrgasmInstructions`.
