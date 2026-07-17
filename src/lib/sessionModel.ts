import { buildPairs, mergeWearPairs, msToHours, type ReinigungSettings, WEAR_PAIR, type WearPair } from "@/lib/utils";

/**
 * Das Session-Modell — EINE Definition von „Session", geteilt von der MCP-Schicht und der UI.
 * Es liegt bewusst neutral in `src/lib/` (nicht unter `src/lib/mcp/`): das Dashboard baut seine
 * Trage-Session-Zeilen aus derselben Quelle, sonst driften zwei Session-Begriffe auseinander.
 *
 * „Abgeleitete Wahrheit": eine KG-Session zerfällt an REINIGUNG-Öffnungen in Segmente,
 * pro Segment GENAU EIN getragenes Gerät. Damit ist die „welches Gerät war Session X?"-Frage
 * korrekt als `deviceBreakdown` beantwortbar (z.B. 103 h = Flatty 66 / Kink-Knack 28 / Pink S 10).
 *
 * Rein lesend & berechnet — KEINE Persistenz, KEIN Eingriff in Tracker-Kernlogik. Setzt nur auf
 * dem bestehenden `buildPairs` (geteilt mit dem Tracker, hier nur konsumiert) auf.
 *
 * Segment-/Session-IDs sind die jeweilige Lock-Entry-id (stabil, ohne neue Tabelle) — so kann
 * eine NoteRef.entityId zuverlässig auf ein Segment bzw. eine Session zeigen.
 */

/** Minimal-Form eines Entrys, wie ihn buildOverview/listSessions bereits laden. */
export interface SegmentEntry {
  id: string;
  type: string;
  startTime: Date;
  oeffnenGrund?: string | null;
  kontrollCode?: string | null;
  verifikationStatus?: string | null;
  deviceCheck?: string | null;
  deviceCheckNote?: string | null;
  deviceCheckExpected?: string | null;
  device?: { id?: string | null; name?: string | null; categoryId?: string | null } | null;
}

export interface DeviceRef {
  id: string | null;
  name: string | null;
}

/** Geräte-Stammdaten, soweit das Session-Modell sie braucht: Name↔id-Auflösung + Lookalike-Cluster. */
export interface DeviceMeta {
  id: string;
  name: string;
  lookalikeClusterId: string | null;
}

/** Eine Kontrolle (PRUEFUNG), die zeitlich in ein Segment fällt. */
export interface LinkedControl {
  controlId: string;
  time: Date;
  code: string | null;
  verifikationStatus: string | null;
  /** Dreiwertig: ok | wrong | missing | null (nicht geprüft). */
  deviceCheckStatus: string | null;
  detected: string | null;
  expected: string | null;
}

/** "declared" = nur Label; "undeclared" = KEIN Gerät angegeben und keine Kontrolle, die eines
 *    nennen könnte (A-04, MCP-Befundliste 2026-07-17: vorher fiel dieser Fall fälschlich auf
 *    "declared" zurück — sah aus wie eine saubere Angabe, obwohl gar keine vorlag);
 *  "image-confirmed" = Bild bestätigt das Label;
 *  "image-conflict" = Bild widerspricht dem Label aus EINEM ANDEREN Cluster → das Bild gewinnt
 *    (deviceEffective = verifiziert); "cluster-ambiguous" = Bild nennt ein optisch gleiches Gerät
 *    aus DEMSELBEN lookalikeCluster → unzuverlässig, soft, deklariert bleibt (kein echter Konflikt). */
export type DeviceConfidence = "declared" | "undeclared" | "image-confirmed" | "image-conflict" | "cluster-ambiguous";

