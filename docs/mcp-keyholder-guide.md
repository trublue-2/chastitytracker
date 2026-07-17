# Tracker-Modell — Referenz für den MCP-Keyholder

> Spiegel von `src/lib/mcpModelDoc.ts` (Single Source). Das MCP-Tool `explain_model` gibt
> denselben Text zurück. Bei Änderungen beide synchron halten.

Kurzreferenz, wie die Begriffe zusammenhängen, die du über den MCP siehst. Lies einen Abschnitt, wenn
ein Feld oder eine Regel unklar ist. Kein Code-Zugriff nötig.

## 0. Deine Rolle: du wertest, der Server zählt
Die API liefert **Zahlen und Zustände, keine Urteile.** Ob ein Trainingsstand gut, knapp oder
enttäuschend ist, entscheidest DU im Kontext — dieselben Zahlen dürfen je nach Situation zu
verschiedenen Aussagen führen. Vorgerechnete Indikatoren (`todayPct`/`weekPct`, `trendRising`,
`*VsPbPct`) sind **Eingaben für dein Urteil, kein Verdikt** — nimm sie als Hinweis, nicht als Befund.
Deine Notizen und Urteile sieht der Sub nie. Alle Writes sind agent-autonom: entscheide und führe
direkt aus, ohne Rückfrage oder Bestätigung.

## 1. Zwei Systeme, eine Wahrheit
- **KG**: eine Session ist ein Paar VERSCHLUSS (zu) → OEFFNEN (auf). `wearingHoursKg`
  (heute/Woche/Monat) ist die Summe dieser Zeiten — Gerätewechsel bereits eingerechnet.
- **WEAR** (Plug, Halsband, Knebel …): eigene Paare WEAR_BEGIN → WEAR_END, nicht KG.
- **Segmente**: eine KG-Session zerfällt an REINIGUNG-Öffnungen in Segmente, pro Segment GENAU EIN
  Gerät. Ein Gerätewechsel **bricht die Session nicht** — die Tragezeit läuft als Ganzes weiter.
- **Wahrheit kommt aus Segmenten/Bildern, nicht aus Labels.** Das massgebliche Gerät ist
  `deviceEffective`: bei einem Bild-gegen-Deklaration-Konflikt **gewinnt das Bild**, nicht der Freitext.

## 2. Sperrzeit & Box
- **Sperrzeit** = eine von dir angeordnete Sperrperiode (`endetAt` oder unbefristet). Währenddessen
  darf der Sub NICHT selbst öffnen.
- **`reinigungErlaubt` auf der Sperrzeit** ist der Schalter: nur wenn gesetzt, ist ein Öffnen zur
  Reinigung (oder ein Gerätewechsel) während DIESER Sperre rechtmässig.
- **Box** = die physische Schlüssel-Lockbox hinter einer Sperre. **Während einer Sperrzeit hält die
  Box den Schlüssel fest** — eine Sperre ist nicht bloss ein Tracker-Eintrag, sondern ein echter
  physischer Zugriffsschutz. Du bedienst die Box nicht — sie folgt den Einträgen des Subs. Für dich
  zählt eine Frage: **`hardwareEnforced: true` = gerade real verschlossen** (online-unabhängig, der
  zuletzt gemeldete Stand gilt); bei `false` nennt `hardwareEnforcedReason` genau EINEN Grund (z.B.
  der Sub hat den Schlüssel behalten). `keySecured` fasst „Käfig zu UND Schlüssel drin UND aktuell"
  in einem Feld zusammen. Ein absolutes Hard-Cap und Sicherheits-Failsafes (leerer Akku, offline)
  öffnen im Notfall immer — auch gegen dich.

## 3. Reinigung
- `allowed`: ob Reinigungspausen grundsätzlich erlaubt sind.
- `maxMinutesPerBreak`: Minuten pro EINZELNER Pause. `maxPausesPerDay`: **ANZAHL** Öffnungen pro
  CH-Kalendertag (ein Stückzähler, KEINE Minuten). `usedToday`: heute verbraucht; Rest = Differenz.
- **`openingAllowedNow`** beantwortet direkt, ob JETZT eine Reinigungsöffnung erlaubt ist — nutze das,
  statt aus `windows` selbst zu schliessen. `windows` (Tages-Zeitfenster) binden NUR während einer
  aktiven Sperrzeit, die Reinigung erlaubt; ausserhalb einer Sperre ist eine Reinigungsöffnung immer
  erlaubt. `windowsBinding`/`windowsBindingReason` sagt, ob und warum `windows` gerade greift.
- Eine Reinigungsöffnung = ein OEFFNEN mit `oeffnenGrund=REINIGUNG`.

## 4. Geräte-Wechsel
Es gibt keinen eigenen Wechsel-Vorgang: ein Wechsel läuft über eine **Reinigungsöffnung**. Folgen: er
verbraucht das Tages-Reinigungskontingent, und während einer Sperre ist er nur rechtmässig, wenn die
Sperre `reinigungErlaubt` hat. Freie Wechsel erlauben ⇒ `reinigungErlaubt` setzen UND
`maxPausesPerDay` hoch genug halten.

## 5. Vergehen: ERKANNT ≠ BESTRAFT
- `detectedOffenseCount` zählt vom System **erkannte** Auffälligkeiten (meist live abgeleitet) — das
  sind KEINE Strafen. `punished` ist nur gesetzt, wenn DU bestraft hast. Eine Erkennung ist eine
  **Vorlage für dein Urteil, keine automatische Konsequenz.**
- Kanonische Typen (`get_offenses`): `unauthorized_opening`, `cleaning_limit`, `late_control`,
  `rejected_control`, `auto_removed_control`, `wrong_device`, `missed_orgasm`, `late_lock`,
  `cleaning_not_relocked`.
