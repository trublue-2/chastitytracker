import { prisma } from "@/lib/prisma";
import { getOpenKontrollen, getActiveSperrzeit, getActiveWearSessions, getActiveOrgasmusAnforderung, getInterruptedSperrzeit, getCurrentLockKeyInBox, getOpenLockRequests } from "@/lib/queries";
import {
  buildLockState, mapOpenKontrolle, mapActiveSperrzeit, mapOpenOrgasmusAnforderung,
  mapActiveWearSessions, mapInterruptedSperrzeit, mapOpenLockRequest,
  type Fmt, type OpenKontrolleView, type ActiveSperrzeitView, type OpenOrgasmusAnforderungView,
  type InterruptedSperrzeitView, type OpenLockRequestView,
} from "@/lib/mcp/liveState";
import { makeIso, makeFmt, buildEnvelope, resolveUserContext, loadTrackingContext, type Envelope, type Iso, type NoteDTO, type TrackingEntry } from "@/lib/mcp/common";
import { buildPairs } from "@/lib/utils";
import { buildSessions, isLiveOpenSession, type Session, type DeviceConfidence } from "@/lib/sessionModel";
import { records, periodSummary, type PeriodSummaryResult } from "@/lib/mcp/stats";
import { getOffenses, type OffenseRow } from "@/lib/mcp/ledger";
import { queryNotes } from "@/lib/mcp/notes";
import { loadActiveHealthHold, type HealthHoldView } from "@/lib/mcp/context";
import { toPendingCommand, boxFailsafeWarnings, boxIsPhysicallyLocked, type BoxFailsafeWarning } from "@/lib/boxStatus";
import { getEvaluatedTasks, loadTaskProofViews, type EvaluatedTask, type TaskProofView } from "@/lib/taskIntervals";
import { isTaskOpen, needsKeyholderReview, firstOutOfOrderProof, ownProofDeadline, type TaskLike } from "@/lib/tasks";
import { taskProofState } from "@/lib/taskView";
import { hiddenFromSubWhere } from "@/lib/delayedTrigger";

/** keyholder_dashboard (explain_model §13) — EIN Call, der 90 % der Keyholder-Fragen beantwortet: aktueller
 *  Lauf vs. Personal Best, was JETZT getragen wird (alle Kategorien), das Nächst-Relevante, Ziele +
 *  Adhärenz, offene Vergehen, gepinnte Direktiven + Grenzen, BoxState. Komponiert die V2/V1-
 *  Aggregate — rein lesend, MCP-only. */

/** Der EINE Grund für hardwareEnforced:false, in fester Rangfolge (A-07). */
export type HardwareEnforcedReason = "soll-open" | "reported-open" | "key-not-in-box" | "open-armed" | "stale-lock";

/** Eine Failsafe-Vorwarnung, wie sie im BoxState steht: die geteilte Ableitung (`boxFailsafeWarnings`)
 *  plus `dueAt` beim Offline-Failsafe — der absolute Zeitpunkt, zu dem die Box selbst öffnet. */
export type BoxFailsafeWarningView =
  | (Extract<BoxFailsafeWarning, { kind: "offlineOpen" }> & { dueAt: string })
  | Extract<BoxFailsafeWarning, { kind: "lowBatteryOpen" }>;