export interface Segment {
  /** Lock-Entry-id des Segment-Kopfs — stabile Segment-id (für NoteRef). */
  id: string;
  sessionId: string;
  index: number;
  start: Date;
  /** null = Segment noch offen (laufende Session, letztes Segment). */
  end: Date | null;
  durationMs: number;
  /** Deklariertes (am Lock-Entry hinterlegtes) Gerät dieses Segments. */
  deviceDeclared: DeviceRef;
  /** Aus Bildkontrollen abgeleitetes Gerät; null, wenn keine aussagekräftige Kontrolle vorliegt. */
  deviceVerified: DeviceRef | null;
  deviceConfidence: DeviceConfidence;
  /** Das für Tragezeit-Zurechnung MASSGEBLICHE Gerät: bei echtem image-conflict das verifizierte
   *  (Bild gewinnt), sonst das deklarierte. deviceBreakdown + device_stats rechnen hierauf. */
  deviceEffective: DeviceRef;
  /** Wie das Segment endete: cleaning = Reinigungspause folgt; session-end = Session zu Ende; open = läuft. */
  endedBy: "cleaning" | "session-end" | "open";
  controls: LinkedControl[];
}

export interface DeviceBreakdownRow {
  deviceId: string | null;
  deviceName: string | null;
  hours: number;
}

export interface Session {
  /** Lock-Entry-id des Session-Kopfs — stabile Session-id (für NoteRef). */
  id: string;
  start: Date;
  end: Date | null;
  isOpen: boolean;
  /** Interruption-bereinigte Tragedauer (Summe der Segment-Dauern, Pausen exkludiert). */
  durationMs: number;
  endReason: "open" | "closed";
  segments: Segment[];
  /** Tragestunden je Gerät über die ganze Session — die korrekte Antwort auf "welches Gerät". */
  deviceBreakdown: DeviceBreakdownRow[];
  /** Anzahl Reinigungspausen (= Segment-Grenzen innerhalb der Session). Bei WEAR immer 0. */
  cleaningPauses: number;
  /** Kategorie des Geräts am Session-Kopf. null = Alt-Verschluss ohne Gerät (nur KG möglich). */
  categoryId: string | null;
  /** True nur für ein Pair, das die "zwei Schliess-Einträge ohne Öffnen dazwischen"-Anomalie
   *  abbildet (buildPairs). `isOpen` ist dafür bewusst `true` (Invariant), aber die Session ist
   *  KEINE echte aktuell laufende Session — Konsumenten der "current session" müssen das
   *  ausschliessen (siehe `records()`, `liveState.ts`, dashboard/admin `pairs.find(p => p.active)`). */
  orphaned: boolean;
}

/** Ein einzelnes `buildPairs`-Ergebnis (eine KG-Session vor der Segmentierung). Exportiert, damit
 *  ein Aufrufer, der die Paare selbst schon braucht (z.B. `keyholder_dashboard` für `buildLockState`),
 *  sie EINMAL bauen und hier als `pairs`-Parameter durchreichen kann statt `buildPairs` doppelt laufen
 *  zu lassen. */
export type SessionPair = ReturnType<typeof buildPairs<SegmentEntry, never>>[number];

const deviceRefOf = (e: SegmentEntry): DeviceRef => ({
  id: e.device?.id ?? null,
  name: e.device?.name ?? null,
});

/** Gruppierungs-Schlüssel je Gerät (id, sonst Name-Fallback) — geteilt von deviceBreakdown + device_stats. */
export const deviceGroupKey = (d: DeviceRef): string => d.id ?? `name:${d.name ?? "—"}`;

/** Anzeigename eines Geräts; legacy-/untracked-Segmente ohne Zuordnung klar labeln statt null/null. */
export const UNASSIGNED_DEVICE_LABEL = "(ohne Gerät / unzugeordnet)";
/** Der Sammel-Posten ohne Geräte-Zuordnung: weder id noch Name. Quell-Wahrheit zum Label oben —
 *  NICHT über den Anzeigenamen matchen (ein Name-only-Gerät könnte zufällig so heissen). */
export const isUnassignedDevice = (d: DeviceRef): boolean => d.id == null && d.name == null;
export const deviceDisplayName = (d: DeviceRef): string | null => d.name ?? (d.id ? null : UNASSIGNED_DEVICE_LABEL);

/** Das für die Tragezeit-Zurechnung massgebliche Gerät: bei echtem image-conflict gewinnt das Bild
 *  (verifiziert ist dort garantiert gesetzt), sonst das deklarierte. EINE Quelle dieser Regel. */
