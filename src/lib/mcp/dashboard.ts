import { prisma } from "@/lib/prisma";
import { getOpenKontrolle, getActiveSperrzeit, getActiveWearSessions, getActiveOrgasmusAnforderung, getInterruptedSperrzeit, getCurrentLockKeyInBox, getOpenLockRequest } from "@/lib/queries";
import {
  buildLockState, mapOpenKontrolle, mapActiveSperrzeit, mapOpenOrgasmusAnforderung,
  mapActiveWearSessions, mapInterruptedSperrzeit, mapOpenLockRequest,
  type Fmt, type OpenKontrolleView, type ActiveSperrzeitView, type OpenOrgasmusAnforderungView,
  type InterruptedSperrzeitView, type OpenLockRequestView,
} from "@/lib/mcp/liveState";
import { makeIso, makeFmt, buildEnvelope, resolveUserContext, loadTrackingContext, type Envelope, type Iso, type NoteDTO, type TrackingEntry } from "@/lib/mcp/common";
import { buildPairs, msToHours } from "@/lib/utils";
import { buildSessions, type Session } from "@/lib/sessionModel";
import { records, periodSummary, type PeriodSummaryResult } from "@/lib/mcp/stats";
import { getOffenses, type OffenseRow } from "@/lib/mcp/ledger";
import { queryNotes } from "@/lib/mcp/notes";
import { loadActiveHealthHold, type HealthHoldView } from "@/lib/mcp/context";

/** keyholder_dashboard (explain_model §13) — EIN Call, der 90 % der Keyholder-Fragen beantwortet: aktueller
 *  Lauf vs. Personal Best, was JETZT getragen wird (alle Kategorien), das Nächst-Relevante, Ziele +
 *  Adhärenz, offene Vergehen, gepinnte Direktiven + Grenzen, BoxState. Komponiert die V2/V1-
 *  Aggregate — rein lesend, MCP-only. */

export interface BoxStateView {
  name: string;
  /** SOLL: soll die Box gerade zu sein? (`boxLocked()` — jede Sperrquelle, eigen ODER Tracker-Sperrzeit).
   *  Der zuletzt von Heimdall gemeldete Wert; er kippt NICHT durch blossen Zeitablauf, solange die Box
   *  nicht wieder synct — dafür ist `staleLock` da. */
  locked: boolean;
  /** Physisches IST: war die Box beim letzten Sync wirklich zu? Kann seit dem Präsenz-Guard
   *  (FW 0.2.33) vom SOLL abweichen — „soll zu, steht aber offen und wartet auf Knopf/USB".
   *  `null` = Alt-Zeile ohne IST-Meldung; dann gilt das SOLL (`locked`) als bester Stand. */
  reportedLocked: boolean | null;
  lockUntil: string | null;
  /** Hält die Box den Schlüssel gerade fest — die EINE ehrliche Vollstreckungs-Antwort, **unabhängig**
   *  davon, ob die Box gerade online ist. Basiert auf dem IST: true nur, wenn sie zuletzt physisch
   *  zu gemeldet hat (`reportedLocked`, Fallback `locked`), der Schlüssel wirklich drin liegt
   *  (`keyInBox !== false`) UND seit dem letzten Sync keine deterministische Selbst-Öffnung gefeuert
   *  hat (`!staleLock`). Ist sie false, nennt genau EIN Feld das WARUM: `locked:false` (soll offen),
   *  `reportedLocked:false` (steht offen, z.B. wartet auf das Präsenz-Fenster), `keyInBox:false`
   *  (Ehrensache, Schlüssel beim Sub) oder `staleLock:true` (hat sich offline selbst geöffnet). */
  hardwareEnforced: boolean;
  /** Der zuletzt gemeldete „zu"-Stand (IST) ist nicht mehr verlässlich, weil die Box sich seit dem
   *  letzten Sync **deterministisch selbst geöffnet** hat: entweder die gecachte Frist (`lockUntil`)
   *  ist verstrichen, oder das Offline-Failsafe (nach `offlineOpenHours` ohne Sync) ist erreicht.
   *  Beides macht die Box auch OFFLINE — „online" spielt hier bewusst keine Rolle. */
  staleLock: boolean;
  /** Deklaration des Subs beim aktuellen Verschluss: liegt der Schlüssel überhaupt in dieser Box?
   *  `false` = NEIN, er trägt ihn bei sich (z.B. auf Reise) — die Box hat dann bewusst KEIN
   *  lock-Kommando bekommen. Das ERKLÄRT ein `hardwareEnforced: false`, das sonst wie eine Box-Störung
   *  aussieht. `null` = nicht erklärt (Alt-Eintrag, Admin-Pfad, keine Box) oder gerade nicht
   *  verschlossen — sagt NICHTS über den Schlüssel aus und ist KEIN „nein". */
  keyInBox: boolean | null;
  /** Direkte Antwort auf die Frage, die eine Alleinzeit-Vorgabe stellt (Käfig zu UND Schlüssel
   *  drin): `reportedLocked === true && keyInBox === true && !staleLock`. Beide Booleans müssen
   *  explizit `true` sein UND die Box darf sich seit dem letzten Sync nicht deterministisch selbst
   *  geöffnet haben (sonst gilt der gemeldete "zu"-Stand nicht mehr — dieselbe Bedingung wie bei
   *  `hardwareEnforced`, siehe dort) —
   *  `null` auf einer Seite (nicht gemeldet / nicht erklärt) zählt bewusst NICHT als gesichert,
   *  auch wenn `keyInBox: null` für sich genommen kein „nein" ist (s. oben). Erspart das
   *  Verrechnen von `reportedLocked`+`keyInBox`, das A-06 als stille Falle identifiziert hat
   *  (`keyInBox: true` bei `locked: false` sieht wie eine erfüllte Vorgabe aus, ist aber ein
   *  offener Käfig mit Schlüssel drin). */
  keySecured: boolean;
  battery: number | null;
  charging: boolean | null;
  lastSeen: string | null;
  /** Alter von `lastSeen` in Sekunden zum Zeitpunkt dieser Antwort (`generatedAt`) — beantwortet
   *  "ist die Box aktuell?" ohne dass die Instanz `lastSeen` gegen `generatedAt` selbst verrechnet
   *  (A-08: genau dieses Nachrechnen führte am 16.07.2026 zu einem erfundenen Zeitzonen-Bug).
   *  null = keine Box-Meldung bisher (`lastSeen` ebenfalls null). */
  lastSeenAgeSeconds: number | null;
}