export interface BoxStateView {
  name: string;
  /** SOLL: soll die Box gerade zu sein? Der zuletzt von Heimdall gemeldete Wert (jede Sperrquelle,
   *  eigen ODER Tracker-Sperrzeit); er kippt NICHT durch blossen Zeitablauf, solange die Box nicht
   *  wieder synct — dafür ist `staleLock` da. Steht `pendingCommand` an, ist dieser Wert ÄLTER als
   *  die Absicht des Trackers — siehe dort. */
  locked: boolean;
  /** Aus einem Eintrag abgeleitetes Kommando, das die Box noch nicht abgeholt hat. `"open"` heisst:
   *  der Sub hat eine Öffnung eingetragen, `locked` stammt aber noch vom Push DAVOR und ist bis zum
   *  nächsten Box-Sync (Minuten) überholt — ohne dieses Feld liest sich der Zwischenstand wie „der
   *  Sub ist noch verschlossen". `null` = Spiegel und Absicht sind einig.
   *
   *  ACHTUNG, kein Freibrief: eine laufende Keyholder-Sperrzeit überschreibt ein `"open"` NICHT.
   *  Die Vorrang-Regel steht als Code in `boxSollLocked` (src/lib/boxStatus.ts) — dort ist auch
   *  begründet, warum sie nur den Spiegel-Anteil schlägt und nicht die Sperrzeit. */
  pendingCommand: "lock" | "open" | null;
  /** Physisches IST: war die Box beim letzten Sync wirklich zu? Kann seit dem Präsenz-Guard
   *  (FW 0.2.33) vom SOLL abweichen — „soll zu, steht aber offen und wartet auf Knopf/USB".
   *  `null` = Alt-Zeile ohne IST-Meldung; dann gilt das SOLL (`locked`) als bester Stand. */
  reportedLocked: boolean | null;
  lockUntil: string | null;
  /** Hält die Box den Schlüssel gerade fest — die EINE ehrliche Vollstreckungs-Antwort, **unabhängig**
   *  davon, ob die Box gerade online ist. Basiert auf dem IST: true nur, wenn sie zuletzt physisch
   *  zu gemeldet hat (`reportedLocked`, Fallback `locked`), der Schlüssel wirklich drin liegt
   *  (`keyInBox !== false`), die Öffnung nicht scharfgestellt ist (`!openArmed`) UND seit dem letzten
   *  Sync keine Selbst-Öffnung gefeuert hat (`!staleLock`). Ist sie false, nennt genau EIN Feld das
   *  WARUM: `locked:false` (soll offen), `reportedLocked:false` (steht offen, z.B. wartet auf das
   *  Präsenz-Fenster), `keyInBox:false` (Ehrensache, Schlüssel beim Sub), `openArmed:true` (zu, aber
   *  ein Knopfdruck vom Offen entfernt) oder `staleLock:true` (hat sich offline selbst geöffnet). */
  hardwareEnforced: boolean;
  /** Maschinenlesbare Fassung des „genau EIN Feld nennt das Warum"-Kontrakts (A-07): null wenn
   *  hardwareEnforced true, sonst der EINE Grund in fester Rangfolge — "soll-open" (locked:false),
   *  "reported-open" (reportedLocked:false), "key-not-in-box" (keyInBox:false), "open-armed"
   *  (openArmed:true), "stale-lock" (staleLock:true). */
  hardwareEnforcedReason: HardwareEnforcedReason | null;
  /** Die Öffnung ist SCHARFGESTELLT: die Box ist (laut IST) zu, aber die Frist ist verstrichen oder
   *  das SOLL steht auf offen — seit FW 0.2.34 öffnet sie dann nicht mehr von selbst, sondern beim
   *  nächsten Knopf/USB-Kontakt, ohne weitere Prüfung. „Hält" zählt das ehrlicherweise nicht mehr. */
  openArmed: boolean;
  /** Der zuletzt gemeldete „zu"-Stand (IST) ist nicht mehr verlässlich, weil die Box sich seit dem
   *  letzten Sync per **Offline-Failsafe** (nach `offlineOpenHours` ohne Sync) **selbst geöffnet**
   *  hat — der einzige verbliebene deterministische Selbst-Öffner neben Akku-Not (eine abgelaufene
   *  Frist öffnet seit FW 0.2.34 nicht mehr autonom → dafür `openArmed`). Auch OFFLINE — „online"
   *  spielt hier bewusst keine Rolle.
   *
   *  Seit der Failsafe-Vorwarnung ist dies exakt deren `offlineOpen`-Stufe `due` (daraus abgeleitet,
   *  nicht daneben gerechnet). Die BEDEUTUNG ist unverändert, die KANTE hat sich um bis zu drei
   *  Minuten verschoben: vorher lief der Vergleich über die auf eine Nachkommastelle gerundete
   *  Stundenzahl, jetzt über das ungerundete Verhältnis. Deshalb KEIN schemaVersion-Bump — das wäre
   *  die Rundung zur Semantik erklärt; die alte Kante war schlicht ungenauer. */
  staleLock: boolean;
  /** Deklaration des Subs beim aktuellen Verschluss: liegt der Schlüssel überhaupt in dieser Box?
   *  `false` = NEIN, er trägt ihn bei sich (z.B. auf Reise) — die Box hat dann bewusst KEIN
   *  lock-Kommando bekommen. Das ERKLÄRT ein `hardwareEnforced: false`, das sonst wie eine Box-Störung
   *  aussieht. `null` = nicht erklärt (Alt-Eintrag, Admin-Pfad, keine Box) oder gerade nicht
   *  verschlossen — sagt NICHTS über den Schlüssel aus und ist KEIN „nein". */
  keyInBox: boolean | null;
  /** Direkte Antwort auf die Frage, die eine Alleinzeit-Vorgabe stellt (Käfig zu UND Schlüssel
   *  drin): `reportedLocked === true && keyInBox === true && !openArmed && !staleLock`. Beide Booleans
   *  müssen explizit `true` sein UND die Box darf weder scharfgestellt sein (`openArmed` — ein
   *  Knopfdruck vom Offen) noch sich seit dem letzten Sync deterministisch selbst geöffnet haben
   *  (`staleLock`) — sonst gilt der gemeldete "zu"-Stand nicht mehr als gesichert (dieselbe Bedingung
   *  wie bei `hardwareEnforced`, siehe dort) —
   *  `null` auf einer Seite (nicht gemeldet / nicht erklärt) zählt bewusst NICHT als gesichert,
   *  auch wenn `keyInBox: null` für sich genommen kein „nein" ist (s. oben). Erspart das
   *  Verrechnen von `reportedLocked`+`keyInBox`, das A-06 als stille Falle identifiziert hat
   *  (`keyInBox: true` bei `locked: false` sieht wie eine erfüllte Vorgabe aus, ist aber ein
   *  offener Käfig mit Schlüssel drin). */
  keySecured: boolean;
  battery: number | null;
  charging: boolean | null;
  lastSeen: string | null;
  /** Vorwarnung vor einer AUTONOMEN Selbst-Öffnung der Box: Funkstille (`offlineOpen`, nach so
   *  vielen Stunden ohne Sync öffnet sie ohne Server und ohne jemanden am Gerät) und Akku-Not
   *  (`lowBatteryOpen`). `[]` heisst „kein Anlass ODER keine Datenbasis": eine Box, die nie gesynct
   *  hat, und eine Alt-Zeile ohne gemeldete Schwellen schweigen ebenfalls — Stille ist hier also
   *  KEIN Beleg für Ungefährlichkeit. Der `lowBatteryOpen`-Arm kennt nur `warn` und `due`.
   *
   *  Wozu: bis diese Warnung existierte, war das erste sichtbare Signal die Not-Öffnung SELBST —
   *  eine Box konnte einen Tag lang jeden stündlichen Sync verfehlen, ohne dass irgendwo etwas
   *  stand (heimdall#1). Verhindern lässt sich die Öffnung nur, indem rechtzeitig jemand für Netz
   *  bzw. Strom sorgt; genau dafür ist dieses Feld da. `due` heisst: die Not-Öffnung ist bereits
   *  erfolgt ODER steht unmittelbar bevor — für den Funkstille-Fall ist das dieselbe Aussage wie
   *  `staleLock`, das genau daraus abgeleitet wird. Aufgelöst wird beides erst durch den nächsten
   *  erfolgreichen Sync, der sie GEMEINSAM löscht und den wahren Riegelstand nachliefert.
   *
   *  Fertig gerechnet, absichtlich: die Restzeit steht als Zahl UND als absoluter Zeitpunkt
   *  (`dueAt`) da, damit niemand `lastSeen` gegen `generatedAt` verrechnet (A-08).
   *
   *  ANZEIGE-GRENZE: gemessen wird „seit wann hat der TRACKER nichts gehört" — nicht der Zähler in
   *  der Box. Meist warnt das zu früh (Heimdalls Push klemmt); es kann aber auch zu SPÄT sein, wenn
   *  die Anfrage der Box ankam und nur ihre Antwort verlorenging: dann zählt die Box weiter, während
   *  hier alles frisch aussieht. Begründung in `boxFailsafeWarnings` (src/lib/boxStatus.ts).
   *
   *  BEKANNTE LÜCKE: `hardwareEnforced`/`keySecured`/`staleLock` verrechnen nur den FUNKSTILLE-
   *  Selbstöffner. Steht hier ein `lowBatteryOpen` auf `due`, kann daneben `hardwareEnforced: true`
   *  stehen — „hält fest" und „öffnet gleich" nebeneinander. Im Zweifel gilt diese Warnung: die
   *  Akku-Not öffnet autonom. (Der Fall ist selten, weil eine Box unter der Schwelle beim selben
   *  Wake öffnet und dann offen meldet — er entsteht nur mit einem veralteten Akku-Wert.) */
  failsafeWarnings: BoxFailsafeWarningView[];
  /** Alter von `lastSeen` in Sekunden zum Zeitpunkt dieser Antwort (`generatedAt`) — beantwortet
   *  "ist die Box aktuell?" ohne dass die Instanz `lastSeen` gegen `generatedAt` selbst verrechnet
   *  (A-08: genau dieses Nachrechnen führte am 16.07.2026 zu einem erfundenen Zeitzonen-Bug).
   *  null = keine Box-Meldung bisher (`lastSeen` ebenfalls null). */
  lastSeenAgeSeconds: number | null;
}

