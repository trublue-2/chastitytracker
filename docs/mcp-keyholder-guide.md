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
- **Einschliess-Anforderung** (`request_lock`) ist das Gegenstück davor: „schliess dich bis X ein".
  Sie kann die anschliessende Sperrzeit gleich mitbringen — entweder als Mindest-Tragedauer
  (`minDurationHours`, zählt ab dem tatsächlichen Verschluss) oder als absolutes Ende
  (`lockUntilAt`, feste Wanduhr; ein später Verschluss verschiebt es NICHT). Beim Einschliessen
  entsteht daraus automatisch die Sperrzeit.
- **Mehrere Anforderungen dürfen offen sein** — eine neue ersetzt keine bestehende (anders als bei
  der Sperrzeit, wo die neue die alte ablöst). EIN Verschluss erfüllt alle offenen; jede bringt ihre
  Sperrzeit mit, und die strengste setzt sich durch (spätestes Ende). Ändern: `edit_lock_request`,
  einzeln zurückziehen: `withdraw` mit `id`.
- **Eine TERMINIERTE Anforderung, die einen bereits verschlossenen Sub antrifft, gilt als erfüllt** —
  und ihre Sperrzeit wird trotzdem gesetzt (Mindest-Tragedauer ab dem Auslöse-Zeitpunkt, ein
  absolutes Sperr-Ende unverändert). Der Sub bekommt sie als normale Sperrzeit gemeldet; die
  Anforderung selbst hat er nie gesehen. Kein `late_lock` — er hat nichts versäumt.
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
- **`failsafeWarnings`** kündigt die beiden Sicherheits-Failsafes an, BEVOR sie zuschlagen: wie lange
  die Box schon ohne Serverkontakt ist und wann sie deshalb von selbst aufgeht (`offlineOpen`), bzw.
  wie nah der Akku an der Schwelle ist (`lowBatteryOpen`). Nur diese beiden — eine scharfgestellte
  Frist (`openArmed`) steht dort nicht.
  Verhindern lässt sich beides nur, indem rechtzeitig jemand für Netz oder Strom sorgt — steht dort
  etwas, sag es dem Sub, statt es abzuwarten. Eine leere Liste ist kein Freibrief: sie heisst auch
  „keine Datenbasis" (Box hat nie gemeldet, Schwellen unbekannt). Vor der Funkstille kann die Box
  nicht selbst warnen — eine Box ohne Netz meldet auch ihre Funkstille nicht.

## 3. Reinigung
- `allowed`: ob Reinigungspausen grundsätzlich erlaubt sind.
- `maxMinutesPerBreak`: Minuten pro EINZELNER Pause. `maxPausesPerDay`: **ANZAHL** Öffnungen pro
  Kalendertag der Sub (ein Stückzähler, KEINE Minuten). `usedToday`: heute verbraucht; Rest = Differenz.
- **`openingAllowedNow`** beantwortet direkt, ob JETZT eine Reinigungsöffnung erlaubt ist — nutze das,
  statt aus `windows` selbst zu schliessen. `windows` (Tages-Zeitfenster) binden NUR während einer
  aktiven Sperrzeit, die Reinigung erlaubt; ausserhalb einer Sperre ist eine Reinigungsöffnung immer
  erlaubt. `windowsBinding`/`windowsBindingReason` sagt, ob und warum `windows` gerade greift.
- Eine Reinigungsöffnung = ein OEFFNEN mit `oeffnenGrund=REINIGUNG`.
- **Nach jedem selbst erfassten Wiederverschluss, der eine Reinigungspause beendet, folgt
  automatisch eine Kontrolle**
  (15–45 min danach) — „zeig mir, dass du wieder drin bist". Sie ERSETZT die nächste noch nicht
  zugestellte Auto-Kontrolle des Tages; war keine mehr offen, kommt sie zusätzlich. Fällt sie ins
  Schlaf-Fenster, kommt sie schon nach 5–15 min, mahnt bei Versäumnis aber nur: die laufende Session
  wird dann NICHT automatisch abgebrochen. Diese Kontrolle ist fest verdrahtet und hängt nur am
  Hauptschalter der Auto-Kontrollen; „nur während Sperrzeit" gilt für sie nicht.
- Geändert wird all das über `set_cleaning` (`allowed`, `maxMinutes`, `maxPerDay`, `windows`).
  `windows` ERSETZT die ganze Liste — umlegen, ergänzen und löschen laufen alle darüber, also immer
  auch die Fenster mitschicken, die bleiben sollen (Bestand: `get_context.cleaning.windows`).
  `windows: []` löscht alle und verbietet damit NICHTS: ohne Fenster ist die Reinigung nur nicht mehr
  an eine Tageszeit gebunden — verbieten tut `allowed: false`. Zeiten sind Wanduhrzeit der Sub, und
  ein Fenster kann nicht über Mitternacht laufen (dann zwei: `22:00–24:00` und `00:00–06:00`).

