// Plain-language reference of the tracker's domain model + dependencies, for the MCP keyholder.
// Single source of truth: the MCP tool `explain_model` returns this verbatim; docs/mcp-keyholder-guide.md
// is a human-readable mirror — keep both in sync when editing.

export const MCP_MODEL_DOC = `# Tracker-Modell & Abhängigkeiten — Referenz für den MCP-Keyholder

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
- Eine **KG-Session** ist ein Paar **VERSCHLUSS** (zu) → **OEFFNEN** (auf). \`wearingHoursKg\`
  (heute/Woche/Monat) ist die Summe dieser Session-Zeiten.
- Ein **Geräte-Wechsel** innerhalb einer Session (KG A raus, KG B rein) **bricht die Session
  NICHT** — die Tragezeit läuft als Ganzes weiter. \`wearingHoursKg\` zählt das bereits korrekt
  durch; rechne Wechsel nicht doppelt und nimm nicht an, ein Wechsel beende die Kontinuität.
- **WEAR_BEGIN/WEAR_END** sind für Nicht-KG-Kategorien (Plug, Halsband, Knebel …), nicht für KG.

## 3. Lock & Sperrzeit
- \`lock.isLocked\` / \`currentDurationHours\`: aktueller Verschluss-Zustand & -Dauer.
- **Sperrzeit** (\`activeSperrzeit\`) = eine von dir angeordnete Sperrperiode (\`endetAt\` oder
  unbefristet). Während ihr **darf der Sub nicht selbst öffnen**.
- **\`reinigungErlaubt\` auf der Sperrzeit**: ob während GENAU DIESER Sperre Reinigungsöffnungen
  erlaubt sind. Das ist der Schalter, der entscheidet, ob ein Öffnen zur Reinigung (oder ein
  Wechsel) in der Sperre rechtmäßig ist (siehe §5).
- **Hard-Cap** (Heimdall, lokal): absolute Obergrenze der Verschlussdauer — nie überschreitbar,
  auch nicht durch dich. Sicherheits-Failsafes (low battery, offline) öffnen notfalls immer.

## 4. Reinigung — die Begriffe sauber
- \`reinigung.allowed\`: ob Reinigungspausen grundsätzlich erlaubt sind.
- \`reinigung.maxMinutesPerBreak\`: Max-**Minuten** pro EINZELNER Pause (z.B. 15).
- \`reinigung.maxPausesPerDay\`: Max-**ANZAHL** Reinigungsöffnungen pro **Kalendertag** (CH).
  **Das ist ein Stückzähler, KEINE Minutenangabe.** (Früher hieß das Feld irreführend
  \"maxMinutesPerDay\" — ein \"2\" bedeutet *zwei Öffnungen/Tag*, nicht zwei Minuten.)
- \`reinigung.usedToday\`: heute (CH-Tag) bereits verbrauchte Öffnungen. Rest = maxPausesPerDay − usedToday.
- \`reinigung.windows\`: erlaubte Tages-**Zeitfenster** (HH:MM, CH-Zeit). **Sind welche gesetzt, ist die
  Reinigung an diese Uhrzeiten GEBUNDEN** — außerhalb ist keine Öffnung erlaubt. Eine **leere** Liste
  bedeutet: KEINE Uhrzeit-Bindung (jederzeit, nur durch das Tageskontingent begrenzt). Behaupte also
  NICHT pauschal \"nicht an Uhrzeiten gebunden\" — prüf erst \`windows\`.
- \`reinigung.windowOpenNow\`: das gerade offene Fenster (\`until\` = Ende HH:MM) oder \`null\`, wenn die
  aktuelle Uhrzeit außerhalb aller Fenster liegt.
- Eine **Reinigungsöffnung** = ein \`OEFFNEN\` mit \`oeffnenGrund=REINIGUNG\`.
- **\"pro Tag\" = CH-Kalendertag** (Reset um Mitternacht lokal), kein rollendes 24h-Fenster.

## 5. Geräte-Wechsel — wie er abgebildet ist (zentral!)
- Es gibt **keinen eigenen \"Wechsel\"-Vorgang.** Ein Wechsel läuft über die **Reinigungs-
  öffnung** (\`OEFFNEN\`, grund=REINIGUNG). Das ist bewusst so.
- Folge: Ein Wechsel **verbraucht das Tages-Reinigungskontingent** (\`maxPausesPerDay\`) wie
  jede andere Reinigungspause.
- Folge: Ein Wechsel **während einer Sperre** ist nur rechtmäßig, wenn die Sperre
  \`reinigungErlaubt\` hat (sonst gilt er als unautorisierte Öffnung, siehe §6).
- **Praxis:** Willst du dem Sub freie Wechsel erlauben → setze \`reinigungErlaubt\` auf der
  Sperrzeit UND halte \`maxPausesPerDay\` hoch genug.

## 6. Strafbuch — ERKANNT vs. BESTRAFT (wichtigster Punkt)
- \`detectedOffenseCount\` zählt vom System **erkannte** Auffälligkeiten. Die meisten sind
  **live abgeleitet** — sie sind KEINE Strafen.
- \`punished\` (pro Eintrag) bzw. \`penalties.punishedCount\` ist nur dann gesetzt, wenn DU
  tatsächlich bestraft hast (ein echter Straf-Record existiert). **Erkennung ≠ Strafe.**
- Kategorien:
  - **unauthorizedOpenings**: ein Öffnen während einer aktiven Sperrzeit, das KEINE erlaubte
    Reinigung war (erlaubt nur, wenn grund=REINIGUNG UND Reinigung beim User UND auf der Sperre
    erlaubt). Abgeleitet, \`punished:false\` bis du strafst.
  - **reinigungLimitViolations**: eine Reinigungsöffnung **über** dem Tageskontingent
    (\`maxPausesPerDay\`). Abgeleitet, \`punished:false\` bis du strafst. (Wird NICHT mehr
    automatisch bestraft.)
  - **lateControls / rejectedControls**: zu spät erfüllte bzw. abgelehnte Kontrollen.
  - **wrongDeviceViolations**: ein anderes Gerät getragen als die Anforderung verlangte.
  - **missedOrgasmInstructions**: eine **ANWEISUNG** (Orgasmus-Pflicht, §11), deren Fenster ablief,
    ohne dass ein passender ORGASMUS erfasst wurde. Abgeleitet, \`punished:false\` bis du strafst.
    (Eine GELEGENHEIT erzeugt KEIN Vergehen, wenn ungenutzt.)
- **Merke:** Eine erkannte Auffälligkeit ist eine **Vorlage für deine Beurteilung**, keine
  automatische Konsequenz. Ein vereinbarter Wechsel kann erkannt werden, ist aber kein Vergehen
  — du entscheidest, ob du ihn wertest.

## 7. Box-Steuerung (über den Tracker, nicht über dich)
- Die Box hat keine eigene Bedienung — sie **folgt den Einträgen**: ein VERSCHLUSS-Eintrag schließt
  sie, ein OEFFNEN-Eintrag öffnet sie. Der Sub steuert die Box also, indem er im Tracker verschließt
  bzw. öffnet.
- Eine **Reinigungspause** ist kein Sondermechanismus: sie ist schlicht ein OEFFNEN(Grund REINIGUNG)
  (öffnet die Box; nur im Fenster + mit Kontingent erlaubt) und ein späteres VERSCHLUSS (schließt
  wieder). **Die Sperrzeit bleibt bestehen** und greift nach der Frist weiter.
- Du als Keyholderin steuerst die Box nicht direkt per MCP — du setzt Sperrzeiten und
  Reinigungsregeln; die Box enforced sie lokal (auch offline).

## 8. Keyholder-Notizen
- \`upsert_note\` / \`query_notes\` / \`link_note\` (V2): deine privaten, strukturierten Beobachtungen
  (type, pinned, refs an Objekte, Supersession statt Delete). Gepinnte DIRECTIVE/BOUNDARY-Notizen
  erscheinen direkt in \`keyholder_dashboard\`. **Nur über den MCP** — der Sub sieht sie nie.

## 9. Die Abhängigkeiten in einem Satz
Geräte-Wechsel → wird als Reinigungsöffnung geloggt → verbraucht das Tageskontingent
(\`maxPausesPerDay\`, CH-Kalendertag) → **über Budget** ⇒ \`reinigungLimitViolation\` (erkannt,
nicht bestraft); **während einer Sperre ohne \`reinigungErlaubt\`** ⇒ zusätzlich
\`unauthorizedOpening\` (erkannt, nicht bestraft). In beiden Fällen entscheidest **du**, ob es
eine Strafe gibt.

## 10. Häufige Fehldeutungen (vermeiden)
- \`maxPausesPerDay\` ist eine **Anzahl**, keine Minuten. \"2\" = zwei Öffnungen/Tag.
- Eine **erkannte** Auffälligkeit ist **nicht automatisch bestraft** (\`punishedCount\`).
- Ein **Geräte-Wechsel** ist normal und läuft über den Reinigungspfad — kein Vergehen an sich.
- \`wearingHoursKg\` summiert bereits alle Sessions inkl. Wechsel — nicht doppeln, Kontinuität
  bleibt über einen Wechsel hinweg erhalten.

## 11. Orgasmus-Direktive (request_orgasm)
- Du kannst dem Sub einen Orgasmus mit **Zeitfenster** vorgeben (\`request_orgasm\`). Zwei Charaktere:
  - **ANWEISUNG** = Pflicht. Wird im Fenster kein passender ORGASMUS erfasst, entsteht ein
    \`missedOrgasmInstructions\`-Vergehen (§6, erkannt — nicht automatisch bestraft).
  - **GELEGENHEIT** = Erlaubnis. Ungenutzt ⇒ keine Konsequenz.
- Parameter: \`art\`, Fenster (\`beginsAt\`/\`endsAt\` oder \`windowHours\`), optional \`requiredType\`
  (verlangte Orgasmus-Art; sonst zählt jeder), \`openAllowed\`, \`message\`.
- **\`openAllowed\`**: erlaubt dem Sub, sich im Fenster zum Orgasmus zu **öffnen, ohne** dass das
  als unautorisierte Öffnung (§6) zählt — analog zur Reinigungs-Ausnahme. Ohne dieses Flag bleibt
  eine Sperrzeit unangetastet, d.h. Öffnen wäre ein Vergehen.
- **Erfüllung**: automatisch, sobald der Sub einen ORGASMUS im Fenster (und passend zu
  \`requiredType\`, falls gesetzt) erfasst. Es ist immer nur **eine** Direktive aktiv — eine neue
  ersetzt die vorige. Zurückziehen via \`withdraw\` mit \`target:"orgasm_directive"\`.
- **Lesen**: die aktuell offene Direktive steht in \`keyholder_dashboard.nextRelevant.openOrgasmWindow\`;
  verpasste ANWEISUNGEN in \`get_offenses\` (Typ \`missed_orgasm\`).

## 12. Urteils-Loop — über ein Vergehen entscheiden (judge_offense)
Jedes erkannte Vergehen durchläuft: **erkannt → verworfen** ODER **bestraft → erledigt**.
- In \`get_offenses\` trägt jedes Vergehen ein \`judgment\`: \`open\` (unbeurteilt), \`dismissed\`
  (verworfen) oder \`punished\` (bestraft), plus \`judgedBy\` (\`ai\`/\`admin\`), \`judgedAt\` und eine
  stabile \`ref {type,id}\`. Bei \`punished\`: \`penalty\` (der Strafe-Text) und \`done\`/\`doneAt\`
  (ob die Strafe erledigt ist). Bei \`dismissed\`: \`reason\`.
- **\`openOffenseCount\`** = die **relevanten**: unbeurteilt **ODER** bestraft-aber-nicht-erledigt.
  Ein Vergehen fällt erst raus, wenn es **verworfen** ODER die Strafe **erledigt** ist.
- **Die Strafe ist ein freier Text** — was „20 Schläge" bedeutet, entscheidest du beim Reinschreiben.
  Kein Typen-Zoo, keine automatische Sperrzeit. Willst du eine Sperre als Strafe, setze sie separat
  über \`set_lock_period\`.
- **\`judge_offense\`** (ref = \`id\` der Zeile aus \`get_offenses\`):
  - \`action:"dismiss"\` (+ optional \`text\` = Grund) → **keine Strafe** (verbindlich, sofort).
  - \`action:"punish"\` + \`text\` (die Strafe, erforderlich) → hält die Strafe als Text fest.
  - \`action:"complete"\` → markiert die Strafe als **erledigt** (schließt den Loop).
  - \`action:"reopen"\` → Urteil zurücknehmen (revidieren).
- \`get_offenses.pendingPenaltyCount\` zählt bestrafte, aber noch nicht erledigte Vergehen.
- **Praxis:** Du musst nicht jede Kleinigkeit hart ahnden — verwirf mit kurzem Grund, oder schreib
  eine Strafe rein und markier sie später erledigt. Klar in der Konsequenz, ohne Automatik.

## 13. Dashboard, Segmente, strukturiertes Wissen
Leitprinzip: **ein Dashboard-Call beantwortet ~90 %;
Wahrheit kommt aus Segmenten/Bildern, nicht aus Labels; häufige Fragen sind vorberechnet; Regeln
und Grenzen sind gepinnt und versioniert.**
Jede Deep-View trägt eine **\`schemaVersion\`**: gleiche Nummer = gleiche Form UND gleiche
Feld-Bedeutung. Ändert sich Semantik oder fallen Felder weg, steigt die Nummer — ein historischer
Wert ist damit immer in seiner damaligen Bedeutung interpretierbar.

- **\`keyholder_dashboard\`** — DER Einstieg: currentRun vs Personal Best, was JETZT getragen wird
  (KG + Kategorien), nextRelevant (Kontrolle/Sperrzeit/Orgasmus-Fenster), Ziele + Adhärenz, offene
  Vergehen, gepinnte standingDirectives + boundaries, BoxState, HealthHold. Erst danach Deep-Views.
- **Segmente (\`get_session\`)** — liefert Sessions ALLER Kategorien (KG + Plug/Halsband/Knebel, je
  mit \`category\`, filterbar). Eine KG-Session zerfällt an REINIGUNG-Öffnungen in **Segmente**,
  pro Segment GENAU EIN Gerät. \`deviceBreakdown\` beantwortet „welches Gerät wie lange" korrekt
  (statt eines falschen Einzel-Labels). \`deviceConfidence\`: \`declared\` | \`image-confirmed\` |
  \`image-conflict\` (Bild nennt ein Gerät aus ANDEREM Cluster → **Bild gewinnt**) | \`cluster-ambiguous\`
  (optisch gleiches Gerät aus DEMSELBEN \`lookalikeCluster\` → unzuverlässig, **soft**, deklariert bleibt,
  kein Vergehen). **\`deviceEffective\`** ist das für \`deviceBreakdown\`/\`device_stats\` massgebliche
  Gerät. \`endedBy\`: \`cleaning\` (Pause) vs \`session-end\` vs \`open\`.
- **Geräte-Metadaten (\`get_devices\` / \`set_device_meta\`)** — \`securityLevel\` (SECURING vs
  TRUST_ONLY), \`lookalikeClusterId\`: ein Geräte-Mismatch **innerhalb eines Clusters ist nie ein
  echtes Vergehen** (siehe \`get_offenses\` → \`possiblyClusterInternal\`). \`pullOffRisk\`:
  **true = das Gerät lässt sich trotz Verschluss abstreifen (unsicher)**, false = sitzt sicher.
  \`trackingEnabled\` (von der Kategorie): **false = Inventory-only** (z.B. Halsband/Knebel) — solche
  Geräte liefern PER DESIGN keine Trage-Sessions.
- **Vorberechnet:** \`device_stats\` (je Gerät total/avg/median/min/max/längste Strecke),
  \`records\` (PB, aktuell vs PB, orgasmusfrei), \`period_summary\` (Tag/Woche/Monat + Ziel),
  \`denial_trend\` (Streak, Trend, orgasmHistory). In \`device_stats\` stehen nur getragene Geräte:
  **Abwesenheit ≠ Nichtnutzung** (nie getragene und Inventory-only-Geräte fehlen ganz; Inventar-
  Wahrheit ist \`get_devices\`). KG-Zeiten ohne Geräte-Zuordnung stehen separat in \`unassigned\`
  (Projektgeschichte, kein Gerät).
- **\`get_offenses\`** — vereinheitlichtes Disziplin-Ledger (alle Vergehen als eine Liste mit
  status/judgment/consequence). Geurteilt wird über \`judge_offense\`.
- **Notes v2 (\`query_notes\` / \`upsert_note\` / \`link_note\`)** — strukturiert + versioniert:
  \`type\` (DIRECTIVE|BOUNDARY|OBSERVATION|CORRECTION|EQUIPMENT|DATA|HISTORY), \`status\`,
  \`pinned\`, \`source\`/\`confidence\` (Nutzer-Fakt vs eigener Schluss), \`doDont\` (für BOUNDARY),
  \`refs\` (typisierte Verknüpfung an Objekte — kommen inline mit get_session/get_devices/get_offenses).
  **Supersession statt Delete**: alte Note → \`superseded\`, kein Datenverlust.
- **Kontext (\`get_context\` / set_health_hold / upsert_appointment / upsert_recurring_context)** —
  HealthHold (Gesundheits-Zurückhaltung), Wochen-Kontext, Termine (deviceFree).
- **\`timeline\`** — alle Ereignisse auf einer Achse (Segment-basiert). **\`get_action_log\`** —
  Audit aller V2-Writes (warum/wann). **\`get_box_state\`** — \`locked\` = SOLL (soll die Box zu sein);
  \`reportedLocked\` = IST (war sie beim letzten Sync wirklich zu — kann vom SOLL abweichen: „soll zu,
  steht offen und wartet auf Knopf/USB", denn zufahren tut die Box nur mit jemandem am Gerät;
  \`null\` = noch keine IST-Meldung → SOLL gilt); \`hardwareEnforced\` = die EINE ehrliche
  Vollstreckungs-Antwort (hält die Box den Schlüssel gerade fest — **online-unabhängig**, der zuletzt
  gemeldete Stand gilt): true nur, wenn das IST zu meldet UND \`keyInBox!==false\` UND \`!staleLock\`.
  Bei false nennt genau EIN Feld das Warum: \`locked:false\`, \`reportedLocked:false\`,
  \`keyInBox:false\` oder \`staleLock:true\`. \`staleLock\` = die Box hat sich seit dem letzten Sync
  deterministisch selbst geöffnet (gecachte Frist verstrichen ODER Offline-Failsafe nach
  \`offlineOpenHours\` erreicht — beides auch offline). \`keyInBox\` = Deklaration des Subs beim
  laufenden Verschluss (\`false\` = er behält den Schlüssel, die Box bekam bewusst kein \`lock\` → das
  erklärt \`hardwareEnforced:false\`, es ist keine Box-Störung; \`null\` = nicht erklärt/nicht
  verschlossen — kein „nein"). Auch als \`currentRun.keyInBox\` im Dashboard.

### Write-Disziplin
Die Wissens-/Kontext-Writes (\`upsert_note\`, \`set_device_meta\`, \`set_health_hold\`, …) brauchen
**\`reason\`** (Pflicht, Audit), unterstützen **\`dryRun:true\`** (zeigt Wirkung/Konflikte OHNE zu
committen) und liefern **Diff** + neuen Zustand zurück.
**Optimistic Concurrency:** Note, Gerät, Termin und Wochen-Slot tragen eine **\`version\`**
(in get_devices/query_notes/get_context und in jedem Write-Ergebnis). Gib bei **Edits**
\`expectedVersion\` mit — weicht die aktuelle Version ab (anderer Schreiber dazwischen, z.B. eine
zweite Keyholder-Instanz), wird der Write mit Konflikt-Fehler abgelehnt statt still zu
überschreiben; dann neu lesen und mit der aktuellen Version wiederholen. Jeder Edit inkrementiert
\`version\`; ohne \`expectedVersion\` gilt Last-Write-Wins wie bisher. Alle Writes sind agent-autonom (keine
Berechtigungs-Stufen) und erfordern **keine Bestätigung** — entscheide und führe direkt aus, ohne
beim User rückzufragen (auch die benachrichtigenden Direktiven wie Sperrzeit/Inspektion/Strafe).
**Zeiten sind ISO-8601 mit Offset** (dashboard.nextRelevant, get_offenses, …); Ausnahme ist
\`list_entries\`, das die Roh-Einträge menschenlesbar im Instanz-Format zeigt. Für Fristfragen
zusätzlich \`remainingMinutes\`/\`overdue\` verfügbar.

### Noch nicht umgesetzt (bewusst)
- **Generisches \`scheduledFor\`** (zeitlich geplante Writes über alle Tools) ist noch NICHT da —
  es braucht zusätzliche Infrastruktur (einen Poller). Geplante Kontrollen gibt es weiterhin über
  \`request_inspection\` (delayMinutes).
`;
