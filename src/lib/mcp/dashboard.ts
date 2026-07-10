import { prisma } from "@/lib/prisma";
import { getOpenKontrolle, getActiveSperrzeit, getActiveWearSessions, getActiveOrgasmusAnforderung } from "@/lib/queries";
import {
  buildLockState, mapOpenKontrolle, mapActiveSperrzeit, mapOpenOrgasmusAnforderung,
  mapActiveWearSessions,
  type Fmt, type OpenKontrolleView, type ActiveSperrzeitView, type OpenOrgasmusAnforderungView,
} from "@/lib/mcp/liveState";
import { makeIso, resolveUserContext, loadTrackingContext, type Iso, type NoteDTO } from "@/lib/mcp/common";
import { buildSessions, type Session } from "@/lib/mcp/segments";
import { records, periodSummary, type PeriodSummaryResult } from "@/lib/mcp/stats";
import { getOffenses, type OffenseRow } from "@/lib/mcp/ledger";
import { queryNotes } from "@/lib/mcp/notes";
import { loadActiveHealthHold, type HealthHoldView } from "@/lib/mcp/context";

/** keyholder_dashboard (§0/§12) — EIN Call, der 90 % der Keyholder-Fragen beantwortet: aktueller
 *  Lauf vs. Personal Best, was JETZT getragen wird (alle Kategorien), das Nächst-Relevante, Ziele +
 *  Adhärenz, offene Vergehen, gepinnte Direktiven + Grenzen, BoxState. Komponiert die V2/V1-
 *  Aggregate — rein lesend, MCP-only. */

export interface BoxStateView {
  name: string;
  locked: boolean;
  lockUntil: string | null;
  /** Konfigurierte ABSICHT (letzter von Heimdall gemeldeter Wert): true = Sperrzeit soll die Box
   *  physisch halten. Bleibt unverändert stehen, solange die Box nicht wieder synct — bei offline
   *  KEINE Garantie, dass gerade tatsächlich vollstreckt wird. Für die reale Lage `hardwareEnforcedEffective`. */
  hardwareEnforced: boolean;
  /** Reale Vollstreckung JETZT: nur true, wenn die Box sowohl online ist als auch hardwareEnforced
   *  meldet. Offline → immer false (nicht verifizierbar; Box kann nicht mehr lokal blockieren) —
   *  die Sperre ist dann faktisch Ehrensache, unabhängig vom zuletzt gemeldeten Zustand. */
  hardwareEnforcedEffective: boolean;
  /** true = lockUntil liegt in der Vergangenheit UND die Box hat seither nicht mehr gesynct (online:false)
   *  — der Wert ist veraltet/unbestätigt, nicht zwingend noch gültig. */
  lockUntilStale: boolean;
  battery: number | null;
  charging: boolean | null;
  online: boolean;
  lastSeen: string | null;
}

