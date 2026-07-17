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
- `reinigung.usedToday`: heute (CH-Tag) bereits verbrauchte Öffnungen. Rest = maxPausesPerDay − usedToday.
- `cleaningPauses` (in `get_session`, je Session): Anzahl Reinigungspausen = Segment-Grenzen innerhalb
  der Session (bei WEAR immer 0). Zählt Pausen der EINEN Session, nicht das Tageskontingent
  (`usedToday`) — A-13, MCP-Restliste 2026-07-17.
- `reinigung.windows`: erlaubte Tages-**Zeitfenster** (HH:MM, CH-Zeit). Sie binden NUR während einer
  **aktiven Sperrzeit**, die dir selbst das Reinigen erlaubt (siehe §3) — außerhalb einer Sperrzeit ist
  eine Reinigungsöffnung IMMER erlaubt, egal was `windows` sagt. Schließe aus `windows` allein NICHT,
  ob jetzt geöffnet werden darf — das beantwortet `openingAllowedNow` direkt.
- `reinigung.windowsBinding`: `true` nur, wenn `windows` gerade tatsächlich einschränkt (aktive
  Sperrzeit + sowohl Sperrzeit als auch du als Keyholderin erlauben Reinigen). `false` +
  `windowsBindingReason` nennt WARUM nicht (`no-active-lock-period` | `user-not-allowed` |
  `lock-period-forbids` | `no-windows-configured` — keine `windows` gesetzt, nichts zum Binden).
- `reinigung.openingAllowedNow`: die eigentliche Frage — darf JETZT eine Reinigungsöffnung
  stattfinden? Vereint User-Flag, Sperrzeit-Flag und Fenster in einem Feld.
- `reinigung.windowOpenNow`: das gerade offene Fenster (`until` = Ende HH:MM) oder `null` — nur
  aussagekräftig, wenn `windowsBinding: true` ist (siehe oben).
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
  - **autoRemovedControls** (`get_offenses`-Typ `auto_removed_control`): eine Kontrolle, die nach
    ignorierter Eskalations-Erinnerung automatisch entfernt wurde (das System buchte ein OEFFNEN mit
    Grund `AUTO_ENTFERNT`). Abgeleitet, `punished:false` bis du strafst. **Massgeblich sind die
    kanonischen `get_offenses`-Typ-Namen** (`auto_removed_control`, `cleaning_limit`,
    `unauthorized_opening`, …) — die deutschen Sammel-Namen hier sind nur ihre Erklärung (A-03,
    MCP-Restliste 2026-07-17).
  - **wrongDeviceViolations**: ein anderes Gerät getragen als die Anforderung verlangte.
  - **missedOrgasmInstructions**: eine **ANWEISUNG** (Orgasmus-Pflicht, §11), deren Fenster ablief,
    ohne dass ein passender ORGASMUS erfasst wurde. Abgeleitet, `punished:false` bis du strafst.
    (Eine GELEGENHEIT erzeugt KEIN Vergehen, wenn ungenutzt.)
- **Merke:** Eine erkannte Auffälligkeit ist eine **Vorlage für deine Beurteilung**, keine
  automatische Konsequenz. Ein vereinbarter Wechsel kann erkannt werden, ist aber kein Vergehen
  — du entscheidest, ob du ihn wertest.

## 7. Box-Steuerung (über die Einträge, nicht über dich)
- Die Box hat **keine eigene Bedienung**. Sie folgt den Einträgen des Subs: ein VERSCHLUSS setzt
  ein `lock`-Kommando, ein OEFFNEN ein `open`-Kommando — als **Intent**, nicht sofort wirksam.
  Das SOLL (`locked` in `get_box_state`) kippt erst, wenn die Box das Kommando beim NÄCHSTEN
  Sync ausführt und zurückmeldet; bis dahin bleibt `locked` auf dem alten Stand — kurz nach einem
  frischen VERSCHLUSS kann das noch `false` sein (Sync-Lag), das ist keine Box-Störung.
  `keyInBox: false` beim VERSCHLUSS hält die Box bewusst zurück: kein `lock`-Kommando, Ehrensache.