export const effectiveDevice = (declared: DeviceRef, verified: DeviceRef | null, confidence: DeviceConfidence): DeviceRef =>
  confidence === "image-conflict" ? verified! : declared;

/** Mappt die in dieses Segment fallenden PRUEFUNG-Entries auf LinkedControl.
 *  `controls` ist bereits chronologisch aufsteigend sortiert (einmal in buildSessions). */
function linkControls(controls: SegmentEntry[], start: Date, end: Date | null, now: Date): LinkedControl[] {
  const upper = (end ?? now).getTime();
  return controls
    .filter((c) => c.startTime.getTime() >= start.getTime() && c.startTime.getTime() <= upper)
    .map((c) => ({
      controlId: c.id,
      time: c.startTime,
      code: c.kontrollCode ?? null,
      verifikationStatus: c.verifikationStatus ?? null,
      deviceCheckStatus: c.deviceCheck ?? null,
      detected: c.deviceCheckNote ?? null,
      expected: c.deviceCheckExpected ?? null,
    }));
}

/** Lookups zur Geräte-Auflösung: Name→id und id→Cluster (für die Bild-Versöhnung). */
interface DeviceLookups {
  idByName: Map<string, string>;
  clusterById: Map<string, string | null>;
}

const normalizeName = (s: string) => s.trim().toLowerCase();

/** Ohne Kontrollen wird nie versöhnt — die Lookups blieben ungenutzt. Sie zu übergeben behauptete
 *  eine Bild-Versöhnung, die bei WEAR gar nicht stattfindet. */
const NO_LOOKUPS: DeviceLookups = { idByName: new Map(), clusterById: new Map() };

function buildDeviceLookups(devices: DeviceMeta[]): DeviceLookups {
  const idByName = new Map<string, string>();
  const ambiguous = new Set<string>();
  const clusterById = new Map<string, string | null>();
  for (const d of devices) {
    const key = normalizeName(d.name);
    // Mehrdeutige Namen (zwei Geräte gleichen Namens) → unauflösbar, statt still last-wins.
    if (idByName.has(key) && idByName.get(key) !== d.id) ambiguous.add(key);
    else idByName.set(key, d.id);
    clusterById.set(d.id, d.lookalikeClusterId);
  }
  for (const k of ambiguous) idByName.delete(k);
  return { idByName, clusterById };
}

/** Versöhnt deklariertes Gerät mit der Bildkontrolle. Bei "wrong" entscheidet der Lookalike-Cluster:
 *  - erkanntes & deklariertes Gerät im SELBEN Cluster → Bild ist unzuverlässig (optisch gleich) →
 *    soft `cluster-ambiguous`, deklariert bleibt massgeblich (kein echter Konflikt, §3.1/§5.3).
 *  - sonst (anderer/kein Cluster) → echter `image-conflict`, das Bild gewinnt → verifiziertes Gerät
 *    (mit aufgelöster id) ist massgeblich. */
function reconcileDevice(
  declared: DeviceRef,
  controls: LinkedControl[],
  lookups: DeviceLookups,
): { verified: DeviceRef | null; confidence: DeviceConfidence } {
  // Jüngste Kontrolle mit verwertbarem Geräte-Check (ok | wrong + erkanntes Gerät).
  const decisive = controls.findLast(
    (c) => (c.deviceCheckStatus === "ok" || c.deviceCheckStatus === "wrong") && c.detected != null,
  );
  // Ohne verwertbare Kontrolle: kein Gerät angegeben ist ein anderer Fall als ein Gerät angegeben,
  // das nur (noch) nicht bildbestätigt wurde — "declared" täuschte bisher beides als dieselbe,
  // saubere Datenlage vor (A-04).
  if (!decisive) return { verified: null, confidence: isUnassignedDevice(declared) ? "undeclared" : "declared" };
  if (decisive.deviceCheckStatus === "ok") return { verified: declared, confidence: "image-confirmed" };
  // wrong: erkannten Namen auf eine Device-id zurückmappen (sonst null = unbekanntes Gerät).
  const detectedId = lookups.idByName.get(normalizeName(decisive.detected!)) ?? null;
  const verified: DeviceRef = { id: detectedId, name: decisive.detected };
  const declaredCluster = declared.id ? lookups.clusterById.get(declared.id) : null;
  const detectedCluster = detectedId ? lookups.clusterById.get(detectedId) : null;
  // Optisch gleiches Gerät aus demselben Cluster → Bild unzuverlässig, deklariert bleibt (soft).
  if (declaredCluster && detectedCluster && declaredCluster === detectedCluster) {
    return { verified, confidence: "cluster-ambiguous" };
  }
  // Echter Konflikt über Cluster-Grenze → Bild gewinnt (deviceEffective greift das via Helper auf).
  return { verified, confidence: "image-conflict" };
}