export interface DashboardResult extends Envelope {
  /** v3: `currentRun.since` bedeutet jetzt Lauf-Anfang statt jüngster KG-Eintrag — bei einem Lauf
   *  mit Reinigungspausen widersprach das bisher `durationHours` (A-01, MCP-Befundliste
   *  2026-07-17). Der alte Wert steht jetzt separat in `currentSegmentSince`. */
  schemaVersion: 3;
  user: string;
  /** Freitext-Regeln des menschlichen Keyholders (mcpKeyholderInstructions) — bewusst als erstes
   *  Inhaltsfeld: alle Direktiven/Writes müssen diese Regeln befolgen. null = keine gesetzt. */
  keyholderInstructions: string | null;
  currentRun: {
    isLocked: boolean;
    /** Beginn des LAUFS (Session-Kopf) — deckt sich mit `durationHours`. Siehe `currentSegmentSince`
     *  für den Beginn des aktuellen Segments, wenn der Lauf Reinigungspausen hatte. */
    since: string | null;
    /** NUR bei isLocked mit Pausen abweichend von `since`: Beginn des AKTUELLEN Segments (letzter
     *  Wiederverschluss). Ohne Pausen identisch mit `since`, weiterhin gesetzt (kein Sonderfall). */
    currentSegmentSince: string | null;
    durationHours: number | null;
    deviceName: string | null;
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
  /** Was JETZT getragen wird — KG + alle Kategorien vereint. `since` = Lauf-Anfang (wie
   *  `currentRun.since`; für das KG-Segment-Detail bei Reinigungspausen `get_session` nutzen —
   *  diese Zeile hier bleibt bewusst kompakt, ohne Segment-Granularität). */
  wornNow: { category: string; deviceName: string | null; since: string | null; durationHours: number | null }[];
  /** Das als Nächstes Relevante: offene Kontrolle / aktive Sperrzeit / Orgasmus-Fenster.
   *  Zeiten ISO-8601 mit Offset (die liveState-Mapper bekommen das `iso`-Format durchgereicht); zusätzlich
   *  remainingMinutes/overdue für direkte Fristfragen. Beim Orgasmus-Fenster zeigt `active` an,
   *  ob der Start (`beginntAt`) schon erreicht ist — `active:false` = geplant, läuft noch NICHT
   *  (remainingMinutes zählt bis `endetAt`).
   *
   *  Die Sichten aus `mcp/liveState.ts` werden unverändert übernommen, statt sie hier erneut zu
   *  beschreiben und Feld für Feld umzukopieren: sonst müsste jedes neue Feld an zwei Stellen
   *  nachgezogen werden, und wer es vergisst, lässt es stillschweigend aus dem Dashboard fallen.
   *  Dadurch trägt `openControl` jetzt auch den Kommentar des Keyholders und `openOrgasmWindow`
   *  dessen Nachricht. */
  nextRelevant: {
    openControl: OpenKontrolleView | null;
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
  };
  goals: { kg: PeriodSummaryResult["kg"]; categories: PeriodSummaryResult["categories"] };
  openOffenses: { count: number; pendingPenalties: number; top: OffenseRow[] };
  /** Vom Keyholder TERMINIERTE, noch nicht ausgelöste Direktiven (wirksamAb in der Zukunft):
   *  Sperrzeit/Einschliess-Anforderung (lock_period/lock_request) und MANUELLE Kontrollen
   *  (auto:false). Diese sind für den Sub noch unsichtbar — der Keyholder sieht hier, was in der
   *  Pipeline liegt, und kann sie via `withdraw` stornieren. Auto-/Zufalls-Kontrollen (auto:true)
   *  sind bewusst NICHT enthalten (Überraschungseffekt). */
  scheduledDirectives: ScheduledDirective[];
  /** Gepinnte, dauerhafte Anweisungen (DIRECTIVE) — fallen nie aus einem Recency-Fenster. */
  standingDirectives: NoteDTO[];
  /** Gepinnte Grenzen (BOUNDARY) mit doDont — unübersehbar. */
  boundaries: NoteDTO[];
  boxState: BoxStateView | null;
  /** Aktive Gesundheits-Zurückhaltung (§8) oder null. */
  healthHold: HealthHoldView | null;
}

/** Eine vom Keyholder terminierte, noch nicht ausgelöste Direktive (für scheduledDirectives). */
export interface ScheduledDirective {
  id: string;
  /** lock_request = Einschliess-Anforderung · lock_period = Sperrzeit · inspection = manuelle Kontrolle. */
  kind: "lock_request" | "lock_period" | "inspection";
  /** Geplanter Auslöse-Zeitpunkt (ISO-8601 mit Offset). */
  wirksamAb: string;
  /** Frist/Sperrzeit-Ende (ISO) — bei Kontrollen die Erfüllungs-Frist, bei Sperrzeit das Ende, sonst null. */
  endetAt: string | null;
  /** Freitext: Kontroll-Kommentar bzw. Anforderungs-/Sperrzeit-Nachricht. */
  message: string | null;
  /** Nur lock_request/lock_period: erlaubt die (geplante) Sperre Reinigungsöffnungen? Deckt die
   *  „Text sagt Reinigung erlaubt, Flag steht aber auf false"-Falle auf. null bei inspection. */
  reinigungErlaubt: boolean | null;
}

/** Lädt die vom Keyholder terminierten, noch nicht ausgelösten Direktiven (wirksamAb > now):
 *  VerschlussAnforderung (ANFORDERUNG/SPERRZEIT) + MANUELLE Kontrollen (auto:false).
 *  Auto-Kontrollen werden bewusst NICHT geladen. */
async function loadScheduledDirectives(userId: string, now: Date, iso: Iso): Promise<ScheduledDirective[]> {
  const [anforderungen, kontrollen] = await Promise.all([
    // Kein per-Query orderBy — die zusammengeführte Liste wird unten ohnehin nach wirksamAb sortiert.
    prisma.verschlussAnforderung.findMany({
      where: { userId, withdrawnAt: null, fulfilledAt: null, wirksamAb: { gt: now } },
    }),
    prisma.kontrollAnforderung.findMany({
      where: { userId, withdrawnAt: null, entryId: null, auto: false, wirksamAb: { gt: now } },
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
  const effectiveLocked = box.reportedLocked ?? box.locked;
  // Die Box öffnet sich auch OFFLINE an zwei deterministischen Punkten selbst: an der gecachten Frist
  // (`lockUntil`) und nach `offlineOpenHours` ohne Sync. Nur diese zwei Fälle entwerten den zuletzt
  // gemeldeten „zu"-Stand — sonst gilt er weiter, egal ob die Box gerade online ist. `offlineOpenHours`
  // fehlt bei Alt-Zeilen (vor dem Heimdall-Push) → dann entfällt der Offline-Term sicher.
  const staleLock =
    effectiveLocked &&
    ((box.lockUntil !== null && box.lockUntil <= now) ||
      (box.lastSyncAt !== null &&
        box.offlineOpenHours != null &&
        msToHours(now.getTime() - box.lastSyncAt.getTime()) >= box.offlineOpenHours));
  return {
    name: box.name,
    locked: box.locked,
    reportedLocked: box.reportedLocked,
    lockUntil: iso(box.lockUntil),
    hardwareEnforced: effectiveLocked && keyInBox !== false && !staleLock,
    staleLock,
    keyInBox,
    keySecured: box.reportedLocked === true && keyInBox === true && !staleLock,
    battery: box.battery,
    charging: box.charging,
    lastSeen: iso(box.lastSyncAt),
    // Math.max(0, …): eine Box, deren gemeldeter Sync minimal vor der Server-Uhr liegt (Netzwerk-
    // Latenz, leichte Uhr-Drift), soll nie eine negative "Alter"-Zahl liefern — das wäre selbst
    // wieder der Anlass für eine erfundene Zeitzonen-Theorie (siehe A-08-Kommentar oben).
    lastSeenAgeSeconds: box.lastSyncAt ? Math.max(0, Math.round((now.getTime() - box.lastSyncAt.getTime()) / 1000)) : null,
  };
}

export interface BoxStateResult extends Envelope {
  /** v3: hardwareEnforced ist IST-basiert (reportedLocked), staleLock ersetzt online,
   *  hardwareEnforcedEffective/online/lockUntilStale entfernt — rückwirkende Anerkennung der
   *  Semantik-Wechsel vom 16.07.2026 (v2-Payloads davor trugen die alte Bedeutung). */
  schemaVersion: 3;
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
  return { schemaVersion: 3, user: username, ...buildEnvelope(now, iso, timezone), boxState: mapBoxState(box, now, iso, keyInBox) };
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
  const [openKontrolleRow, activeSperrzeitRow, openLockRequestRow, interruptedSperrzeitRow, activeWearRows, openOrgasmusRow,
         rec, periods, ledger, pinned, boxRow, healthHold, scheduledDirectives] = await Promise.all([
    getOpenKontrolle(trackingCtx.userId, now),
    getActiveSperrzeit(trackingCtx.userId),
    getOpenLockRequest(trackingCtx.userId, now),
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
  const activeWearSessions = mapActiveWearSessions(activeWearRows, now, fmt);
  // Die Box-Sicht erbt die Schlüssel-Deklaration aus DEMSELBEN Lock-Zustand wie currentRun — die
  // beiden Felder einer Antwort können so nicht auseinanderlaufen, und es kostet keine Query.
  const boxState = mapBoxState(boxRow, now, iso, lock.keyInBox);

  // wornNow: KG-Lock (falls verschlossen) + aktive Wear-Sessions der Kategorien.
  const wornNow: DashboardResult["wornNow"] = [];
  if (lock.isLocked) {
    wornNow.push({ category: "KG", deviceName: lock.deviceName, since: lock.since, durationHours: lock.currentDurationHours });
  }
  for (const w of activeWearSessions) {
    wornNow.push({ category: w.category, deviceName: w.deviceName, since: w.since, durationHours: w.durationHours });
  }

  const openOffenseRows = ledger.offenses.filter((o) => o.status === "open");

  // CT-008: "today" enthält einen Anteil einer früheren Session, wenn die Kalendertag-Summe grösser
  // ist als der durchgehende aktuelle Lauf (bei Lauf-Start vor Mitternacht ist today kleiner → false).
  const todayIncludesPriorSession =
    rec.currentRunHours != null && periods.kg.today - rec.currentRunHours > ROUND_EPSILON_H;

  // CT-004: echte (cross-cluster) Bild-Diskrepanzen als Daten-Hinweis (keine Vergehen).
  const discrepancyItems = collectImageConflicts(sessions, iso);

  return {
    schemaVersion: 3,
    user: username,
    ...buildEnvelope(now, iso, trackingCtx.timezone),
    keyholderInstructions: trackingCtx.keyholderInstructions,
    currentRun: {
      isLocked: lock.isLocked,
      since: lock.since,
      currentSegmentSince: lock.currentSegmentSince,
      durationHours: lock.currentDurationHours,
      deviceName: lock.deviceName,
      personalBestHours: rec.longestRunHours,
      vsPersonalBestPct: rec.currentRunVsPbPct,
      todayIncludesPriorSession,
      keyInBox: lock.keyInBox,
    },
    dataDiscrepancies: { count: discrepancyItems.length, items: discrepancyItems.slice(0, 5) },
    wornNow,
    nextRelevant: {
      openControl: mapOpenKontrolle(openKontrolleRow, now, fmt),
      activeLockPeriod: mapActiveSperrzeit(activeSperrzeitRow, now, fmt),
      // Eine laufende Sperrzeit LÖST die unterbrochene AB: die Keyholderin hat auf den Bruch
      // geantwortet, die alte muss nicht weiter angemahnt werden. Ohne diese Ablösung bliebe eine
      // UNBEFRISTETE unterbrochene Sperrzeit (`endetAt: null`) für immer stehen — sie läuft nie ab,
      // und jeder Withdraw-Pfad filtert auf `withdrawnAt: null`, greift bei ihr also nicht mehr.
      // Sie wäre ein Dauer-Gespenst im Dashboard, das niemand mehr wegbekommt.
      interruptedLockPeriod: activeSperrzeitRow ? null : mapInterruptedSperrzeit(interruptedSperrzeitRow, fmt),
      openOrgasmWindow: mapOpenOrgasmusAnforderung(openOrgasmusRow, now, fmt),
      openLockRequest: mapOpenLockRequest(openLockRequestRow, now, fmt),
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