- **Eine Sperrzeit schliesst die Box nicht direkt.** Sie hält sie über `keyholderLocked`
  (verhindert lokales Öffnen durch den Sub an der Box selbst) und verlängert `lockUntil` — das
  SOLL (`locked`) hängt weiterhin an den Einträgen, nicht an der Sperrzeit.
- `keySecured` (`get_box_state`/`keyholder_dashboard.boxState`) beantwortet direkt, was eine
  Alleinzeit-Vorgabe verlangt — Käfig zu UND Schlüssel drin, UND das noch aktuell:
  `reportedLocked === true && keyInBox === true && !staleLock`. Rechne das nicht selbst aus fünf
  Feldern zusammen. Ist `hardwareEnforced: false`, nennt `hardwareEnforcedReason` den EINEN Grund
  maschinenlesbar (`soll-open`/`reported-open`/`key-not-in-box`/`stale-lock`; A-07).
- Eine **Reinigungspause** ist ein OEFFNEN mit Grund „Reinigung" während einer Sperrzeit, die
  Reinigung erlaubt — und, falls Fenster konfiguriert sind, innerhalb eines Fensters. Die Box
  öffnet, **die Sperrzeit läuft weiter**. Wieder verschlossen wird sie erst durch den
  VERSCHLUSS-Eintrag; von selbst verriegelt nichts. Versäumt der Sub die Wiederverschluss-Frist,
  erscheint das im Strafbuch — du entscheidest über die Ahndung.
- Ein VERBOTENES Öffnen (ausserhalb des Fensters, ohne Erlaubnis) bricht die Sperrzeit und öffnet
  die Box **nicht** — sonst vollstreckte das Dokumentieren des Verstosses den Verstoss.
- Du als Keyholderin steuerst die Box nicht direkt per MCP. Die Sperrzeit wirkt über
  `keyholderLocked`/`lockUntil` (siehe oben). Reinigungsregeln erreichen die Box gar NICHT
  direkt — sie entscheiden nur, ob der Tracker eine Reinigungsöffnung (OEFFNEN) überhaupt zulässt;
  erst dieser Eintrag löst wie jeder andere ein Box-Kommando aus (`boxCommandForEntry`).

## 8. Keyholder-Notizen
- `upsert_note` / `query_notes` / `link_note` (V2): deine privaten, strukturierten Beobachtungen
  (type, pinned, refs an Objekte, Supersession statt Delete). Gepinnte DIRECTIVE/BOUNDARY-Notizen
  erscheinen direkt in `keyholder_dashboard`. **Nur über den MCP** — der Sub sieht sie nie.

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
- **`keyholder_dashboard.nextRelevant.openControl: null` heißt NICHT „ausgelaufen".** Es heißt nur:
  gerade ist keine Kontrolle offen. Eine eingereichte Kontrolle ist nicht mehr offen. Eine überfällige
  bleibt offen mit `overdue: true`. Kontrollen verschwinden nie automatisch. Die zuletzt eingereichte
  samt Code-Verifikation und Geräte-Check liest du über `list_entries` (PRUEFUNG-Einträge).