/** Zerlegt EIN buildPairs-Pair (eine Session) in seine Segmente. */
function segmentsOfPair(pair: SessionPair, controls: SegmentEntry[], now: Date, lookups: DeviceLookups): Segment[] {
  const sessionId = pair.verschluss.id;
  const heads: SegmentEntry[] = [pair.verschluss, ...pair.interruptions.map((i) => i.verschluss)];
  const out: Segment[] = [];

  for (let k = 0; k < heads.length; k++) {
    const head = heads[k];
    const isLast = k === pair.interruptions.length;
    // Segment endet an der nächsten Reinigungsöffnung, sonst am Session-Ende (oder offen).
    const end: Date | null = isLast
      ? (pair.oeffnen ? pair.oeffnen.startTime : null)
      : pair.interruptions[k].oeffnen.startTime;
    const linked = linkControls(controls, head.startTime, end, now);
    const declared = deviceRefOf(head);
    const { verified, confidence } = reconcileDevice(declared, linked, lookups);
    const effectiveEnd = (end ?? now).getTime();
    out.push({
      id: head.id,
      sessionId,
      index: k,
      start: head.startTime,
      end,
      durationMs: Math.max(0, effectiveEnd - head.startTime.getTime()),
      deviceDeclared: declared,
      deviceVerified: verified,
      deviceConfidence: confidence,
      deviceEffective: effectiveDevice(declared, verified, confidence),
      endedBy: isLast ? (end ? "session-end" : "open") : "cleaning",
      controls: linked,
    });
  }
  return out;
}

/** Summiert die Segment-Tragezeit je Gerät zur deviceBreakdown der Session — nach dem
 *  MASSGEBLICHEN Gerät (deviceEffective), damit "Bild gewinnt" bei echtem Konflikt durchschlägt. */
function breakdownOf(segments: Segment[]): DeviceBreakdownRow[] {
  return [...segmentsByDevice(segments).values()]
    .map((r) => ({
      deviceId: r.device.id,
      deviceName: deviceDisplayName(r.device),
      hours: msToHours(r.durationMs),
    }))
    .sort((a, b) => b.hours - a.hours);
}

/** Was ein Gerät INNERHALB einer Session getragen wurde: seine Segmente zu EINER Strecke summiert,
 *  `start` ist ihr frühestes Segment. */
export interface DeviceWearing {
  device: DeviceRef;
  start: Date;
  durationMs: number;
}

/**
 * Die Segmente einer Session nach ihrem MASSGEBLICHEN Gerät (`deviceEffective` — bei echtem
 * Bild-Konflikt gewinnt das Bild) gruppiert: je Gerät EIN Eintrag.
 *
 * DIE Zurechnungs-Regel „welches Gerät wurde in dieser Session wie lange getragen" — geteilt von
 * `deviceBreakdown` (Session-Detail), `device_stats` (MCP) und der Geräte-Nutzungs-Karte (UI).
 * Sie darf nur einmal existieren: sonst nennen Chat und Statistik-Seite verschiedene Geräte zur
 * selben Session (ein Gerätewechsel über eine Reinigungspause, ein Bild-Konflikt).
 *
 * Zugleich die Antwort auf „wie oft wurde ein Gerät getragen": je Session EIN Eintrag pro Gerät —
 * eine Reinigungspause zerlegt eine durchgehende Tragezeit nicht in mehrere Nutzungen.
 */