export interface DashboardResult extends Envelope {
  /** v3: `currentRun.since` = Lauf-Anfang statt jüngster KG-Eintrag (A-01).
   *  v4 (N-2, MCP-Restliste 2026-07-17): `currentRun.deviceName` und `wornNow[].deviceName` sind
   *  jetzt das MASSGEBLICHE Gerät (`deviceEffective` — bei image-conflict gewinnt das Bild), NICHT
   *  mehr das deklarierte. Vorher widersprach das Dashboard als einziger Endpunkt den Deep-Views.
   *  Neu daneben: `deviceDeclared` + `deviceConfidence`, damit der Konflikt am Ort der Frage sichtbar
   *  ist. Semantik-Änderung eines Bestandsfelds → schemaVersion-Bump (nicht rein additiv).
   *  v5 (MCP-Restliste 2026-07-18): `currentRun.since` ist bei `isLocked:false` jetzt `null` (kein
   *  aktiver Lauf) statt des Öffnen-Zeitpunkts — konsistent mit den dann ebenfalls null-Feldern
   *  durationHours/deviceName/currentSegmentSince.
   *  v6: mehrere Einschliess-Anforderungen dürfen koexistieren. `nextRelevant.openLockRequest` ist
   *  damit nicht mehr „DIE offene", sondern die DRINGENDSTE (frühste Frist) von möglicherweise
   *  mehreren — vollständig stehen sie in `nextRelevant.openLockRequests`. Ein Wert aus v5 sagte
   *  „es gibt genau diese eine"; das lässt sich rückwirkend nicht mehr behaupten.
   *  v7: `nextRelevant.openControl.code` kann jetzt `null` sein — das getragene Gerät kann von der
   *  Code-Pflicht befreit sein (`Device.requireInspectionCode: false`). Bis v6 war der Code immer eine
   *  Zahl; ein `null` heisst NICHT „Code unbekannt", sondern „diese Kontrolle hat keinen". Sie wird
   *  dann durch das eingereichte Foto erfüllt, nicht durch einen Code-Vergleich.
   *
   *  v8: `directives.openTasks` enthält jetzt AUCH Aufgaben im Zustand `awaitingReview` (Issue #39) —
   *  die Menge der möglichen `state`-Werte hat sich damit erweitert, und das ist kein rein additives
   *  Feld: eine Auswertung, die bisher jeden Eintrag als „der Sub ist am Zug" las, läge falsch. Dazu
   *  je Aufgabe `proofs[]` — die Adresse, ohne die `review_task_proof` nicht aufrufbar wäre.
   *
   *  v9: `nextRelevant.openControl` (Einzelwert) ist zu `nextRelevant.openControls` (Array)
   *  geworden — seit Kontrollen auf Trage-Kategorien zielen können (v5.0.1), läuft je Ziel eine,
   *  und ein Einzelwert verschwiege die übrigen Fristen. Jede trägt ihr `target`.
   *
   *  v11: Aufgaben sind terminierbar (`create_task` mit `delayMinutes`/`scheduledAt`), und
   *  `nextRelevant.openTasks` bedeutet dadurch etwas anderes: „offen" heisst ab jetzt „beim Sub
   *  angekommen und noch nicht entschieden" — eine terminierte, noch nicht ausgelöste Aufgabe steht
   *  NICHT mehr darin, sondern in `scheduledDirectives` (dort neu mit `kind: "task"`). Kein
   *  additives Feld: ein v10-Wert zählte auch das Geplante mit, ein v11-Wert nicht.
   *
   *  v12: ein Nachweis kann eine EIGENE Fälligkeit haben (`create_task` mit
   *  `requireProof[].dueMinutes`). Neu je Nachweis `dueAt` — das allein wäre additiv. Nicht additiv
   *  ist der neue Wert `overdue` in `openTasks[].proofs[].state`: dieselbe Erweiterung einer
   *  Zustands-Menge wie in v8, und mit derselben Folge. Wer bisher jede nicht eingereichte Zeile als
   *  „der Sub ist noch dran" las, läge falsch — bei `overdue` kann er nichts mehr tun, die Frist ist
   *  vorbei und die Aufgabe damit versäumt.
   *
   *  v13: die SPÄTE ANNAHME rettet die Aufgabe. Nimmt der Keyholder ein nach der Frist eingereichtes
   *  Nachweis-Foto an (`review_task_proof accepted:true`), zählt es doch — die Aufgabe ist erfüllt
   *  statt versäumt. Kein neues Feld, aber ein anderer Wortlaut für ein bestehendes: `state` einer
   *  Aufgabe war bis v12 endgültig, sobald eine Nachweis-Frist verstrichen war. Ab v13 ist er es
   *  nicht mehr — eine Aufgabe, die als versäumt aus `openTasks` gefallen war, kann durch eine
   *  Sichtung als `running`/`awaitingUserConfirmation` zurückkehren, und ein noch UNBEURTEILTES
   *  `unfulfilled_task` verschwindet dabei rückwirkend (ein bereits geschriebenes Urteil bleibt —
   *  das nimmt nur `judge_offense reopen` zurück). Ein v12-Wert trug die stille Zusage „das kann
   *  sich nur noch durch eine ABLEHNUNG ändern"; die gilt nicht mehr. */
  schemaVersion: 13;
  user: string;
  /** Freitext-Regeln des menschlichen Keyholders (mcpKeyholderInstructions) — bewusst als erstes
   *  Inhaltsfeld: alle Direktiven/Writes müssen diese Regeln befolgen. null = keine gesetzt. */
  keyholderInstructions: string | null;
  currentRun: {
    isLocked: boolean;
    /** Verschlossen: Beginn des LAUFS (Session-Kopf), deckt sich mit `durationHours`. Nicht
     *  verschlossen: `null` (kein aktiver Lauf — wie durationHours/deviceName/currentSegmentSince).
     *  Siehe `currentSegmentSince` für den Segment-Anfang bei Reinigungspausen. */
    since: string | null;
    /** NUR bei isLocked mit Pausen abweichend von `since`: Beginn des AKTUELLEN Segments (letzter
     *  Wiederverschluss). Ohne Pausen identisch mit `since`, weiterhin gesetzt (kein Sonderfall). */
    currentSegmentSince: string | null;
    durationHours: number | null;
    /** Dauer seit `currentSegmentSince` — die Zahl, die zum gemeldeten `deviceName` gehört. Ohne
     *  Reinigungspause identisch mit `durationHours`. */
    currentSegmentDurationHours: number | null;
    /** MASSGEBLICHES Gerät des aktuellen Segments (deviceEffective — bei image-conflict das
     *  verifizierte). Deckt sich mit get_session/device_stats. Siehe deviceDeclared für den Konflikt. */
    deviceName: string | null;
    /** Am Lock-Entry deklariertes Gerät des aktuellen Segments. Weicht von deviceName ab, wenn eine
     *  Bildkontrolle widerspricht (deviceConfidence: "image-conflict"). */
    deviceDeclared: string | null;
    deviceConfidence: DeviceConfidence | null;
    personalBestHours: number;
    vsPersonalBestPct: number | null;
    /** true, wenn goals.kg.today einen Anteil einer FRÜHEREN (heute geendeten) Session enthält —
     *  dann ist `today` grösser als der durchgehende `durationHours`, ist also NICHT die Lauf-Dauer. */
    todayIncludesPriorSession: boolean;
    /** Hat der Sub beim Verschluss erklärt, den Schlüssel in die Box gelegt zu haben?
     *  `false` = er behält ihn (z.B. auf Reise) → die Sperre ist Ehrensache, nicht hardware-vollstreckt.
     *  `null` = nicht gefragt (keine Box, Admin-Pfad, Alt-Eintrag) oder nicht verschlossen — KEIN „nein". */
    keyInBox: boolean | null;
  };
  /** Echte (nicht cluster-interne) Bild-Diskrepanzen als reiner Daten-Hinweis — KEINE Vergehen
   *  (eine Routine-Kontrolle hat kein verlangtes Gerät). Cluster-interne Verwechslungen sind hier
   *  bewusst ausgeblendet. */
  dataDiscrepancies: { count: number; items: DiscrepancyItem[] };
  /** Was JETZT getragen wird — KG + alle Kategorien vereint.
   *
   *  ACHTUNG, zwei verschiedene Uhren in EINER Zeile: `since`/`durationHours` messen den LAUF (wie
   *  `currentRun.since`), `deviceName` nennt aber das Gerät des AKTUELLEN SEGMENTS. Nach einem
   *  Gerätewechsel in einer Reinigungspause gehören die beiden nicht zusammen — wer sie paart,
   *  liest „<neues Gerät> seit <Lauf-Anfang>". Dafür stehen `deviceSince`/`deviceDurationHours`
   *  daneben: die Uhr, die zum genannten Gerät gehört. Ohne Pause sind beide Paare identisch.
   *  (Kategorie-Zeilen kennen keine Segmentierung — dort sind sie es immer.) */
  wornNow: {
    category: string;
    deviceName: string | null;
    deviceDeclared: string | null;
    deviceConfidence: DeviceConfidence | null;
    since: string | null;
    durationHours: number | null;
    /** Seit wann DIESES Gerät getragen wird (Segment-Anfang) — passt zu `deviceName`. */
    deviceSince: string | null;
    /** Dauer seit `deviceSince` — passt zu `deviceName`. */
    deviceDurationHours: number | null;
  }[];
  /** Das als Nächstes Relevante: offene Kontrolle / aktive Sperrzeit / Orgasmus-Fenster.
   *  Zeiten ISO-8601 mit Offset (die liveState-Mapper bekommen das `iso`-Format durchgereicht); zusätzlich
   *  remainingMinutes/overdue für direkte Fristfragen. Beim Orgasmus-Fenster zeigt `active` an,
   *  ob der Start (`beginntAt`) schon erreicht ist — `active:false` = geplant, läuft noch NICHT
   *  (remainingMinutes zählt bis `endetAt`).
   *
   *  Die Sichten aus `mcp/liveState.ts` werden unverändert übernommen, statt sie hier erneut zu
   *  beschreiben und Feld für Feld umzukopieren: sonst müsste jedes neue Feld an zwei Stellen
   *  nachgezogen werden, und wer es vergisst, lässt es stillschweigend aus dem Dashboard fallen.
   *  Dadurch trägt `openControls` jetzt auch den Kommentar des Keyholders und `openOrgasmWindow`
   *  dessen Nachricht. */
  nextRelevant: {
    /** ALLE offenen Kontrollen, dringendste Frist zuerst — je Ziel kann eine laufen (v5.0.1).
     *  Leeres Array = keine offen. Welches Ziel gemeint ist, steht in `target`. */
    openControls: OpenKontrolleView[];
    activeLockPeriod: ActiveSperrzeitView | null;
    /** Eine durch eine ÖFFNUNG beendete Sperrzeit, deren ursprüngliches Ende noch nicht verstrichen
     *  ist. Sie wird gerade NICHT vollstreckt (`activeLockPeriod` bleibt null) — aber die Konsequenz
     *  der Keyholderin ist damit auch nicht erledigt. Ohne dieses Feld verschwand sie spurlos, und
     *  `activeLockPeriod: null` war nicht mehr von „es gab nie eine" zu unterscheiden.
     *
     *  Das Feld sagt WIE sie endete, nicht OB sich der Sub etwas zuschulden kommen liess: auch eine
     *  erlaubte Öffnung (z.B. ein offenes Orgasmus-Fenster) beendet sie und erscheint hier. Ob die
     *  Öffnung ein Vergehen war, beantwortet allein `get_offenses` — nicht dieses Feld. */
    interruptedLockPeriod: InterruptedSperrzeitView | null;
    openOrgasmWindow: OpenOrgasmusAnforderungView | null;
    /** Offene Verschluss-ANFORDERUNG: der Sub SOLL sich einschliessen, hat es aber noch nicht getan
     *  (`overdue: true`, wenn die Frist verstrichen ist). Nicht zu verwechseln mit `activeLockPeriod`
     *  — die Sperrzeit hält einen bestehenden Verschluss, die Anforderung verlangt ihn erst.
     *  Nur die bereits ausgelöste; geplante stehen in `scheduledDirectives`. */
    openLockRequest: OpenLockRequestView | null;
    /** ALLE offenen, bereits ausgelösten Anforderungen — dringendste zuerst, `openLockRequest` ist
     *  die erste davon. Mehrere sind seit v6 normal: sie ersetzen einander nicht, und EIN Verschluss
     *  erfüllt alle. Jede trägt ihre id für `edit_lock_request` / `withdraw`. */
    openLockRequests: OpenLockRequestView[];
    /** Offene Aufgaben (create_task): Text + Bedingungen, die bis `holdUntil` DURCHGEHEND gelten
     *  müssen. `state` ist ABGELEITET aus den Einträgen des Subs, nicht gestempelt. Jede trägt ihre
     *  id für `edit_task` / `withdraw target:"task"`.
     *  Nur die bereits AUSGELÖSTEN — terminierte stehen in `scheduledDirectives` (seit v11). */
    openTasks: OpenTaskView[];
  };
  goals: { kg: PeriodSummaryResult["kg"]; categories: PeriodSummaryResult["categories"] };
  openOffenses: { count: number; pendingPenalties: number; top: OffenseRow[] };
  /** Vom Keyholder TERMINIERTE, noch nicht ausgelöste Direktiven (wirksamAb in der Zukunft):
   *  Sperrzeit/Einschliess-Anforderung (lock_period/lock_request), MANUELLE Kontrollen (auto:false)
   *  und Aufgaben (task). Diese sind für den Sub noch unsichtbar — der Keyholder sieht hier, was in
   *  der Pipeline liegt, und kann sie via `withdraw` stornieren. Auto-/Zufalls-Kontrollen
   *  (auto:true) sind bewusst NICHT enthalten (Überraschungseffekt). */
  scheduledDirectives: ScheduledDirective[];
  /** Gepinnte, dauerhafte Anweisungen (DIRECTIVE) — fallen nie aus einem Recency-Fenster. */
  standingDirectives: NoteDTO[];
  /** Gepinnte Grenzen (BOUNDARY) mit doDont — unübersehbar. */
  boundaries: NoteDTO[];
  boxState: BoxStateView | null;
  /** Aktive Gesundheits-Zurückhaltung (§8) oder null. */
  healthHold: HealthHoldView | null;
}