- **Geräte-Erkennung lesen:** ob das richtige Gerät auf dem Kontroll-Foto war, steht im `deviceCheck`:
  in `get_session` je Kontrolle als `{status, isOffense}` (`status` ok/wrong/missing/`not_checked`,
  wobei `not_checked` das früher mehrdeutige `null` ersetzt); in `list_entries` je PRUEFUNG-Eintrag als
  `{status, detected, expected}` bzw. `null` = nicht geprüft. In BEIDEN gilt: **`status: "wrong"` ist
  KEIN Vergehen** — der deviceCheck vergleicht Bild vs. DEKLARATION, nicht gegen eine
  `request_lock`-Anforderung; nur Letzteres erzeugt ein `wrong_device`-Vergehen (§6). `get_session`
  macht das mit `isOffense: false` explizit; `not_checked`/`null` heisst „nicht geprüft" (z.B. keine
  Referenzfotos hinterlegt) — kein Vorwurf (N-4/N-11, MCP-Restliste 2026-07-17).
  `expected`/`detected` sind der **zum Prüfzeitpunkt eingefrorene** Stand (welches Gerät damals
  deklariert war vs. was das Bild zeigte) — sie können von der HEUTE aktuellen `deviceDeclared`
  abweichen, wenn der Sub inzwischen das Gerät gewechselt hat. Ein altes `wrong` rückwirkend gegen das
  jetzige Gerät zu lesen, ist ein Fehlschluss (N-16, MCP-Restliste 2026-07-17).

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
- **Lesen**: die aktuell offene Direktive steht in `keyholder_dashboard.nextRelevant.openOrgasmWindow`;
  verpasste ANWEISUNGEN in `get_offenses` (Typ `missed_orgasm`).

## 12. Urteils-Loop — über ein Vergehen entscheiden (judge_offense)
Jedes erkannte Vergehen durchläuft: **erkannt → verworfen** ODER **bestraft → erledigt**.
- In `get_offenses` trägt jedes Vergehen ein `judgment`: `open` (unbeurteilt), `dismissed`
  (verworfen) oder `punished` (bestraft), plus `judgedBy` (`ai`/`admin`), `judgedAt` und eine
  stabile `ref {type,id}`. Bei `punished`: `penalty` (der Strafe-Text) und `done`/`doneAt`
  (ob die Strafe erledigt ist). Bei `dismissed`: `reason`.
- **`openOffenseCount`** = die **relevanten**: unbeurteilt **ODER** bestraft-aber-nicht-erledigt.
  Ein Vergehen fällt erst raus, wenn es **verworfen** ODER die Strafe **erledigt** ist.
- **Die Strafe ist ein freier Text** — was „20 Schläge" bedeutet, entscheidest du beim Reinschreiben.
  Kein Typen-Zoo, keine automatische Sperrzeit. Willst du eine Sperre als Strafe, setze sie separat
  über `set_lock_period`.
- **`judge_offense`** (ref = `id` der Zeile aus `get_offenses`):
  - `action:"dismiss"` (+ optional `text` = Grund) → **keine Strafe** (verbindlich, sofort).
  - `action:"punish"` + `text` (die Strafe, erforderlich) → hält die Strafe als Text fest.
  - `action:"complete"` → markiert die Strafe als **erledigt** (schließt den Loop).
  - `action:"reopen"` → Urteil zurücknehmen (revidieren).
- `get_offenses.pendingPenaltyCount` zählt bestrafte, aber noch nicht erledigte Vergehen.
- **Praxis:** Du musst nicht jede Kleinigkeit hart ahnden — verwirf mit kurzem Grund, oder schreib
  eine Strafe rein und markier sie später erledigt. Klar in der Konsequenz, ohne Automatik.

## 13. Dashboard, Segmente, strukturiertes Wissen
Leitprinzip: **ein Dashboard-Call beantwortet ~90 %;
Wahrheit kommt aus Segmenten/Bildern, nicht aus Labels; häufige Fragen sind vorberechnet; Regeln
und Grenzen sind gepinnt und versioniert.**
Jede Deep-View trägt eine **`schemaVersion`**: gleiche Nummer = gleiche Form UND gleiche
Feld-Bedeutung. Ändert sich Semantik oder fallen Felder weg, steigt die Nummer — ein historischer
Wert ist damit immer in seiner damaligen Bedeutung interpretierbar.

