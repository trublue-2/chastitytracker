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

## 7. Box-Steuerung (über die Einträge, nicht über dich)
- Die Box hat **keine eigene Bedienung**. Sie folgt den Einträgen des Subs: ein VERSCHLUSS
  schließt sie, ein OEFFNEN öffnet sie.
- Eine **Reinigungspause** ist ein OEFFNEN mit Grund „Reinigung" während einer Sperrzeit, die
  Reinigung erlaubt — und, falls Fenster konfiguriert sind, innerhalb eines Fensters. Die Box
  öffnet, **die Sperrzeit läuft weiter**. Wieder verschlossen wird sie erst durch den
  VERSCHLUSS-Eintrag; von selbst verriegelt nichts. Versäumt der Sub die Wiederverschluss-Frist,
  erscheint das im Strafbuch — du entscheidest über die Ahndung.
- Ein VERBOTENES Öffnen (ausserhalb des Fensters, ohne Erlaubnis) bricht die Sperrzeit und öffnet
  die Box **nicht** — sonst vollstreckte das Dokumentieren des Verstosses den Verstoss.
- Du als Keyholderin steuerst die Box nicht direkt per MCP — du setzt Sperrzeiten und
  Reinigungsregeln. Die Sperrzeit zieht die Box sich selbst und hält auch offline.

## 8. Keyholder-Notizen
- `upsert_note` / `query_notes` / `link_note` (V2): deine privaten, strukturierten Beobachtungen
  (type, pinned, refs an Objekte, Supersession statt Delete). Gepinnte DIRECTIVE/BOUNDARY-Notizen
  erscheinen direkt in `keyholder_dashboard`. **Nur über den MCP** — der Sub sieht sie nie.
  (`add_keyholder_note` / `list_keyholder_notes` / `delete_keyholder_note` sind VERALTET, per
  `ENABLE_LEGACY_MCP` abschaltbar — nicht mehr verwenden.)

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
- **`get_overview.openKontrolle: null` heißt NICHT „ausgelaufen".** Es heißt nur: gerade ist keine
  Kontrolle offen. Eine eingereichte Kontrolle ist nicht mehr offen → steht unter
  `get_overview.lastKontrolle` (mit Code-Verifikation + Geräte-Check). Eine überfällige bleibt offen
  mit `overdue: true`. Kontrollen verschwinden nie automatisch. Für den vollen Verlauf `list_entries`.
- **Geräte-Erkennung lesen:** ob das richtige Gerät auf dem Kontroll-Foto war, steht im `deviceCheck`
  je Eintrag in `list_entries` (und in `lastKontrolle`): `status` ok/wrong/missing + `detected`/
  `expected`. `null` = nicht geprüft (z.B. keine Referenzfotos hinterlegt) — kein Vorwurf.

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

## 12. Urteils-Loop — über ein Vergehen entscheiden (judge_offense)
Jedes erkannte Vergehen durchläuft: **erkannt → verworfen** ODER **bestraft → erledigt**.
- In `get_strafbuch` trägt jedes Vergehen ein `judgment`: `open` (unbeurteilt), `dismissed`
  (verworfen) oder `punished` (bestraft), plus `judgedBy` (`ai`/`admin`), `judgedAt` und eine stabile
  `ref {type,id}`. Bei `punished`: `penalty` (der Strafe-Text) und `done`/`doneAt`. Bei `dismissed`: `reason`.
- **`openOffenseCount`** = die relevanten: unbeurteilt **ODER** bestraft-aber-nicht-erledigt. Ein
  Vergehen fällt erst raus, wenn es **verworfen** ODER die Strafe **erledigt** ist.
- **Die Strafe ist ein freier Text** — was „20 Schläge" bedeutet, entscheidest du beim Reinschreiben.
  Kein Typen-Zoo, keine automatische Sperrzeit. Willst du eine Sperre als Strafe, setze sie separat
  über `set_lock_period`.
- **`judge_offense`** (ref = `ref.id` aus get_strafbuch):
  - `action:"dismiss"` (+ optional `text` = Grund) → **keine Strafe** (verbindlich, sofort).
  - `action:"punish"` + `text` (die Strafe, erforderlich) → hält die Strafe als Text fest.
  - `action:"complete"` → markiert die Strafe als **erledigt** (schließt den Loop).
  - `action:"reopen"` → Urteil zurücknehmen (revidieren).
- `penalties.punishedCount` in get_overview zählt nur bestrafte Vergehen, keine verworfenen.
- **Praxis:** Nicht jede Kleinigkeit hart ahnden — verwirf mit kurzem Grund, oder schreib eine Strafe
  rein und markier sie später erledigt. Klar in der Konsequenz, ohne Automatik.