/** Eine offene Aufgabe, wie der Keyholder sie sieht. */
export interface OpenTaskView {
  id: string;
  title: string;
  description: string | null;
  /**
   * Bis dahin müssen alle Bedingungen durchgehend gelten (ISO-8601 mit Offset).
   *
   * Ab schemaVersion 10 das WIRKSAME Ende: bei einer Aufgabe im Dauer-Modus (`holdDurationMin`
   * gesetzt) ist es `startedAt` + Dauer, und solange nicht begonnen wurde das spätestmögliche Ende.
   * Bei einer Aufgabe mit festem Ende ist es unverändert genau dieses.
   */
  holdUntil: string;
  /** Dauer-Modus: die Haltezeit in Minuten AB DEM ANLEGEN (bei mehreren Geräten ab dem letzten).
   *  null = feste Endzeit. Siehe `explain_model`, Abschnitt 6a. */
  holdDurationMin: number | null;
  /** pending = nichts erfüllt · partial = ein Teil · running = alles gilt, die Zeit läuft ·
   *  awaitingReview = die Nachweise liegen vor, aber mindestens einer ist maschinell nicht
   *  entscheidbar: DU bist am Zug (`review_task_proof`). Weder erfüllt noch versäumt, bis du urteilst. */
  state: string;
  /** Bedingungen, die JETZT nicht gelten — die Antwort auf „woran hängt es gerade?". */
  missing: string[];
  /** Seit wann alle Bedingungen gleichzeitig gelten; null = noch nie. */
  startedAt: string | null;
  /** Bedingungen hielten durch, es fehlt nur noch die Erledigt-Meldung des Subs. */
  awaitingUserConfirmation: boolean;
  /** Die geforderten Nachweis-Fotos, in der SOLL-Reihenfolge. `index` ist die Adresse für
   *  `review_task_proof` — ohne diese Liste wüsstest du weder, wie viele es gibt, noch was sie
   *  zeigen sollen, noch welchen du gerade beurteilst. Leer bei Aufgaben ohne Nachweis-Pflicht. */
  proofs: OpenTaskProofView[];
  /** Müssen die Aufnahmezeiten der Nachweise ihrer Reihenfolge folgen? false = die Fotos dürfen in
   *  beliebiger Reihenfolge entstehen (dann gibt es auch keinen Zustand `outOfOrder`, und ein Foto
   *  ohne Aufnahmezeit ist kein Grund für eine Sichtung). */
  proofOrderMatters: boolean;
  isPunishment: boolean;
}