export interface DashboardResult {
  schemaVersion: 2;
  user: string;
  generatedAt: string;
  timezone: string;
  /** Freitext-Regeln des menschlichen Keyholders (mcpKeyholderInstructions) — bewusst als erstes
   *  Inhaltsfeld: alle Direktiven/Writes müssen diese Regeln befolgen. null = keine gesetzt. */
  keyholderInstructions: string | null;
  currentRun: {
    isLocked: boolean;
    since: string | null;
    durationHours: number | null;
    deviceName: string | null;
    personalBestHours: number;
    vsPersonalBestPct: number | null;
    /** true, wenn goals.kg.today einen Anteil einer FRÜHEREN (heute geendeten) Session enthält —
     *  dann ist `today` grösser als der durchgehende `durationHours`, ist also NICHT die Lauf-Dauer. */
    todayIncludesPriorSession: boolean;
  };
  /** Echte (nicht cluster-interne) Bild-Diskrepanzen als reiner Daten-Hinweis — KEINE Vergehen
   *  (eine Routine-Kontrolle hat kein verlangtes Gerät). Cluster-interne Verwechslungen sind hier
   *  bewusst ausgeblendet. */
  dataDiscrepancies: { count: number; items: DiscrepancyItem[] };
  /** Was JETZT getragen wird — KG + alle Kategorien vereint. */
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
   *  dessen Nachricht — beides bisher nur im veralteten `get_overview` sichtbar. */
  nextRelevant: {
    openControl: OpenKontrolleView | null;
    activeLockPeriod: ActiveSperrzeitView | null;
    openOrgasmWindow: OpenOrgasmusAnforderungView | null;
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

const BOX_ONLINE_THRESHOLD_MS = 10 * 60 * 1000;
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

async function loadBoxState(userId: string, now: Date, iso: Iso): Promise<BoxStateView | null> {
  const box = await prisma.boxStatus.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!box) return null;
  const online = box.lastSyncAt ? now.getTime() - box.lastSyncAt.getTime() < BOX_ONLINE_THRESHOLD_MS : false;
  return {
    name: box.name,
    locked: box.locked,
    lockUntil: iso(box.lockUntil),
    hardwareEnforced: box.keyholderLocked,
    hardwareEnforcedEffective: online && box.keyholderLocked,
    lockUntilStale: !online && box.lockUntil !== null && box.lockUntil < now,
    battery: box.battery,
    charging: box.charging,
    online,
    lastSeen: iso(box.lastSyncAt),
  };
}

export interface BoxStateResult {
  schemaVersion: 2;
  user: string;
  boxState: BoxStateView | null;
}

/** Dedizierter BoxState-Read (§11): hardwareEnforced unterscheidet physische Vollstreckung von
 *  Ehrensache. null = keine Box registriert. Throws, wenn der User unbekannt ist. */
export async function getBoxState(username: string): Promise<BoxStateResult> {
  const { id: userId, timezone } = await resolveUserContext(username);
  return { schemaVersion: 2, user: username, boxState: await loadBoxState(userId, new Date(), makeIso(timezone)) };
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
  const fmt: Fmt = (d) => iso(d)!;
  // Sessions EINMAL bauen und teilen (records + dataDiscrepancies), statt buildSessions doppelt.
  const sessions = buildSessions(trackingCtx.entries, trackingCtx.reinigung, now, trackingCtx.devices);

  // Live-Zustand direkt aus der Helfer-Schicht (mcp/liveState.ts) — nicht mehr durch die fertige
  // V1-Antwort von buildOverview hindurch, die ~14 weitere Felder samt vier ungenutzter Queries
  // (Strafen-Zähler, Keyholder-Notizen, Reinigungs-Verbrauch, offene Verschluss-Anforderung) baute.
  const [openKontrolleRow, activeSperrzeitRow, activeWearRows, openOrgasmusRow,
         rec, periods, ledger, pinned, boxState, healthHold, scheduledDirectives] = await Promise.all([
    getOpenKontrolle(trackingCtx.userId, now),
    getActiveSperrzeit(trackingCtx.userId),
    getActiveWearSessions(trackingCtx.userId),
    getActiveOrgasmusAnforderung(trackingCtx.userId, now),
    records(username, trackingCtx, sessions),
    periodSummary(username, trackingCtx),
    getOffenses(username),
    queryNotes(username, { pinned: true, status: "active", limit: 50 }),
    loadBoxState(trackingCtx.userId, now, iso),
    loadActiveHealthHold(trackingCtx.userId, iso),
    loadScheduledDirectives(trackingCtx.userId, now, iso),
  ]);

  const lock = buildLockState(trackingCtx.entries, trackingCtx.reinigung, now, fmt);
  const activeWearSessions = mapActiveWearSessions(activeWearRows, now, fmt);

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
    schemaVersion: 2,
    user: username,
    generatedAt: iso(now)!,
    timezone: trackingCtx.timezone,
    keyholderInstructions: trackingCtx.keyholderInstructions,
    currentRun: {
      isLocked: lock.isLocked,
      since: lock.since,
      durationHours: lock.currentDurationHours,
      deviceName: lock.deviceName,
      personalBestHours: rec.longestRunHours,
      vsPersonalBestPct: rec.currentRunVsPbPct,
      todayIncludesPriorSession,
    },
    dataDiscrepancies: { count: discrepancyItems.length, items: discrepancyItems.slice(0, 5) },
    wornNow,
    nextRelevant: {
      openControl: mapOpenKontrolle(openKontrolleRow, now, fmt),
      activeLockPeriod: mapActiveSperrzeit(activeSperrzeitRow, now, fmt),
      openOrgasmWindow: mapOpenOrgasmusAnforderung(openOrgasmusRow, now, fmt),
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
