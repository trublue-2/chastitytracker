import { prisma } from "@/lib/prisma";
import { buildOverview } from "@/lib/mcpOverview";
import { iso, APP_TZ, loadTrackingContext, type NoteDTO } from "@/lib/mcp/common";
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
  };
  /** Was JETZT getragen wird — KG + alle Kategorien vereint. */
  wornNow: { category: string; deviceName: string | null; since: string | null; durationHours: number | null }[];
  /** Das als Nächstes Relevante: offene Kontrolle / aktive Sperrzeit / offenes Orgasmus-Fenster.
   *  HINWEIS Zeit-Disziplin: deadline/endetAt (und currentRun.since, wornNow.since) stammen aus der
   *  V1-Overview und sind im Instanz-lokalen Human-Format ("dd.mm.yyyy, HH:mm"), NICHT ISO-8601 wie
   *  generatedAt/boxState. Für Fristfragen die mitgelieferten remainingMinutes/overdue nutzen.
   *  (Vollständige ISO-Vereinheitlichung erfordert eine V1-Boundary-Anpassung — Future-Work.) */
  nextRelevant: {
    openControl: { code: string; deadline: string; overdue: boolean; remainingMinutes: number } | null;
    activeLockPeriod: { endetAt: string | null; indefinite: boolean; remainingMinutes: number | null } | null;
    openOrgasmWindow: { art: string; endetAt: string; requiredType: string | null; remainingMinutes: number } | null;
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

/** Baut das Dashboard durch Komposition der Aggregate. Throws, wenn der User unbekannt ist. */
export async function keyholderDashboard(username: string): Promise<DashboardResult> {
  const now = new Date();
  // Entries/Reinigung/User-id EINMAL laden und an die segment-basierten Aggregate durchreichen,
  // statt sie pro Aggregat erneut zu scannen. (buildOverview/getOffenses sind V1-Reuse mit eigenem Load.)
  const trackingCtx = await loadTrackingContext(username, now);

  const [overview, rec, periods, ledger, pinned, boxState, healthHold] = await Promise.all([
    buildOverview(username),
    records(username, trackingCtx),
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
    },
    wornNow,
    nextRelevant: {
      openControl: overview.openKontrolle
        ? { code: overview.openKontrolle.code, deadline: overview.openKontrolle.deadline, overdue: overview.openKontrolle.overdue, remainingMinutes: overview.openKontrolle.remainingMinutes }
        : null,
      activeLockPeriod: overview.activeSperrzeit
        ? { endetAt: overview.activeSperrzeit.endetAt, indefinite: overview.activeSperrzeit.indefinite, remainingMinutes: overview.activeSperrzeit.remainingMinutes }
        : null,
      openOrgasmWindow: overview.openOrgasmusAnforderung
        ? { art: overview.openOrgasmusAnforderung.art, endetAt: overview.openOrgasmusAnforderung.endetAt, requiredType: overview.openOrgasmusAnforderung.requiredType, remainingMinutes: overview.openOrgasmusAnforderung.remainingMinutes }
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