- **`keyholder_dashboard`** — DER Einstieg: currentRun vs Personal Best, was JETZT getragen wird
  (KG + Kategorien), nextRelevant (Kontrolle/Sperrzeit/Orgasmus-Fenster), Ziele + Adhärenz, offene
  Vergehen, gepinnte standingDirectives + boundaries, BoxState, HealthHold. Erst danach Deep-Views.
  `currentRun.since` = Lauf-Anfang (deckt sich mit `durationHours`); `currentRun.currentSegmentSince`
  = Beginn des AKTUELLEN Segments — weicht bei Reinigungspausen von `since` ab (A-01,
  MCP-Befundliste 2026-07-17: vorher trug `since` den jüngsten KG-Eintrag, also bei Pausen den
  letzten Wiederverschluss statt des Lauf-Anfangs, im Widerspruch zu `durationHours`).
  `currentRun.deviceName` und `wornNow[].deviceName` sind das MASSGEBLICHE Gerät (`deviceEffective` —
  bei image-conflict gewinnt das Bild), NICHT mehr das deklarierte (N-2, MCP-Restliste 2026-07-17);
  daneben `deviceDeclared` + `deviceConfidence`, damit der Konflikt am Ort der Frage sichtbar ist.
- **Segmente (`get_session`)** — liefert Sessions ALLER Kategorien (KG + Plug/Halsband/Knebel, je
  mit `category`, filterbar). Eine KG-Session zerfällt an REINIGUNG-Öffnungen in **Segmente**,
  pro Segment GENAU EIN Gerät. Die Session-id ist die Lock-Entry-id des Kopfs und damit **identisch
  mit `segments[0].id`** (das erste Segment beginnt an genau diesem Lock-Eintrag) — by design, kein
  Duplikat (A-12, MCP-Restliste 2026-07-17). `deviceBreakdown` beantwortet „welches Gerät wie lange" korrekt
  (statt eines falschen Einzel-Labels). `deviceConfidence`: `declared` | `undeclared` (KEIN Gerät
  angegeben — bis A-04 fiel das fälschlich auf `declared` zurück, kein Vergehen) | `image-confirmed` |
  `image-conflict` (Bild nennt ein Gerät aus ANDEREM Cluster → **Bild gewinnt**) | `cluster-ambiguous`
  (optisch gleiches Gerät aus DEMSELBEN `lookalikeCluster` → unzuverlässig, **soft**, deklariert bleibt,
  kein Vergehen). **`deviceEffective`** ist das für `deviceBreakdown`/`device_stats` massgebliche
  Gerät. `endedBy`: `cleaning` (Pause) vs `session-end` vs `open`. `dataQualityFlags` sind
  maschinenlesbar `{code, segmentIndex, detail}` (A-05, MCP-Restliste 2026-07-17): `code` ∈
  `orphaned-session`/`image-conflict`/`cluster-ambiguous`/`segment-without-device`, `detail` = die
  menschliche Erklärung. Der Kontroll-`deviceCheck` je Segment ist `{status, isOffense}`: `status`
  ok/wrong/missing/`not_checked` (ersetzt das mehrdeutige `null`), `isOffense` IMMER false — ein
  deviceCheck vergleicht Bild vs. DEKLARATION, nie gegen eine Anforderung, erzeugt also nie ein
  `wrong_device`-Vergehen (N-4/N-11). Jedes Segment trägt zusätzlich `durationMinutes` (ganzzahlig):
  Einträge sind minutengenau, ein Wechsel in unter einer Minute kollabiert sonst auf
  `durationHours: 0` — bewusst so, Minute bleibt (N-12).