export function segmentsByDevice(segments: Segment[]): Map<string, DeviceWearing> {
  const byDevice = new Map<string, DeviceWearing>();
  for (const s of segments) {
    const key = deviceGroupKey(s.deviceEffective);
    const cur = byDevice.get(key);
    if (cur) {
      cur.durationMs += s.durationMs;
      if (s.start < cur.start) cur.start = s.start;
    } else {
      byDevice.set(key, { device: s.deviceEffective, start: s.start, durationMs: s.durationMs });
    }
  }
  return byDevice;
}

/** Alle Geräte-Strecken einer Session-Liste, flach — die Eingabe jeder Geräte-Auswertung.
 *  Eine Session mit zwei Geräten (Wechsel über eine Reinigungspause) liefert zwei Einträge. */
export function deviceWearingsOf(sessions: Session[]): DeviceWearing[] {
  return sessions.flatMap((s) => [...segmentsByDevice(s.segments).values()]);
}

/** Ein Paar → eine Session. Geteilt von KG und WEAR: die SESSION-Form ist dieselbe, nur ihr Inhalt
 *  unterscheidet sich (WEAR hat weder Reinigungspausen noch Kontrollen, also genau ein Segment mit
 *  `deviceConfidence: "declared"` — das fällt hier von selbst heraus, ohne Sonderfall). */
function sessionOfPair(pair: SessionPair, controls: SegmentEntry[], now: Date, lookups: DeviceLookups): Session {
  const segments = segmentsOfPair(pair, controls, now, lookups);
  const isOpen = pair.active && pair.oeffnen === null;
  return {
    id: pair.verschluss.id,
    start: pair.verschluss.startTime,
    end: pair.oeffnen ? pair.oeffnen.startTime : null,
    isOpen,
    durationMs: segments.reduce((s, seg) => s + seg.durationMs, 0),
    endReason: isOpen ? "open" : "closed",
    segments,
    deviceBreakdown: breakdownOf(segments),
    cleaningPauses: pair.interruptions.length,
    categoryId: pair.verschluss.device?.categoryId ?? null,
    orphaned: !!pair.orphaned,
  };
}

/** Baut die vollständigen KG-Sessions (mit Segmenten + deviceBreakdown), neueste zuerst.
 *  `devices` liefert die Name↔id-Auflösung + Lookalike-Cluster für die Bild-Versöhnung
 *  (leer = keine Cluster-Softening). `prePairs`: schon gebaute `buildPairs`-Paare
 *  (z.B. von einem Aufrufer, der sie auch für `buildLockState` braucht) wiederverwenden statt
 *  `buildPairs` erneut über dieselben Entries laufen zu lassen. */
export function buildSessions(entries: SegmentEntry[], reinigung: ReinigungSettings, now: Date = new Date(), devices: DeviceMeta[] = [], prePairs?: SessionPair[]): Session[] {
  const pairs = prePairs ?? buildPairs<SegmentEntry, never>(entries, [], reinigung);
  const lookups = buildDeviceLookups(devices);
  // Einmal chronologisch sortieren; linkControls filtert je Segment ordnungserhaltend.
  const controls = entries
    .filter((e) => e.type === "PRUEFUNG")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return pairs.map((pair) => sessionOfPair(pair, controls, now, lookups));
}

/** Ist diese Session die tatsächlich aktuell laufende? `isOpen` allein reicht nicht: eine verwaiste
 *  Session (siehe `Session.orphaned`) ist technisch `isOpen:true` (Invariant), aber keine echte
 *  laufende Session. EINZIGE Stelle für diesen Check (analog `getOpenPair` in utils.ts). */
export function isLiveOpenSession(s: { isOpen: boolean; orphaned: boolean }): boolean {
  return s.isOpen && !s.orphaned;
}