/** Die Nachweise einer Aufgabe für den Keyholder — inklusive der Regel, welcher die Reihenfolge
 *  bricht. Dieselbe Ableitung wie auf der Karte (`taskProofState` + `firstOutOfOrderProof`), damit
 *  Agent und Oberfläche nicht verschiedene Zustände zur selben Zeile nennen. */
function taskProofViews(views: TaskProofView[], { task, evaluation }: EvaluatedTask): OpenTaskProofView[] {
  const ordered = [...views].sort((a, b) => a.sortOrder - b.sortOrder);
  const outOfOrderId = firstOutOfOrderProof(ordered, task)?.id ?? null;
  return ordered.map((p, i) => ({
    index: i + 1,
    description: p.description,
    // Zustand und Frist kommen aus derselben AUSWERTUNG wie auf der Karte — die überfälligen
    // Nachweise stehen dort schon (`overdueProofIds`), und das wirksame Ende ebenfalls. Eine eigene
    // Uhr hier gäbe zwei Antworten auf dieselbe Frage.
    state: taskProofState(p, outOfOrderId, evaluation.overdueProofIds.includes(p.id)),
    dueAt: ownProofDeadline(p, task, evaluation.holdUntil)?.toISOString() ?? null,
    reviewNote: p.reviewNote,
  }));
}

/** Ein geforderter Nachweis, so weit der Keyholder ihn zum Urteilen braucht. */
export interface OpenTaskProofView {
  /** 1-basierte Position — die Adresse für `review_task_proof`. */
  index: number;
  /** Was auf dem Bild zu sehen sein muss (dein eigener Text beim Stellen). */
  description: string;
  /** open = noch nicht eingereicht · confirmed = erbracht (Code bestätigt oder von dir angenommen) ·
   *  review = eingereicht, wartet auf DEIN Urteil · rejected = von dir abgelehnt ·
   *  outOfOrder = Aufnahmezeit bricht die geforderte Reihenfolge ·
   *  overdue = Frist verstrichen, nichts (rechtzeitig) eingereicht und nichts angenommen — die
   *  Aufgabe ist damit versäumt. Lag ein spätes Foto vor und du hast es ANGENOMMEN, steht hier
   *  `confirmed` und die Aufgabe ist erfüllt. */
  state: string;
  /** EIGENE Fälligkeit dieses Nachweises (ISO-8601 mit Offset) — null, wo er bis zum Ende der
   *  Aufgabe offen ist. Nach ihr nimmt die App nichts mehr an; ein `dueAt` in der Vergangenheit mit
   *  `state: "open"` gibt es deshalb nicht, das ist dann `overdue`. */
  dueAt: string | null;
  /** Deine Anmerkung aus der Sichtung, falls du eine hinterlassen hast. */
  reviewNote: string | null;
}

/** Eine vom Keyholder terminierte, noch nicht ausgelöste Direktive (für scheduledDirectives). */
export interface ScheduledDirective {
  id: string;
  /** lock_request = Einschliess-Anforderung · lock_period = Sperrzeit · inspection = manuelle
   *  Kontrolle · task = terminierte Aufgabe. */
  kind: "lock_request" | "lock_period" | "inspection" | "task";
  /** Geplanter Auslöse-Zeitpunkt (ISO-8601 mit Offset). */
  wirksamAb: string;
  /** Frist/Sperrzeit-Ende (ISO) — bei Kontrollen die Erfüllungs-Frist, bei Sperrzeit das Ende, bei
   *  einer Aufgabe ihr (spätestmögliches) Ende, sonst null. */
  endetAt: string | null;
  /** Freitext: Kontroll-Kommentar, Anforderungs-/Sperrzeit-Nachricht bzw. der Aufgaben-Titel. */
  message: string | null;
  /** Nur lock_request/lock_period: erlaubt die (geplante) Sperre Reinigungsöffnungen? Deckt die
   *  „Text sagt Reinigung erlaubt, Flag steht aber auf false"-Falle auf. null bei inspection. */
  reinigungErlaubt: boolean | null;
}

/** Lädt die vom Keyholder terminierten, noch nicht ausgelösten Direktiven (wirksamAb > now):
 *  VerschlussAnforderung (ANFORDERUNG/SPERRZEIT) + MANUELLE Kontrollen (auto:false) + Aufgaben.
 *  Auto-Kontrollen werden bewusst NICHT geladen.
 *
 *  Die Aufgaben filtern auf `benachrichtigtAt: null` statt auf `wirksamAb > now`: das ist die
 *  wörtliche Umkehrung von `isHiddenFromSub` und trifft damit exakt die Zeilen, die aus `openTasks`
 *  herausfallen. Eine fällige, aber noch nicht zugestellte Aufgabe (der Tick hat sie noch nicht
 *  erreicht) fiele zwischen die beiden Listen, wenn hier über die Uhr gefiltert würde.
 *
 *  Eigene Abfrage statt eines Filters über die ohnehin ausgewerteten Aufgaben: die sind auf die
 *  jüngsten gedeckelt, eine weit in der Zukunft terminierte Aufgabe darf daran nicht hängen. */