- **Geräte-Metadaten (`get_devices` / `set_device_meta`)** — `securityLevel` (SECURING vs
  TRUST_ONLY; **v.a. für sichernde Geräte** wie KG oder Halsreif — `null` ist keine Datenlücke),
  `lookalikeClusterId`: ein Geräte-Mismatch **innerhalb eines
  Clusters ist nie ein echtes Vergehen** (siehe `get_offenses` → `possiblyClusterInternal`).
  **`lookalikeClusterId` ist kein lokales Metadatenfeld:** es geht in die `deviceConfidence`-Ableitung
  ein und rechnet damit die Geräte-Attribution JEDER historischen Session mit Bild-Deklarations-
  Konflikt rückwirkend neu (inkl. `device_stats` und der Zusammensetzung von `records`) — vor einem
  `set_device_meta(lookalikeClusterId:…)` den `dryRun`-`diff` prüfen (N-14, MCP-Restliste 2026-07-17).
  `pullOffRisk`: **true = das Gerät lässt sich trotz Verschluss abstreifen (unsicher)**, false =
  geprüft sicher, **`null` = nie beurteilt** (K-08 — früher machte ein `false`-Default aus „nicht
  beurteilt" ein „sicher"). `archived` ist per `set_device_meta` setzbar; `get_devices` blendet
  Archivierte per Default aus (`includeArchived:true` zeigt sie), nimmt `deviceId`/`includeNotes`
  (K-09/K-10). `trackingEnabled` (von der Kategorie): **Default true** (Gerät zählt Trage-Sessions);
  **false = Inventory-only** — dann liefert das Gerät PER DESIGN keine Trage-Sessions. Das ist eine
  BEWUSSTE Nutzer-Einstellung an der Kategorie, NICHT automatisch für Halsband/Knebel: ein als
  Trage-Gerät geführtes Halsband zählt sehr wohl, wenn der Nutzer Tracking anlässt (DOK-03,
  MCP-Restliste 2026-07-17). `referenceImages` ist
  **bewusst nur die Anzahl**: die Bilder wertet der Server für `deviceConfidence` aus, via MCP
  sind sie nicht abrufbar.
- **Vorberechnet:** `device_stats` (je Gerät total/avg/median/min/`maxHours`/`maxUnbrokenSegmentHours`).
  `maxHours` = längste einzelne SESSION (kann Segmente über Pausen hinweg umfassen, liegt also
  arithmetisch über einer echten Strecke); `maxUnbrokenSegmentHours` = längstes EINZELNES, ununter-
  brochenes Segment — die ehrliche Marke, deckt sich mit `records.longestUnbrokenSegmentHours` (A-15,
  MCP-Restliste 2026-07-17). Weiter:
  `records` (PB, aktuell vs PB, orgasmusfrei), `period_summary` (Tag/Woche/Monat + Ziel),
  `denial_trend` (Streak, Trend, orgasmHistory). `records.longestRunHours` ist eine
  SESSION-Bruttosumme über Segmente/Geräte hinweg (Reinigungspausen raus, Gerätewechsel NICHT
  getrennt) — für die ehrliche Dauertrage-Marke `longestUnbrokenSegmentHours` nutzen (längstes
  EINZELNES abgeschlossenes Segment, ein Gerät) + `currentUnbrokenSegmentHours`/
  `currentUnbrokenVsBestPct` fürs laufende Segment (A-14, MCP-Befundliste 2026-07-17). In
  `device_stats` stehen nur getragene Geräte:
  **Abwesenheit ≠ Nichtnutzung** (nie getragene und Inventory-only-Geräte fehlen ganz; Inventar-
  Wahrheit ist `get_devices`). Jede Zeile trägt `lastWornUntil`+`isWornNow` (K-20 — `lastWornAt` ist
  nur der START der letzten Session; ob das Gerät JETZT getragen wird, sagt `isWornNow`). Zeiten ohne
  Geräte-Zuordnung stehen separat in `unassigned` — eine LISTE, getrennt nach `reason`:
  `pre_device_tracking` (vor der Geräte-Erfassung, echte Projektgeschichte) vs `not_declared`
  (aktuelle Strecke ohne Geräte-Wahl, Erfassungslücke) (A-09).
- **`get_offenses`** — vereinheitlichtes Disziplin-Ledger (alle Vergehen als eine Liste mit
  status/judgment/consequence). Geurteilt wird über `judge_offense`.