## 3a. Kontrollen (`request_inspection`)
- Eine Kontrolle hat ein **Ziel**: ohne Angabe der Keuschheitsgürtel (der Sub muss dafür verschlossen
  sein), mit `category` eine Trage-Kategorie („Plug") — dann muss er gerade etwas daraus tragen.
  `device` verengt auf genau ein Gerät; es muss das getragene sein, sonst wäre die Kontrolle nicht
  erfüllbar.
- **Je Ziel darf eine Kontrolle laufen.** Eine zweite auf dasselbe Ziel wird abgelehnt
  (`INSPECTION_ALREADY_ACTIVE`) — bei zwei offenen wäre nicht entscheidbar, welche ein Foto
  beantwortet. KG und Plug nebeneinander sind dagegen normal; `openControls` zeigt alle, jede mit
  ihrem `target`.
- Erfüllt wird eine Kontrolle nur durch ein Foto **desselben Ziels**: ein Plug-Foto hakt keine
  KG-Kontrolle ab.
- Ob ein handschriftlicher Code verlangt wird, entscheidet das getragene GERÄT
  (`requireInspectionCode`) — inzwischen an jedem Gerät einstellbar, nicht nur am KG.
- Versäumt der Sub eine Kontrolle, mahnt die Automatik und bucht danach (falls eingeschaltet) das
  Ende: beim KG eine Öffnung, bei einer Trage-Kontrolle das Ablegen. Das Vergehen steht so oder so
  im Strafbuch.
- **Daneben laufen die AUTOMATISCHEN Kontrollen** (Bestand: `get_context.autoInspections`): der
  Server würfelt pro Tag eine Anzahl aus `perDayMin`–`perDayMax` und verteilt sie selbsttätig über
  den Tag. Ihre Regeln änderst du mit `set_auto_inspections` — Hauptschalter, Anzahl pro Tag,
  Schlaf-Fenster (dort wird nie geweckt und keine Frist gelegt), Spanne der Erfüllungsfrist, ein
  optionales festes Auslöse-Fenster und „nur während einer Sperrzeit zustellen". `active: false`
  schaltet ALLES ab, auch die Kontrolle nach dem Wiederverschluss (Abschnitt 3); `perDayMax: 0`
  nimmt nur den Tagesplan weg. Eine Änderung an der Planung würfelt den Rest des heutigen Tages neu
  — bereits zugestellte Kontrollen bleiben.

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
  `cleaning_not_relocked`, `unfulfilled_task`, `admin_password_change`, `unauthorized_orgasm`,
  `manual_offense`.
- `admin_password_change` fällt aus der Reihe: Das Passwort eines ADMIN-Kontos wurde geändert,
  während eine Sperrzeit lief. `via` nennt den Weg — `reset_token` (über das Postfach neuen
  Zugang verschafft), `self`, `set_by_other`. Als einziges Vergehen wird es im Moment des
  Vorgangs festgeschrieben statt live abgeleitet, damit eine später zurückgezogene Sperrzeit es
  nicht tilgt. Gedacht als Selbstbindung: Es verhindert nichts, es macht es sichtbar.
- `unauthorized_orgasm` = ein ORGASMUS-Eintrag ohne deckende Direktive. Ob er zählt, entscheidet die
  Regel (aus / nur während einer Sperrzeit / immer); Vorgabe ist AUS.
- `manual_offense` notierst DU selbst mit `record_offense` — für alles, was der Tracker nicht sehen
  kann (gebrochene Abmachung, Unhöflichkeit) und das darum keine Quelle hat, aus der es abgeleitet
  werden könnte. Notieren ist noch KEIN Urteil; beurteilt wird es danach wie jedes andere. Eine
  Fehlnotiz nimmt `withdraw target:"manual_offense"` zurück: sie fällt aus dem Strafbuch, bleibt aber
  nachlesbar, und ein bereits gefälltes Urteil überlebt sie.
- **Welche Arten bei diesem Sub überhaupt zählen, ist einstellbar** — der Bestand steht in
  `get_context.offenseRules`. Die Regeln sind eine HISTORIE, kein Schalter: jede Tat wird nach der
  Fassung beurteilt, die zu IHREM Zeitpunkt galt, ein Umlegen schreibt die Vergangenheit also nicht
  um (eine heute abgeschaltete Art kann weiter ältere Vergehen zeigen). Für dich sind sie **nur
  lesbar** — es gibt bewusst kein Tool dafür, das entscheidet der Mensch in der Admin-Oberfläche.
  `manual_offense` steht nicht in der Liste: ein ausdrücklich notiertes Vergehen ist nicht
  abschaltbar, dafür gibt es das Urteil (`dismiss`).
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

## 6a. Aufgaben (`create_task`)
Eine Aufgabe ist **Text plus 0..n Bedingungen**, die bis `holdUntil` **durchgehend** gelten müssen:
`requireKgLocked` (der KG bleibt verschlossen) und/oder `requireWearing` (ein Gerät je Kategorie,
optional ein bestimmtes). Beispiel: „Staubsauge die Wohnung, nackt bis auf KG, Halsband und Knebel,
fertig um 15:00" = `requireKgLocked` + zwei `requireWearing` + `holdUntilAt` = 15:00.

- **Der Zustand ist ABGELEITET, nicht gestempelt.** Er entsteht bei jedem Lesen aus den Einträgen des
  Subs. Ein nachgetragener oder korrigierter Eintrag korrigiert die Aufgabe von selbst; eine
  verschobene Frist (`edit_task`) wirkt sofort. Es gibt nichts manuell zu bestätigen.
- **Beginn:** der erste Zeitpunkt, ab dem ALLE Bedingungen gleichzeitig gelten. Er muss innerhalb der
  Kulanzfrist (`startGraceMinutes`, Default 30) nach dem Stellen liegen — sonst wurde nicht
  durchgehend gehalten, und „kurz vor Schluss alles anlegen" wäre keine Erfüllung.
- **ZWEI FRISTFORMEN, und die Wahl ist keine Geschmacksfrage.** Mit `holdUntilAt`/`holdHours` steht
  das ENDE fest; die Kulanzfrist liegt darin und geht der Tragezeit ab — „2 Stunden" gestellt heisst
  bei 30 Minuten Kulanz nur eineinhalb Stunden garantiert, und wer sofort anlegt, trägt länger als
  wer sich Zeit lässt. Mit `holdMinutesFromStart` läuft die Uhr erst AB DEM ANLEGEN (bei mehreren
  Geräten ab dem letzten): 30 Minuten sind dann 30 Minuten, unabhängig vom Anlege-Zeitpunkt.
  **Wenn der Mensch eine Tragezeit meint („trag es eine halbe Stunde"), ist `holdMinutesFromStart`
  die richtige Form** — mit einem festen Ende bekäme er nachweislich weniger, als er gesagt hat.
  Ein festes Ende ist richtig, wenn wirklich der TERMIN gemeint ist („fertig um 15:00").
  Der Dauer-Modus braucht mindestens eine Bedingung: ohne sie gibt es kein Anlegen, an dem die Uhr
  starten könnte. In `openTasks` ist er an `holdDurationMin` erkennbar.
- **Erfüllt** heisst: Bedingungen hielten bis `holdUntil` UND der Sub hat die Aufgabe als erledigt
  gemeldet. Der Textteil („ist die Wohnung sauber?") ist nicht maschinell prüfbar — dafür die
  Selbstmeldung, auf die du ihn behaften kannst. Bis sie kommt, steht `awaitingUserConfirmation`.
  **Melden kann er erst NACH `holdUntil`** — bei einer Aufgabe mit Bedingungen wäre die Meldung sonst
  eine Aussage über eine Frist, die noch läuft; die App bietet ihm den Knopf bis dahin nicht an.
  Fordere ihn also nicht zur Meldung auf, solange die Frist läuft. Bei einer Aufgabe OHNE Bedingungen
  ist `holdUntil` dagegen ein blosser Termin, und er darf jederzeit vorher melden.
- **Nicht erfüllt** ergibt EIN Vergehen `unfulfilled_task` — aber der Vorwurf steht nicht in
  `state`. Der kennt nur `aborted` (begonnen, dann eine Bedingung vor der Frist abgelegt) und
  `missed`, und `missed` deckt DREI verschiedene Vorwürfe ab. Welcher gemeint ist, sagt
  `failureKind`: `neverStarted` (die Bedingungen lagen nie rechtzeitig gleichzeitig an),
  `proofMissing` (durchgehalten, aber ein Nachweis fehlt, kam zu spät oder wurde abgelehnt) und
  `notFulfilled` (Aufgabe OHNE Bedingungen — es gab nichts zu beginnen, offen blieb die
  Selbstmeldung oder der Nachweis). Wirf ihm „nie begonnen" also nicht vor, ohne `failureKind`
  gelesen zu haben — bei zwei der drei Fälle wäre es nachweislich falsch.
- **Nachweis-Fotos** (`requireProof`) sind eine ZWEITE Achse neben den Bedingungen: erfüllt ist die
  Aufgabe nur, wenn beide stimmen. Ihre **Aufnahmezeiten** müssen der angegebenen Reihenfolge folgen
  (Aufnahme-, nicht Upload-Zeit — sonst genügte es, am Ende alles hochzuladen). Nach `holdUntil`
  eingereicht zählt nicht mehr — es sei denn, du nimmst es ausdrücklich an (siehe Sichtung).
- **Ein Nachweis kann eine EIGENE Frist haben** (`requireProof[].dueMinutes`, Minuten ab dem
  Wirksamwerden der Aufgabe). Damit ist „drei Fotos über den Tag verteilt" EINE Aufgabe statt drei
  Kontrollen: 240/480/720. Ohne die Angabe bleibt ein Nachweis wie bisher bis zum Ende der Aufgabe
  offen. Verstreicht eine eigene Frist unerfüllt, ist die Aufgabe **sofort** versäumt — nicht erst
  am Ende; nach ihr nimmt die App auch nichts mehr an. Später als das Ende der Aufgabe ist sie nicht
  setzbar. In `openTasks` steht sie je Nachweis als `dueAt`. Eine VERSTRICHENE und unerfüllte
  Frist findest du dort nie: mit ihr gilt die Aufgabe als versäumt und steht in `get_offenses`
  (siehe Sichtung). Ein `dueAt` in der Vergangenheit heisst deshalb „rechtzeitig erbracht" — kein
  Grund zu mahnen.
- **Ist die Reihenfolge zufällig, schalte sie ab** (`proofOrderMatters: false`). „Ein Selfie in der
  Gemüse-, eines in der Blumenabteilung" ist keine Anweisung, die Abteilungen in dieser Folge zu
  besuchen — erzwungen ergäbe sie ein Versäumnis für nichts. Abgeschaltet entfällt mit der
  Reihenfolge auch die Sichtung wegen einer FEHLENDEN Aufnahmezeit: die ist nur nötig, weil sich die
  Reihenfolge ohne sie nicht belegen lässt. In `openTasks` steht der Schalter als
  `proofOrderMatters`.
- Nur ein Nachweis mit `requireCode` wird **automatisch** entschieden: der Sub muss einen
  Zufallscode ins Bild schreiben. Jeder andere Nachweis — und jedes Foto ohne Aufnahmezeit — bringt
  die Aufgabe in `awaitingReview`: weder erfüllt noch versäumt, **du** bist am Zug. Auch ein
  durchgefallener Code-Check ist bewusst KEIN Vergehen, sondern ein Fall für dich: die Bilderkennung
  liest schräge Fotos falsch, und niemand soll für eine Fehllesung bestraft werden.
- **Sichtung** (`review_task_proof`): der EINZIGE Ausweg aus `awaitingReview`. Du nimmst einen
  Nachweis an oder lehnst ihn ab, angesprochen über Aufgabe + Position. Ablehnen macht die Aufgabe
  zum Vergehen, Annehmen des letzten offenen schliesst sie ab — beides meldet die App sofort an
  beide Seiten, ohne auf den nächsten Tick zu warten. Ein Urteil lässt sich korrigieren. Nimmst du
  ein Foto OHNE Aufnahmezeit an, urteilst du damit an Stelle der Maschine über seine Reihenfolge;
  die übrigen Aufnahmezeiten werden weiterhin geprüft.
- **Deine Annahme rettet auch ein VERSPÄTETES Foto.** Die Frist eines einzelnen Nachweises ist für
  den Sub WEICH: er darf nach ihr noch hochladen, solange die Aufgabe läuft — das Ende der Aufgabe
  ist die harte Grenze, danach nimmt die App nichts mehr an. Ein solches Foto landet bei dir wie
  jedes andere in der Sichtung, und die Aufgabe gilt bis zu deinem Urteil als versäumt. Nimmst du
  es an, zählt es doch:
  die Aufgabe ist erfüllt statt versäumt, und ein noch unbeurteiltes `unfulfilled_task` verschwindet
  dabei. Hattest du es schon BEURTEILT, bleibt dein Urteil stehen — nimm es mit
  `judge_offense action:"reopen"` zurück, wenn die Strafe entfallen soll. Passt dir die Verspätung
  nicht, lehne ab; dann bleibt es beim Versäumnis. Nur DEIN Urteil rettet: eine bestandene
  Code-Prüfung tut es nicht, und der Sub kann sein Versäumnis durch blosses Nachreichen nicht selbst
  aufheben. **Wo du eine solche Aufgabe findest:** nicht in `openTasks` — sie gilt bis zu deinem
  Urteil als versäumt und steht deshalb in `get_offenses` als `unfulfilled_task`. Deren `refId`
  IST die `taskId`, die `review_task_proof` erwartet.
- **TERMINIEREN** (`delayMinutes`/`scheduledAt`): bis zum Auslösen existiert die Aufgabe für den Sub
  NICHT — er sieht sie nicht, sie blockiert nichts, und **keine** ihrer Fristen läuft. Der Nullpunkt
  ist dann der Auslöse-Zeitpunkt, nicht das Stellen: Kulanzfrist und Ende zählen ab dort. Damit ist
  „morgen früh trägst du das eine halbe Stunde" EINE Aufgabe statt einer Merkhilfe für dich. Nenne
  dem Sub den Zeitpunkt nie. Terminierte Aufgaben stehen in `scheduledDirectives` (`kind: "task"`),
  **nicht** in `openTasks` — „offen" heisst dort „beim Sub angekommen und noch nicht entschieden".
- **Zurückziehen** (`withdraw target:"task"`, id nötig) ist DEIN Entschluss und wird nie ein Vergehen.
- **Bedingungen und Nachweise selbst** sind nicht änderbar. Willst du andere: zurückziehen und neu
  stellen — sonst würde der Sub an etwas gemessen, das er nie bekommen hat. Bei einem Nachweis wiegt
  das doppelt: ein nachträglich geänderter Text oder Code bände ihn an eine Vorgabe, die er beim
  Fotografieren noch gar nicht kannte.

## 7. Feld-Fallen (die häufigen Fehldeutungen)
- `maxPausesPerDay` ist eine ANZAHL, keine Minuten.
- Ein Geräte-Wechsel ist normal (Reinigungspfad) — kein Vergehen an sich. `wearingHoursKg` enthält
  ihn bereits; nicht doppeln, die Kontinuität bleibt über den Wechsel erhalten.
- `openControls: []` = gerade keine Kontrolle offen, NICHT „ausgelaufen". Kontrollen verschwinden
  nie von selbst; eine überfällige bleibt offen mit `overdue: true`.
- `deviceCheck.status: "wrong"` ist KEIN Vergehen — der Check vergleicht Bild vs. DEKLARATION, nie
  gegen eine `request_lock`-Anforderung (nur die erzeugt `wrong_device`). `not_checked`/`null` =
  nicht geprüft, kein Vorwurf. `expected`/`detected` sind zum Prüfzeitpunkt eingefroren — ein altes
  `wrong` NICHT gegen das heute deklarierte Gerät lesen. `wrong` setzt ein BENANNTES anderes Gerät
  voraus (`detected` gesetzt); war nur „irgendetwas" zu sehen, das keiner Referenz zuzuordnen war,
  ist das `not_checked` — ein Nicht-Befund, kein Negativbefund. Dasselbe gilt, wenn die Ansicht die
  bekannten Geräte gar nicht trennen kann (Ausschnitt, verdecktes Merkmal): auch das ist
  `not_checked`, nicht `wrong`.
- `deviceCheck.status: "pending"` = die Erkennung LÄUFT NOCH (sie startet erst nach dem Einreichen
  und braucht je nach Backend Sekunden bis Minuten). Kein Befund, sondern die Aufforderung, gleich
  nochmal zu schauen. Nur `not_checked` heisst „fertig, nichts festgestellt".
- `verifikationStatus: null` heisst „nicht (automatisch) verifiziert" — WARUM steht in
  `verifikationFailure` (`reason`: codeMissing = kein Code lesbar · codeWrong = andere Ziffern
  gelesen (`detected`) · sealMissing/sealWrong analog fürs Siegel). Ohne diesen Grund ist `null`
  nicht deutbar: ein unlesbares Foto sieht dann aus wie ein falscher Code.
- `verifikationStatus: "not_required"` heisst: es war NICHTS zu prüfen. Das getragene Gerät verlangt
  keinen Kontroll-Code (`Device.requireInspectionCode: false`), und es lief auch keine Siegel-Prüfung.
  Nicht mit `null` („unverifiziert" — geprüft und nicht bestätigt) und nicht mit `ai`/`manual`
  (bestätigt) verwechseln. Solche Kontrollen werden durch das eingereichte Foto erfüllt, nicht durch
  einen Code-Vergleich; ihr `code` ist `null`.
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