async function loadScheduledDirectives(userId: string, now: Date, iso: Iso): Promise<ScheduledDirective[]> {
  const [anforderungen, kontrollen, tasks] = await Promise.all([
    // Kein per-Query orderBy — die zusammengeführte Liste wird unten ohnehin nach wirksamAb sortiert.
    prisma.verschlussAnforderung.findMany({
      where: { userId, withdrawnAt: null, fulfilledAt: null, wirksamAb: { gt: now } },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId, withdrawnAt: null, entryId: null, auto: false, wirksamAb: { gt: now } },
    }),
    prisma.task.findMany({
      where: { userId, ...hiddenFromSubWhere },
      select: { id: true, title: true, wirksamAb: true, holdUntil: true },
    }),
  ]);
  const out: ScheduledDirective[] = [
    ...anforderungen.map((a) => ({
      id: a.id,
      kind: (a.art === "SPERRZEIT" ? "lock_period" : "lock_request") as ScheduledDirective["kind"],
      wirksamAb: iso(a.wirksamAb)!,
      endetAt: iso(a.endetAt),
      message: a.nachricht,
      reinigungErlaubt: a.reinigungErlaubt,
    })),
    ...kontrollen.map((k) => ({
      id: k.id,
      kind: "inspection" as const,
      wirksamAb: iso(k.wirksamAb)!,
      endetAt: iso(k.deadline),
      message: k.kommentar,
      reinigungErlaubt: null,
    })),
    ...tasks.map((t) => ({
      id: t.id,
      kind: "task" as const,
      wirksamAb: iso(t.wirksamAb)!,
      endetAt: iso(t.holdUntil),
      message: t.title,
      reinigungErlaubt: null,
    })),
  ];
  return out.sort((a, b) => a.wirksamAb.localeCompare(b.wirksamAb));
}

/** Toleranz beim Vergleich zweier auf 0.1 h gerundeter Stundenwerte (halbe Bucket-Breite). */
const ROUND_EPSILON_H = 0.05;

/** Eine echte Bild-Diskrepanz (deklariert ≠ bildverifiziert, cross-cluster). */
export interface DiscrepancyItem {
  sessionId: string;
  segmentIndex: number;
  declared: string | null;
  detected: string | null;
  at: string;
}

/** Sammelt echte (cross-cluster) Bild-Konflikte aus den Sessions — cluster-interne Verwechslungen
 *  (cluster-ambiguous) bleiben bewusst draussen (keine Vergehen). */
function collectImageConflicts(sessions: Session[], iso: Iso): DiscrepancyItem[] {
  return sessions.flatMap((s) =>
    s.segments
      .filter((seg) => seg.deviceConfidence === "image-conflict")
      .map((seg) => ({ sessionId: s.id, segmentIndex: seg.index, declared: seg.deviceDeclared.name, detected: seg.deviceVerified?.name ?? null, at: iso(seg.start)! })),
  );
}

const loadBoxRow = (userId: string) =>
  prisma.boxStatus.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });

type BoxRow = Awaited<ReturnType<typeof loadBoxRow>>;

/** `keyInBox` kommt vom Verschluss-EINTRAG, nicht aus der Box-Zeile: die Box weiss nicht, ob der
 *  Schlüssel in ihr liegt — nur der Sub hat das erklärt. Deshalb reicht der Aufrufer die Deklaration
 *  durch: das Dashboard hat sie gratis aus dem Lock-Zustand (derselbe Wert wie `currentRun.keyInBox`,
 *  die beiden können so nicht auseinanderlaufen), `get_box_state` lädt sie via `getCurrentLockKeyInBox`. */
function mapBoxState(box: BoxRow, now: Date, iso: Iso, keyInBox: boolean | null): BoxStateView | null {
  if (!box) return null;
  // Bester bekannter physischer Stand: das gemeldete IST, bei Alt-Zeilen ohne IST-Meldung das SOLL
  // (= bisheriges Verhalten, bis der erste Heimdall-Push nach dem Rollout das Feld füllt). Bewusst
  // NICHT `reportedLocked` genannt — das Rückgabefeld gleichen Namens trägt den ROHEN Wert (nullable).
  const effectiveLocked = boxIsPhysicallyLocked(box);
  // Scharfgestellt (FW ≥ 0.2.34): Frist verstrichen oder SOLL offen, Box aber (laut IST) noch zu —
  // sie öffnet nicht mehr von selbst, sondern beim nächsten Knopf/USB-Kontakt. Ein Druck genügt,
  // ohne Eintrag und ohne weitere Prüfung — als „hält fest" darf das nicht mehr zählen.
  const openArmed =
    effectiveLocked && (!box.locked || (box.lockUntil !== null && box.lockUntil <= now));
  // Failsafe-Vorwarnung über EXAKT dieselbe Funktion wie die Box-Karte im Dashboard — inklusive
  // ihrer Schwellen und ihres „nur bei physisch zu"-Vorbehalts. Eine zweite Rechnung hier hiesse,
  // dass Sub und Keyholderin über dieselbe Box unterschiedliche Fristen lesen.
  const failsafeWarnings: BoxFailsafeWarningView[] = boxFailsafeWarnings(box, now.getTime()).map((w) =>
    w.kind === "offlineOpen"
      // `box.lastSyncAt` ist hier garantiert gesetzt — ohne ihn entsteht gar keine offlineOpen-Warnung.
      ? { ...w, dueAt: iso(new Date(box.lastSyncAt!.getTime() + w.thresholdHours * 3_600_000))! }
      : w,
  );
  // Selbst geöffnet hat sich die Box seit FW 0.2.34 nur noch per Offline-Failsafe (`offlineOpenHours`
  // ohne Sync) — nur das entwertet den zuletzt gemeldeten „zu"-Stand; sonst gilt er weiter, egal ob
  // die Box gerade online ist. Bewusst AUS der Vorwarnung abgeleitet statt daneben neu gerechnet:
  // „die Frist ist abgelaufen" ist exakt deren `due`-Stufe, und zwei Formeln dafür widersprachen
  // sich prompt an der Kante (die eine rundete die Stunden, die andere nicht — dieselbe Antwort
  // meldete dann „hat sich geöffnet" und „öffnet in 1 Std" nebeneinander).
  const staleLock = failsafeWarnings.some((w) => w.kind === "offlineOpen" && w.severity === "due");
  // hardwareEnforced zieht openArmed zusätzlich ab (main/FW 0.2.34: eine verstrichene Frist öffnet
  // nicht mehr autonom, sie „armt" — die Box hält physisch nicht mehr im Sinne von „bleibt zu").
  const hardwareEnforced = effectiveLocked && keyInBox !== false && !openArmed && !staleLock;
  // Genau EIN Grund, feste Rangfolge (A-07). Muss am SELBEN Wert ansetzen wie `hardwareEnforced`,
  // nämlich `effectiveLocked` (= reportedLocked ?? locked) — sonst nennt der Grund bei
  // {locked:false, reportedLocked:true} fälschlich "soll-open", obwohl die Box effektiv zu ist und der
  // echte Grund key/armed/stale wäre. Ist die Box nicht wirksam zu, trennt reportedLocked===false (IST
  // offen, "reported-open") von „kein IST-Report + SOLL offen" ("soll-open").
  const hardwareEnforcedReason: HardwareEnforcedReason | null =
    hardwareEnforced ? null
      : !effectiveLocked ? (box.reportedLocked === false ? "reported-open" : "soll-open")
      : keyInBox === false ? "key-not-in-box"
      : openArmed ? "open-armed"
      : "stale-lock";
  return {
    name: box.name,
    locked: box.locked,
    pendingCommand: toPendingCommand(box.pendingCommand),
    reportedLocked: box.reportedLocked,
    lockUntil: iso(box.lockUntil),
    hardwareEnforced,
    hardwareEnforcedReason,
    openArmed,
    staleLock,
    keyInBox,
    keySecured: box.reportedLocked === true && keyInBox === true && !openArmed && !staleLock,
    battery: box.battery,
    charging: box.charging,
    lastSeen: iso(box.lastSyncAt),
    failsafeWarnings,
    // Math.max(0, …): eine Box, deren gemeldeter Sync minimal vor der Server-Uhr liegt (Netzwerk-
    // Latenz, leichte Uhr-Drift), soll nie eine negative "Alter"-Zahl liefern — das wäre selbst
    // wieder der Anlass für eine erfundene Zeitzonen-Theorie (siehe A-08-Kommentar oben).
    lastSeenAgeSeconds: box.lastSyncAt ? Math.max(0, Math.round((now.getTime() - box.lastSyncAt.getTime()) / 1000)) : null,
  };
}