- **`list_training_goals`** — Supersession statt Delete (B-04, MCP-Befundliste 2026-07-17):
  `delete_training_goal` löscht NICHT physisch, sondern setzt `deletedAt` — die Zeile bleibt für die
  Historie erhalten. Standardmässig ausgeblendet (`status` nie `"deleted"`); erst
  `includeDeleted:true` macht `list_training_goals` wirklich zur AUTORITATIVEN Ziel-Historie inkl.
  gelöschter Ziele (`status:"deleted"`, `deletedAt` gesetzt — hat Vorrang vor dem datumsbasierten
  Status).
- **Notes v2 (`query_notes` / `upsert_note` / `link_note`)** — strukturiert + versioniert:
  `type` (DIRECTIVE|BOUNDARY|OBSERVATION|CORRECTION|EQUIPMENT|DATA|HISTORY), `status`,
  `pinned`, `source`/`confidence` (Nutzer-Fakt vs eigener Schluss), `doDont` (für BOUNDARY),
  `refs` (typisierte Verknüpfung an Objekte — kommen inline mit get_session/get_devices/get_offenses).
  **Supersession statt Delete**: alte Note → `superseded`, kein Datenverlust; die aktuelle trägt
  `isLatest:true` (der Vorwärts-Zeiger, den `supersedesId` nur rückwärts liefert, K-22). Refs auf
  unbekannte Objekte werden beim Schreiben abgewiesen (kein stiller Dangling-Ref); `query_notes`
  liefert `returnedCount` und meldet ein konkret abgefragtes, nicht existentes Objekt als
  `unknownRef:true` (statt still `[]`, K-13). Nennt der `kg`-Tag ein Inventar-Gerät, wird automatisch
  ein device-Ref angelegt — auffindbar zählt NUR der Ref, nicht der Freitext-Tag.
- **Kontext (`get_context` / set_health_hold / upsert_appointment / upsert_recurring_context)** —
  HealthHold (Gesundheits-Zurückhaltung), Wochen-Kontext, Termine (deviceFree).
