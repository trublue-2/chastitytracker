import { prisma } from "@/lib/prisma";
import { buildOverview } from "@/lib/mcpOverview";
import { iso, APP_TZ, resolveUserId, loadTrackingContext, type NoteDTO } from "@/lib/mcp/common";
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
  /** true = Tracker-Sperrzeit hält die Box physisch (Sub kann lokal nicht öffnen). */
  hardwareEnforced: boolean;
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
   *  Zeiten ISO-8601 mit Offset (buildOverview wird mit iso:true komponiert); zusätzlich
   *  remainingMinutes/overdue für direkte Fristfragen. Beim Orgasmus-Fenster zeigt `active` an,
   *  ob der Start (`beginntAt`) schon erreicht ist — `active:false` = geplant, läuft noch NICHT
   *  (remainingMinutes zählt bis `endetAt`). */
  nextRelevant: {
    openControl: { code: string; deadline: string; overdue: boolean; remainingMinutes: number } | null;
    activeLockPeriod: { endetAt: string | null; indefinite: boolean; remainingMinutes: number | null } | null;
    openOrgasmWindow: { art: string; beginntAt: string; endetAt: string; active: boolean; requiredType: string | null; remainingMinutes: number } | null;
  };
  goals: { kg: PeriodSummaryResult["kg"]; categories: PeriodSummaryResult["categories"] };
  openOffenses: { count: number; pendingPenalties: number; top: OffenseRow[] };
  /** Gepinnte, dauerhafte Anweisungen (DIRECTIVE) — fallen nie aus einem Recency-Fenster. */
  standingDirectives: NoteDTO[];
  /** Gepinnte Grenzen (BOUNDARY) mit doDont — unübersehbar. */
  boundaries: NoteDTO[];
  boxState: BoxStateView | null;
  /** Aktive Gesundheits-Zurückhaltung (§8) oder null. */
  healthHold: HealthHoldView | null;
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
function collectImageConflicts(sessions: Session[]): DiscrepancyItem[] {
  return sessions.flatMap((s) =>
    s.segments
      .filter((seg) => seg.deviceConfidence === "image-conflict")
      .map((seg) => ({ sessionId: s.id, segmentIndex: seg.index, declared: seg.deviceDeclared.name, detected: seg.deviceVerified?.name ?? null, at: iso(seg.start)! })),
  );
}

async function loadBoxState(userId: string, now: Date): Promise<BoxStateView | null> {
  const box = await prisma.boxStatus.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  if (!box) return null;
  return {
    name: box.name,
    locked: box.locked,
    lockUntil: iso(box.lockUntil),
    hardwareEnforced: box.keyholderLocked,
    battery: box.battery,
    charging: box.charging,
    online: box.lastSyncAt ? now.getTime() - box.lastSyncAt.getTime() < BOX_ONLINE_THRESHOLD_MS : false,
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
  const userId = await resolveUserId(username);
  return { schemaVersion: 2, user: username, boxState: await loadBoxState(userId, new Date()) };
}

/** Baut das Dashboard durch Komposition der Aggregate. Throws, wenn der User unbekannt ist. */
export async function keyholderDashboard(username: string): Promise<DashboardResult> {
  const now = new Date();
  // Entries/Reinigung/User-id EINMAL laden und an die segment-basierten Aggregate durchreichen,
  // statt sie pro Aggregat erneut zu scannen. (buildOverview/getOffenses sind V1-Reuse mit eigenem Load.)
  const trackingCtx = await loadTrackingContext(username, now);
  // Sessions EINMAL bauen und teilen (records + dataDiscrepancies), statt buildSessions doppelt.
  const sessions = buildSessions(trackingCtx.entries, trackingCtx.reinigung, now, trackingCtx.devices);

  const [overview, rec, periods, ledger, pinned, boxState, healthHold] = await Promise.all([
    buildOverview(username, { iso: true }),
    records(username, trackingCtx, sessions),
    periodSummary(username, trackingCtx),
    getOffenses(username),
    queryNotes(username, { pinned: true, status: "active", limit: 50 }),
    loadBoxState(trackingCtx.userId, now),
    loadActiveHealthHold(trackingCtx.userId),
  ]);

  // wornNow: KG-Lock (falls verschlossen) + aktive Wear-Sessions der Kategorien.
  const wornNow: DashboardResult["wornNow"] = [];
  if (overview.lock.isLocked) {
    wornNow.push({ category: "KG", deviceName: overview.lock.deviceName, since: overview.lock.since, durationHours: overview.lock.currentDurationHours });
  }
  for (const w of overview.activeWearSessions) {
    wornNow.push({ category: w.category, deviceName: w.deviceName, since: w.since, durationHours: w.durationHours });
  }

  const openOffenseRows = ledger.offenses.filter((o) => o.status === "open");

  // CT-008: "today" enthält einen Anteil einer früheren Session, wenn die Kalendertag-Summe grösser
  // ist als der durchgehende aktuelle Lauf (bei Lauf-Start vor Mitternacht ist today kleiner → false).
  const todayIncludesPriorSession =
    rec.currentRunHours != null && periods.kg.today - rec.currentRunHours > ROUND_EPSILON_H;

  // CT-004: echte (cross-cluster) Bild-Diskrepanzen als Daten-Hinweis (keine Vergehen).
  const discrepancyItems = collectImageConflicts(sessions);

  return {
    schemaVersion: 2,
    user: username,
    generatedAt: iso(now)!,
    timezone: APP_TZ,
    currentRun: {
      isLocked: overview.lock.isLocked,
      since: overview.lock.since,
      durationHours: overview.lock.currentDurationHours,
      deviceName: overview.lock.deviceName,
      personalBestHours: rec.longestRunHours,
      vsPersonalBestPct: rec.currentRunVsPbPct,
      todayIncludesPriorSession,
    },
    dataDiscrepancies: { count: discrepancyItems.length, items: discrepancyItems.slice(0, 5) },
    wornNow,
    nextRelevant: {
      openControl: overview.openKontrolle
        ? { code: overview.openKontrolle.code, deadline: overview.openKontrolle.deadline, overdue: overview.openKontrolle.overdue, remainingMinutes: overview.openKontrolle.remainingMinutes }
        : null,
      activeLockPeriod: overview.activeSperrzeit
        ? { endetAt: overview.activeSperrzeit.endetAt, indefinite: overview.activeSperrzeit.indefinite, remainingMinutes: overview.activeSperrzeit.remainingMinutes }
        : null,
      openOrgasmWindow: overview.openOrgasmusAnforderung
        ? { art: overview.openOrgasmusAnforderung.art, beginntAt: overview.openOrgasmusAnforderung.beginntAt, endetAt: overview.openOrgasmusAnforderung.endetAt, active: overview.openOrgasmusAnforderung.active, requiredType: overview.openOrgasmusAnforderung.requiredType, remainingMinutes: overview.openOrgasmusAnforderung.remainingMinutes }
        : null,
    },
    goals: { kg: periods.kg, categories: periods.categories },
    openOffenses: { count: ledger.openOffenseCount, pendingPenalties: ledger.pendingPenaltyCount, top: openOffenseRows.slice(0, 5) },
    standingDirectives: pinned.notes.filter((n) => n.type === "DIRECTIVE"),
    boundaries: pinned.notes.filter((n) => n.type === "BOUNDARY"),
    boxState,
    healthHold,
  };
}