export interface BoxStateResult extends Envelope {
  /** v4: neues Feld openArmed (Öffnung scharfgestellt — Frist verstrichen/SOLL offen, Box wartet
   *  auf Knopf/USB, FW ≥ 0.2.34); staleLock umgedeutet auf NUR den Offline-Failsafe-Term;
   *  hardwareEnforced zieht openArmed zusätzlich ab. Dazu hardwareEnforcedReason (A-07,
   *  maschinenlesbarer EINE-Grund-Kontrakt) und der gemeinsame Envelope (generatedAt/timezone, A-08).
   *  v3: hardwareEnforced IST-basiert (reportedLocked), staleLock ersetzte online. */
  schemaVersion: 4;
  user: string;
  boxState: BoxStateView | null;
}

/** Dedizierter BoxState-Read (explain_model §13): hardwareEnforced unterscheidet physische
 *  Vollstreckung von Ehrensache. null = keine Box registriert. Throws, wenn der User unbekannt ist. */
export async function getBoxState(username: string): Promise<BoxStateResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  // Box-Zeile und Schlüssel-Deklaration hängen beide nur an userId — parallel, nicht nacheinander.
  const [box, keyInBox] = await Promise.all([loadBoxRow(userId), getCurrentLockKeyInBox(userId)]);
  const now = new Date();
  const iso = makeIso(timezone);
  return { schemaVersion: 4, user: username, ...buildEnvelope(now, iso, timezone), boxState: mapBoxState(box, now, iso, keyInBox) };
}