/**
 * Die Trage-Sessions der NICHT-KG-Kategorien (Plug, Halsband, Knebel …) — dieselbe `Session`-Form
 * wie KG, damit ein Keyholder sie nebeneinander lesen kann.
 *
 * Bis v4.50.37 gab es dafür gar nichts: `buildSessions` kennt nur VERSCHLUSS/OEFFNEN, und das
 * einzige Tool, das Nicht-KG-Sessions je auflistete (`list_sessions`), fiel mit der V1-Schicht weg.
 *
 * JE GERÄT gepaart, nicht je Kategorie: zwei Plugs derselben Kategorie können gleichzeitig getragen
 * werden, und eine kategorie-weite Paarung schlösse das Ende des einen auf den Beginn des anderen.
 * (Dieselbe Regel führt `getActiveWearSessions` für den Live-Zustand.)
 *
 * Keine Kontrollen: eine PRUEFUNG belegt den KEUSCHHEITSGÜRTEL, nicht den Plug. Damit auch keine
 * Bild-Versöhnung — das Gerät ist, was der Eintrag sagt.
 */
export function buildWearSessions(entries: SegmentEntry[], now: Date = new Date()): Session[] {
  const byDevice = new Map<string, SegmentEntry[]>();
  for (const e of entries) {
    if (e.type !== "WEAR_BEGIN" && e.type !== "WEAR_END") continue;
    const deviceId = e.device?.id;
    if (!deviceId) continue; // WEAR verlangt ein Gerät — defensiv.
    const list = byDevice.get(deviceId);
    if (list) list.push(e);
    else byDevice.set(deviceId, [e]);
  }

  const sessions: Session[] = [];
  for (const list of byDevice.values()) {
    for (const pair of buildPairs<SegmentEntry, never>(list, [], { types: WEAR_PAIR })) {
      // Ein WEAR_BEGIN ohne Ende, das NICHT die laufende Session ist, ist eine Daten-Anomalie
      // (zwei Beginne hintereinander) — keine Session daraus erfinden. buildPairs markiert so ein
      // Pair inzwischen `orphaned` (statt `active:false`) — das ist der massgebliche Check hier.
      if (pair.orphaned) continue;
      sessions.push(sessionOfPair(pair, [], now, NO_LOOKUPS));
    }
  }
  return sessions.sort((a, b) => b.start.getTime() - a.start.getTime());
}

/**
 * Die Trage-Intervalle JE KATEGORIE — aus fertigen Sessions, also je GERÄT gepaart. Laufende
 * Sessions enden bei `now`.
 *
 * Nimmt bewusst `Session[]` und nicht `entries`: der Aufrufer baut die Sessions EINMAL
 * (`buildWearSessions`) und leitet alle Sichten daraus ab — sonst paart dieselbe Seite dieselben
 * Einträge zwei- bis dreimal.
 *
 * Die Intervalle KÖNNEN sich überlappen: zwei Plugs derselben Kategorie gleichzeitig getragen =
 * zwei Intervalle über denselben Zeitraum. Für SESSION-Kennzahlen (Anzahl, längste, Ø-Dauer) ist
 * genau das gewollt. Wer STUNDEN zählt, nimmt `wearHourPairsByCategory` — sonst zählt dieselbe
 * Stunde doppelt.
 */
export function wearSessionPairsByCategory(sessions: Session[], now: Date = new Date()): Map<string, WearPair[]> {
  const byCategory = new Map<string, WearPair[]>();
  for (const s of sessions) {
    if (!s.categoryId) continue;
    const pair: WearPair = { start: s.start, end: s.end ?? now };
    const list = byCategory.get(s.categoryId);
    if (list) list.push(pair);
    else byCategory.set(s.categoryId, [pair]);
  }
  return byCategory;
}

/** Dieselben Intervalle als WANDUHR-Zeit je Kategorie: Überlappungen verschmolzen, damit zwei
 *  gleichzeitig getragene Plugs 2 h zählen und nicht 4 h. Basis für Tragestunden UND
 *  Ziel-Erfüllung (TrainingVorgabe) — ein Ziel „4 h Plug pro Tag" meint 4 Stunden am Tag,
 *  unabhängig von der Zahl der Geräte. */
export function wearHourPairsByCategory(sessions: Session[], now: Date = new Date()): Map<string, WearPair[]> {
  const byCategory = wearSessionPairsByCategory(sessions, now);
  for (const [categoryId, pairs] of byCategory) byCategory.set(categoryId, mergeWearPairs(pairs));
  return byCategory;
}