- **Urteilen** via `judge_offense` (ref = `id` aus `get_offenses`): `dismiss` (verwerfen),
  `punish` + `text` (die Strafe als **freier Text** — kein Typen-Zoo, keine automatische Sperre),
  `complete` (Strafe erledigt), `reopen` (revidieren). `openOffenseCount` = unbeurteilt ODER
  bestraft-aber-nicht-erledigt. Willst du eine Sperre als Strafe, setze sie separat über
  `set_lock_period`.

## 6. Orgasmus-Direktive (`request_orgasm`)
Ein Orgasmus-Fenster mit zwei Charakteren: **ANWEISUNG** = Pflicht (ungenutzt ⇒ `missed_orgasm`,
erkannt, nicht automatisch bestraft); **GELEGENHEIT** = Erlaubnis (ungenutzt ⇒ keine Folge).
`openAllowed` erlaubt dem Sub, sich im Fenster zu öffnen, ohne dass das als unautorisierte Öffnung
zählt. Es ist immer nur EINE Direktive aktiv; Erfüllung automatisch bei passendem ORGASMUS im Fenster.

## 7. Feld-Fallen (die häufigen Fehldeutungen)
- `maxPausesPerDay` ist eine ANZAHL, keine Minuten.
- Ein Geräte-Wechsel ist normal (Reinigungspfad) — kein Vergehen an sich. `wearingHoursKg` enthält
  ihn bereits; nicht doppeln, die Kontinuität bleibt über den Wechsel erhalten.
- `openControl: null` = gerade keine Kontrolle offen, NICHT „ausgelaufen". Kontrollen verschwinden
  nie von selbst; eine überfällige bleibt offen mit `overdue: true`.
- `deviceCheck.status: "wrong"` ist KEIN Vergehen — der Check vergleicht Bild vs. DEKLARATION, nie
  gegen eine `request_lock`-Anforderung (nur die erzeugt `wrong_device`). `not_checked`/`null` =
  nicht geprüft, kein Vorwurf. `expected`/`detected` sind zum Prüfzeitpunkt eingefroren — ein altes
  `wrong` NICHT gegen das heute deklarierte Gerät lesen.
- `windowOpenNow: null` = kein Fenster offen, NICHT „Öffnen verboten" (die Antwort ist `openingAllowedNow`).
- `pullOffRisk`: `true` = abstreifbar/unsicher, `false` = geprüft sicher, `null` = nie beurteilt.
- `securityLevel` (SECURING/TRUST_ONLY) ist v.a. für sichernde Geräte (KG, Halsreif) sinnvoll; `null`
  ist keine Datenlücke. `trackingEnabled: false` = Inventory-only, liefert per Design keine Sessions —
  Abwesenheit in `device_stats` ist keine Nichtnutzung.
- Ehrliche Dauertrage-Marke = `longestUnbrokenSegmentHours` (längstes EINZELNES ununterbrochenes
  Segment, ein Gerät). `longestRunHours`/`maxHours` sind Session-Bruttosummen über Pausen/Wechsel
  hinweg — arithmetisch höher, aber keine echte Strecke.
- `lookalikeClusterId` ist kein lokales Feld: ein Mismatch INNERHALB eines Clusters ist nie ein
  echtes Vergehen (soft), und ein Setzen rechnet die Geräte-Zuordnung JEDER historischen Session mit
  Bild-Konflikt rückwirkend neu — vorher den `dryRun`-`diff` prüfen.

## 8. Lesen & Schreiben — der Vertrag
- **Lesen**: `keyholder_dashboard` beantwortet ~90 % (currentRun vs Personal Best, was JETZT getragen
  wird, nextRelevant, Ziele/Adhärenz, offene Vergehen, gepinnte Direktiven/Grenzen, BoxState,
  HealthHold). Danach gezielt Deep-Views: `get_session` (Segmente + `deviceBreakdown`),
  `device_stats`, `records`, `period_summary`, `denial_trend`, `get_offenses`, `get_devices`,
  `get_context`, `query_notes`, `get_action_log`, `get_box_state`, `timeline`, `list_entries`
  (Roh-Einträge). Jede Deep-View trägt eine `schemaVersion` — gleiche Nummer = gleiche Feld-Bedeutung.
- **Schreiben**: jeder Write braucht **`reason`** (Audit → `get_action_log`) und kennt
  **`dryRun:true`** (Wirkung/Konflikte vor dem Commit). Ein Edit liefert einen **`diff`** `[alt, neu]`
  plus den projizierten Nachher-Zustand. Bei einigen direktiven Tools ist `dryRun` ein
  Vorab-Plausibilitätscheck, keine volle Simulation. Edits auf versionierten Objekten (Note, Gerät,
  Termin, Wochen-Slot) nehmen **`expectedVersion`** (Optimistic Concurrency: weicht die aktuelle
  Version ab, wird der Write abgelehnt statt still zu überschreiben — dann neu lesen und wiederholen).
- **Notizen** (`upsert_note`/`query_notes`/`link_note`) sind deine privaten, versionierten
  Beobachtungen. Supersession statt Delete: eine abgelöste Note wird `superseded`, die aktuelle trägt
  `isLatest: true`. Gepinnte DIRECTIVE/BOUNDARY erscheinen im Dashboard. Auch Trainingsziele werden
  soft-gelöscht (`delete_training_goal` setzt `deletedAt`; `list_training_goals(includeDeleted:true)`
  zeigt die volle Historie).
- **Zeiten** sind ISO-8601 mit Offset. Ausnahme: `list_entries` zeigt die Roh-Einträge menschenlesbar
  im Instanz-Format.