/** Baut das Dashboard durch Komposition der Aggregate. Throws, wenn der User unbekannt ist. */
export async function keyholderDashboard(username: string): Promise<DashboardResult> {
  const now = new Date();
  // Entries/Reinigung/User-id/Keyholder-Regeln EINMAL laden und an alle Aggregate durchreichen,
  // statt sie pro Aggregat erneut zu scannen. (getOffenses lädt noch selbst.)
  const trackingCtx = await loadTrackingContext(username, now);
  const iso = makeIso(trackingCtx.timezone);
  // `iso` nimmt auch null; die liveState-Mapper übergeben immer ein Date. Ein Adapter statt eines
  // Casts an jeder Aufrufstelle.
  const fmt: Fmt = makeFmt(trackingCtx.timezone);
  // Paare EINMAL bauen und an buildSessions + buildLockState durchreichen (deren `prePairs`-Doku
  // erklärt das Sharing).
  const pairs = buildPairs<TrackingEntry, never>(trackingCtx.entries, [], trackingCtx.reinigung);
  // Sessions EINMAL bauen und teilen (records + dataDiscrepancies), statt buildSessions doppelt.
  const sessions = buildSessions(trackingCtx.entries, trackingCtx.reinigung, now, trackingCtx.devices, pairs);

  // Live-Zustand direkt aus der Helfer-Schicht (mcp/liveState.ts) — nicht mehr durch die fertige
  // V1-Antwort von buildOverview hindurch, die ~14 weitere Felder samt vier ungenutzter Queries
  // (Strafen-Zähler, Keyholder-Notizen, Reinigungs-Verbrauch, offene Verschluss-Anforderung) baute.
  const [openKontrolleRows, activeSperrzeitRow, openLockRequestRows, interruptedSperrzeitRow, activeWearRows, openOrgasmusRow,
         rec, periods, ledger, pinned, boxRow, healthHold, scheduledDirectives] = await Promise.all([
    getOpenKontrollen(trackingCtx.userId, now),
    getActiveSperrzeit(trackingCtx.userId),
    getOpenLockRequests(trackingCtx.userId, now),
    getInterruptedSperrzeit(trackingCtx.userId, now),
    getActiveWearSessions(trackingCtx.userId),
    getActiveOrgasmusAnforderung(trackingCtx.userId, now),
    records(username, trackingCtx, sessions),
    periodSummary(username, trackingCtx),
    getOffenses(username),
    queryNotes(username, { pinned: true, status: "active", limit: 50 }),
    loadBoxRow(trackingCtx.userId),
    loadActiveHealthHold(trackingCtx.userId, iso),
    loadScheduledDirectives(trackingCtx.userId, now, iso),
  ]);

  const lock = buildLockState(trackingCtx.entries, trackingCtx.reinigung, now, fmt, pairs);
  // N-2: das MASSGEBLICHE Gerät des laufenden KG-Segments (deviceEffective — bei image-conflict
  // gewinnt das Bild), aus derselben Session-Segmentierung wie die Deep-Views. `lock.deviceName`
  // trägt nur das DEKLARIERTE Gerät; ohne diese Überlagerung sagte das Dashboard als einziger
  // Endpunkt das falsche Gerät. Das aktuelle Segment ist das letzte einer offenen, nicht-orphaned
  // Session; fehlt es (Alt-Verschluss ohne Segment), fällt alles auf die Deklaration zurück.
  const currentSegment = sessions.find(isLiveOpenSession)?.segments.at(-1) ?? null;
  const kgEffectiveName = currentSegment?.deviceEffective.name ?? lock.deviceName;
  const kgDeclaredName = currentSegment?.deviceDeclared.name ?? lock.deviceName;
  const kgConfidence = currentSegment?.deviceConfidence ?? null;
  const activeWearSessions = mapActiveWearSessions(activeWearRows, now, fmt);
  // Die Box-Sicht erbt die Schlüssel-Deklaration aus DEMSELBEN Lock-Zustand wie currentRun — die
  // beiden Felder einer Antwort können so nicht auseinanderlaufen, und es kostet keine Query.
  const boxState = mapBoxState(boxRow, now, iso, lock.keyInBox);

  // wornNow: KG-Lock (falls verschlossen) + aktive Wear-Sessions der Kategorien.
  const wornNow: DashboardResult["wornNow"] = [];
  if (lock.isLocked) {
    wornNow.push({
      category: "KG", deviceName: kgEffectiveName, deviceDeclared: kgDeclaredName, deviceConfidence: kgConfidence,
      since: lock.since, durationHours: lock.currentDurationHours,
      // Die einzige Zeile, in der die beiden Uhren auseinandergehen können: nur das KG kennt
      // Segmente (Reinigungspausen), und nur dort kann sich das Gerät mitten im Lauf ändern.
      deviceSince: lock.currentSegmentSince, deviceDurationHours: lock.currentSegmentDurationHours,
    });
  }
  for (const w of activeWearSessions) {
    // Wear-Sessions durchlaufen keine KG-Bildkontroll-Segmentierung → deklariert == effektiv,
    // deviceConfidence "declared" — konsistent mit get_session, das eine Wear-Session über
    // reconcileDevice ohne Bildkontrolle ebenfalls auf "declared" auflöst (N-2).
    wornNow.push({
      category: w.category, deviceName: w.deviceName, deviceDeclared: w.deviceName, deviceConfidence: "declared",
      since: w.since, durationHours: w.durationHours,
      // Ohne Segmentierung ist der Lauf das Gerät: beide Uhren sind hier per Konstruktion dieselbe.
      deviceSince: w.since, deviceDurationHours: w.durationHours,
    });
  }

  const openOffenseRows = ledger.offenses.filter((o) => o.status === "open");

  // CT-008: "today" enthält einen Anteil einer früheren Session, wenn die Kalendertag-Summe grösser
  // ist als der durchgehende aktuelle Lauf (bei Lauf-Start vor Mitternacht ist today kleiner → false).
  const todayIncludesPriorSession =
    rec.currentRunHours != null && periods.kg.today - rec.currentRunHours > ROUND_EPSILON_H;

  // Aufgaben: Zustand wird aus den Einträgen abgeleitet, deshalb laden → auswerten → nur die offenen.
  const evaluatedTasks = await getEvaluatedTasks(trackingCtx.userId, now, {
    // Die Sicht des TRÄGERS, obwohl DU zuschaust: `openTasks` beantwortet „was steht bei ihm gerade
    // an?". Eine terminierte, noch nicht zugestellte Aufgabe steht bei ihm nicht an — sie steht in
    // `scheduledDirectives`, wo auch die übrigen geplanten Direktiven stehen.
    audience: "sub",
    kgEntries: trackingCtx.entries, wearEntries: trackingCtx.entries, reinigung: trackingCtx.reinigung,
  });
  // Beschreibung und Zustand der Nachweise hängen nicht am Auswertungs-Include — eine Abfrage über
  // die sichtbaren Aufgaben, damit `review_task_proof` überhaupt eine Adresse hat.
  const proofViews = await loadTaskProofViews(evaluatedTasks.map((e) => e.task.id));
  const openTasks: OpenTaskView[] = evaluatedTasks
    // `awaitingReview` gehört ausdrücklich dazu, obwohl `isTaskOpen` es ausschliesst: für den SUB ist
    // die Aufgabe erledigt (er kann nichts mehr tun), für DICH ist sie die offenste von allen — sie
    // wartet auf dein Urteil. Sie hier wegzufiltern hiesse, sie genau der Person zu verbergen, die
    // handeln muss.
    .filter((e) => isTaskOpen(e.evaluation.state) || needsKeyholderReview(e.evaluation.state))
    .map((e) => ({
      id: e.task.id,
      title: e.task.title,
      description: e.task.description,
      holdUntil: iso(e.evaluation.holdUntil)!,
      holdDurationMin: e.task.holdDurationMin,
      state: e.evaluation.state,
      missing: e.evaluation.missing.map((m) => m.label),
      startedAt: iso(e.evaluation.startedAt),
      awaitingUserConfirmation: e.evaluation.awaitingConfirmation,
      proofs: taskProofViews(proofViews.get(e.task.id) ?? [], e),
      proofOrderMatters: e.task.proofOrderMatters,
      isPunishment: e.task.isPunishment,
    }));

  // Einmal mappen, zweimal ausliefern: `openLockRequest` ist DASSELBE Objekt wie `openLockRequests[0]`
  // (die dringendste), nicht ein zweites, das auseinanderlaufen könnte.
  const openLockRequestViews = openLockRequestRows.map((r) => mapOpenLockRequest(r, now, fmt)!);

  // CT-004: echte (cross-cluster) Bild-Diskrepanzen als Daten-Hinweis (keine Vergehen).
  const discrepancyItems = collectImageConflicts(sessions, iso);

  return {
    schemaVersion: 13,
    user: username,
    ...buildEnvelope(now, iso, trackingCtx.timezone),
    keyholderInstructions: trackingCtx.keyholderInstructions,
    currentRun: {
      isLocked: lock.isLocked,
      since: lock.since,
      currentSegmentSince: lock.currentSegmentSince,
      durationHours: lock.currentDurationHours,
      currentSegmentDurationHours: lock.currentSegmentDurationHours,
      deviceName: kgEffectiveName,
      deviceDeclared: kgDeclaredName,
      deviceConfidence: kgConfidence,
      personalBestHours: rec.longestRunHours,
      vsPersonalBestPct: rec.currentRunVsPbPct,
      todayIncludesPriorSession,
      keyInBox: lock.keyInBox,
    },
    dataDiscrepancies: { count: discrepancyItems.length, items: discrepancyItems.slice(0, 5) },
    wornNow,
    nextRelevant: {
      openControls: openKontrolleRows.map((k) => mapOpenKontrolle(k, now, fmt)!),
      activeLockPeriod: mapActiveSperrzeit(activeSperrzeitRow, now, fmt),
      // Eine laufende Sperrzeit LÖST die unterbrochene AB: die Keyholderin hat auf den Bruch
      // geantwortet, die alte muss nicht weiter angemahnt werden. Ohne diese Ablösung bliebe eine
      // UNBEFRISTETE unterbrochene Sperrzeit (`endetAt: null`) für immer stehen — sie läuft nie ab,
      // und jeder Withdraw-Pfad filtert auf `withdrawnAt: null`, greift bei ihr also nicht mehr.
      // Sie wäre ein Dauer-Gespenst im Dashboard, das niemand mehr wegbekommt.
      interruptedLockPeriod: activeSperrzeitRow ? null : mapInterruptedSperrzeit(interruptedSperrzeitRow, fmt),
      openOrgasmWindow: mapOpenOrgasmusAnforderung(openOrgasmusRow, now, fmt),
      openTasks,
      // Die dringendste zuerst (getOpenLockRequests sortiert danach) — sie steht zusätzlich einzeln,
      // damit die häufige Frage „was ist als Nächstes fällig?" nicht durch eine Liste muss.
      openLockRequest: openLockRequestViews[0] ?? null,
      openLockRequests: openLockRequestViews,
    },
    goals: { kg: periods.kg, categories: periods.categories },
    openOffenses: { count: ledger.openOffenseCount, pendingPenalties: ledger.pendingPenaltyCount, top: openOffenseRows.slice(0, 5) },
    scheduledDirectives,
    standingDirectives: pinned.notes.filter((n) => n.type === "DIRECTIVE"),
    boundaries: pinned.notes.filter((n) => n.type === "BOUNDARY"),
    boxState,
    healthHold,
  };
}