- **`timeline`** — alle Ereignisse auf einer Achse (Segment-basiert). **`get_action_log`** —
  Audit ALLER Writes, V1 wie V2 (warum/wann/wer — seit B-03, MCP-Befundliste 2026-07-17; vorher nur
  V2). **`get_box_state`** — `locked` = SOLL (soll die Box zu sein);
  `reportedLocked` = IST (war sie beim letzten Sync wirklich zu — kann vom SOLL abweichen: „soll zu,
  steht offen und wartet auf Knopf/USB", denn zufahren tut die Box nur mit jemandem am Gerät;
  `null` = noch keine IST-Meldung → SOLL gilt); `hardwareEnforced` = die EINE ehrliche
  Vollstreckungs-Antwort (hält die Box den Schlüssel gerade fest — **online-unabhängig**, der zuletzt
  gemeldete Stand gilt): true nur, wenn das IST zu meldet UND `keyInBox!==false` UND `!staleLock`.
  Bei false nennt `hardwareEnforcedReason` genau EIN Feld als Grund (A-07, MCP-Restliste 2026-07-17):
  `soll-open` (`locked:false`), `reported-open` (`reportedLocked:false`), `key-not-in-box`
  (`keyInBox:false`) oder `stale-lock` (`staleLock:true`); bei true ist es `null`. `staleLock` = die Box hat sich seit dem letzten Sync
  deterministisch selbst geöffnet (gecachte Frist verstrichen ODER Offline-Failsafe nach
  `offlineOpenHours` erreicht — beides auch offline). `keyInBox` = Deklaration des Subs beim
  laufenden Verschluss (`false` = er behält den Schlüssel, die Box bekam bewusst kein `lock` → das
  erklärt `hardwareEnforced:false`, es ist keine Box-Störung; `null` = nicht erklärt/nicht
  verschlossen — kein „nein"). Auch als `currentRun.keyInBox` im Dashboard. `keySecured` = Käfig
  zu UND Schlüssel drin in einem Feld (`reportedLocked===true && keyInBox===true && !staleLock` —
  identisch zu §7, inkl. `!staleLock`; N-6, MCP-Restliste 2026-07-17) — siehe §7.

### Write-Disziplin
**`reason` ist Pflicht (Audit) bei JEDEM Write-Tool, V1 wie V2** — auch bei den direktiven Tools
(`set_lock_period`, `request_orgasm`, `judge_offense`, …), seit B-03.
Die Wissens-/Kontext-Writes (`upsert_note`, `set_device_meta`, `set_health_hold`, …) unterstützen
**`dryRun:true`** mit voller Tiefe (prüft den echten Service-Zustand, zeigt Wirkung/Konflikte OHNE zu
committen) und liefern DIESELBE Antwortform wie die V1-Tools: `{wouldSucceed, problem?, preview}`, bei
einem Edit zusätzlich **`diff`** (Feld-Diff `[alt, neu]`, per Konstruktion identisch mit dem echten
Commit) und den projizierten Nachher-Zustand **`after`** (N-15, MCP-Restliste 2026-07-17: vorher lieferte
der V2-dryRun nur `before` — der Verweis „prüfe den dryRun-diff" bei `lookalikeClusterId` ist damit erst
jetzt befolgbar). Die direktiven V1-Tools unterstützen `dryRun:true` ebenfalls, aber LEICHTER: geprüft
werden Argument-Auflösung + die dort verfügbaren reinen Regeln (z.B. Fenster-/Zielwert-Plausibilität)
plus ein Best-Effort-Vorab-Check des naheliegendsten Ablehnungsgrunds (z.B. „bereits verschlossen") —
NICHT dieselbe transaktionale Tiefe wie bei den Wissens-Writes. Bei jedem Tool, das ein BESTEHENDES
Objekt ändert (`edit_lock_period`, `edit_training_goal`, `delete_training_goal`, `set_cleaning`,
`resolve_inspection`, `judge_offense`, `set_device_meta`, `upsert_note`, `upsert_appointment`,
`upsert_recurring_context`, `set_health_hold`), trägt die Preview `diff`+`after` (seit B-05/N-15).
Reine Creates (`request_lock`, `request_orgasm`, `set_training_goal`, `link_note`, sowie `upsert_*`
ohne `id`) haben kein „vorher" und liefern deshalb kein `diff`/`after`. **`after` ist der projizierte
Skalar-Stand (Diff-Basis), nicht das volle committete `newState`-DTO.**
**Optimistic Concurrency:** Note, Gerät, Termin und Wochen-Slot tragen eine **`version`**
(in get_devices/query_notes/get_context und in jedem Write-Ergebnis). Gib bei **Edits**
`expectedVersion` mit — weicht die aktuelle Version ab (anderer Schreiber dazwischen, z.B. eine
zweite Keyholder-Instanz), wird der Write mit Konflikt-Fehler abgelehnt statt still zu
überschreiben; dann neu lesen und mit der aktuellen Version wiederholen. Jeder Edit inkrementiert
`version`; ohne `expectedVersion` gilt Last-Write-Wins wie bisher. Alle Writes sind agent-autonom (keine
Berechtigungs-Stufen) und erfordern **keine Bestätigung** — entscheide und führe direkt aus, ohne
beim User rückzufragen (auch die benachrichtigenden Direktiven wie Sperrzeit/Inspektion/Strafe).
**Zeiten sind ISO-8601 mit Offset** (dashboard.nextRelevant, get_offenses, …); Ausnahme ist
`list_entries`, das die Roh-Einträge menschenlesbar im Instanz-Format zeigt. Für Fristfragen
zusätzlich `remainingMinutes`/`overdue` verfügbar.

### Noch nicht umgesetzt (bewusst)
- **Generisches `scheduledFor`** (zeitlich geplante Writes über alle Tools) ist noch NICHT da —
  es braucht zusätzliche Infrastruktur (einen Poller). Geplante Kontrollen gibt es weiterhin über
  `request_inspection` (delayMinutes).
