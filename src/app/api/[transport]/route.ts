import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { timingSafeEqual, createHash } from "crypto";
import { z } from "zod";
import { buildOverview, listSessions, listEntries, listDevices, mcpStrafbuch, listKeyholderNotes } from "@/lib/mcpOverview";
import { MCP_MODEL_DOC } from "@/lib/mcpModelDoc";
import {
  checkMcpKeyholder, mcpRequestLock, mcpSetLockPeriod, mcpRequestInspection, mcpSetTrainingGoal, mcpWithdraw,
  mcpListTrainingGoals, mcpEditTrainingGoal, mcpDeleteTrainingGoal, mcpSetCleaning, mcpResolveInspection, mcpEditLockPeriod,
  mcpAddKeyholderNote, mcpDeleteKeyholderNote, mcpRequestOrgasm, mcpJudgeOffense,
} from "@/lib/mcpWrite";
import { ORGASMUS_ARTEN } from "@/lib/constants";
import { verifyAccessToken } from "@/lib/oauth";
import { VALID_TYPES } from "@/lib/constants";
// ── MCP V2 ──
import { getSession } from "@/lib/mcp/sessions";
import { queryNotes, upsertNoteDef, linkNoteDef, NOTE_TYPES, NOTE_STATUS, NOTE_SOURCE, NOTE_CONFIDENCE, ENTITY_TYPES } from "@/lib/mcp/notes";
import { listDevicesV2, setDeviceMetaDef, SECURITY_LEVELS } from "@/lib/mcp/devices";
import { executeWrite, type WriteDef, type WriteSource } from "@/lib/mcp/writeFramework";
import { buildWriteContext } from "@/lib/mcp/common";
import { keyholderDashboard, getBoxState } from "@/lib/mcp/dashboard";
import { deviceStats, records, denialTrend, periodSummary } from "@/lib/mcp/stats";
import { getOffenses } from "@/lib/mcp/ledger";
import { getContext, setHealthHoldDef, upsertAppointmentDef, upsertRecurringContextDef } from "@/lib/mcp/context";
import { timeline } from "@/lib/mcp/timeline";
import { getActionLog } from "@/lib/mcp/actionlog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** Resolves MCP_USERNAME, runs the aggregator, and wraps the result as a tool response.
 *  Centralizes the misconfig check + error handling shared by all tools. */
async function runTool<T>(label: string, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  const username = process.env.MCP_USERNAME;
  if (!username) {
    return { content: [{ type: "text", text: "Server misconfigured: MCP_USERNAME is not set." }], isError: true };
  }
  try {
    const data = await fn(username);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `${label} failed: ${(e as Error).message}` }], isError: true };
  }
}

/** Auth context the MCP SDK passes to tool callbacks. The OAuth branch of verifyToken stores the
 *  authorizing user's id under authInfo.extra.userId. */
type ToolExtra = { authInfo?: { extra?: { userId?: string } } };

/** Wrapper for WRITE tools: enforces keyholder (admin OAuth) authorization, then delegates to
 *  runTool. The static MCP_TOKEN has no user identity and is therefore always rejected here. */
async function runWriteTool<T>(label: string, extra: ToolExtra, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  const check = await checkMcpKeyholder(extra?.authInfo?.extra?.userId);
  if (!check.ok) {
    return { content: [{ type: "text", text: `Write denied: ${check.reason}.` }], isError: true };
  }
  return runTool(label, fn);
}

/** Wrapper für MCP-V2-WRITE-Tools: prüft Keyholder-Autorisierung, baut den WriteContext und führt
 *  den Write durchs zentrale Framework (Pflicht-`reason` + Audit + Dry-Run + Transaktion + Diff).
 *  `reason`/`source`/`dryRun` werden aus den Tool-Args extrahiert, der Rest ist die Domänen-Eingabe. */
async function runV2Write<A, T>(
  def: WriteDef<A, T>,
  extra: ToolExtra,
  raw: Record<string, unknown>,
): Promise<ToolResult> {
  const check = await checkMcpKeyholder(extra?.authInfo?.extra?.userId);
  if (!check.ok) {
    return { content: [{ type: "text", text: `Write denied: ${check.reason}.` }], isError: true };
  }
  const username = process.env.MCP_USERNAME;
  if (!username) {
    return { content: [{ type: "text", text: "Server misconfigured: MCP_USERNAME is not set." }], isError: true };
  }
  // `decisionSource` ist die Audit-Quelle (wer hat entschieden) — bewusst NICHT `source`, damit es
  // nicht mit Domänenfeldern wie der Note-Provenienz (note.source) kollidiert.
  const { reason, decisionSource, dryRun, ...domain } = raw;
  try {
    const ctx = await buildWriteContext(username, extra?.authInfo?.extra?.userId);
    const result = await executeWrite(def, ctx, domain as A, {
      reason: reason as string,
      source: decisionSource as WriteSource | undefined,
      dryRun: dryRun as boolean | undefined,
    });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `${def.tool} failed: ${(e as Error).message}` }], isError: true };
  }
}

/** Default-AN, abschaltbar mit "false": registriert die LEGACY-V1-Read-Tools (siehe Part 2b). */
const ENABLE_LEGACY_MCP = process.env.ENABLE_LEGACY_MCP !== "false";

/** Server-Instructions (MCP `initialize.instructions`) — steuern die V1/V2-Tool-Wahl global,
 *  damit der Agent nicht der Beschreibungs-Ähnlichkeit ausgeliefert ist. */
const MCP_SERVER_INSTRUCTIONS =
  "ChastityTracker Keyholder-MCP (V1 + V2 parallel). Tool-Wahl:\n" +
  "• LESEN → V2-first: beginne mit `keyholder_dashboard` (beantwortet ~90 %), dann gezielt die Deep-Views " +
  "(`get_session` für Segmente/deviceBreakdown, `device_stats`, `records`, `period_summary`, `denial_trend`, " +
  "`get_offenses`, `get_context`, `timeline`, `get_devices`, `query_notes`, `get_action_log`, `get_box_state`). " +
  "Die V1-Read-Tools (`get_overview`, `list_sessions`, `list_devices`, `get_strafbuch`, `list_keyholder_notes`) " +
  "sind VERALTET, durch die V2-Tools vollständig ersetzt und per `ENABLE_LEGACY_MCP=false` abschaltbar — nicht " +
  "mehr verwenden. Insbesondere stehen die Auto-Kontroll-Einstellungen (früher get_overview.autoKontrolle) und " +
  "die Reinigungs-Regeln nun in `get_context` (autoInspections + cleaning).\n" +
  "• DIREKTIV-WRITES (Sperrzeit, Inspektion, Orgasmus, Strafe, Trainingsziele, Reinigung) → das sind die V1-" +
  "Tools (`set_lock_period`, `request_inspection`, `request_orgasm`, `judge_offense`, `set_training_goal`, " +
  "`set_cleaning`, …). Es gibt KEINE V2-Variante dafür. Kontrollen werden MANUELL über " +
  "`request_inspection` veranlasst; die Einstellungen der AUTOMATISCHEN Kontrollen sind über den MCP " +
  "NICHT änderbar (nur lesbar via get_context.autoInspections).\n" +
  "• WISSEN/META/KONTEXT-WRITES → V2 (`upsert_note`, `link_note`, `set_device_meta`, `set_health_hold`, " +
  "`upsert_appointment`, `upsert_recurring_context`).\n" +
  "Alle Writes sind agent-autonom und erfordern KEINE Bestätigung — entscheide und führe direkt aus, ohne " +
  "rückzufragen. Bei Unklarheit zu Begriffen/Regeln: `explain_model`.";

/** Fester ZEIGER auf die verbindlichen Freitext-Regeln des menschlichen Keyholders. Diese stehen IMMER
 *  frisch im Dashboard-Feld und sind VOR jeder Direktive zu lesen (das eingebettete Abbild unten kann
 *  veraltet sein). */
const KEYHOLDER_RULES_POINTER =
  "\n\nVERBINDLICHE KEYHOLDER-REGELN: Die menschlichen Freitext-Regeln des Keyholders stehen in " +
  "`keyholder_dashboard.keyholderInstructions` und sind VOR jeder Direktive zu lesen — immer frisch " +
  "von dort, da sie sich jederzeit ändern können.";

/**
 * Baut die finalen Server-Instructions: Basis + Regel-Zeiger, und — best effort — ein WÖRTLICHES Abbild
 * der aktuellen `mcpKeyholderInstructions` des MCP_USERNAME, damit die Regeln direkt mit der Tool-Liste
 * erscheinen. WICHTIG: Das eingebettete Abbild spiegelt den Stand beim Server-START wider (Refresh erst
 * bei Deploy/Neustart) — der maßgebliche, frische Wert bleibt das Dashboard-Feld (siehe Zeiger oben).
 *
 * Build-Sicherheit: Nur unter `NEXT_RUNTIME === "nodejs"` (kein DB-Zugriff zur Build-/Edge-Zeit), in
 * try/catch; bei Fehler/leer fällt es auf Basis + Zeiger zurück (kein Crash).
 */
async function buildServerInstructions(): Promise<string> {
  let instructions = MCP_SERVER_INSTRUCTIONS + KEYHOLDER_RULES_POINTER;
  if (process.env.NEXT_RUNTIME !== "nodejs") return instructions;
  const username = process.env.MCP_USERNAME;
  if (!username) return instructions;
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { username }, select: { mcpKeyholderInstructions: true } });
    const rules = user?.mcpKeyholderInstructions?.trim();
    if (rules) {
      instructions +=
        "\n\nAKTUELLE KEYHOLDER-REGELN (Abbild beim Server-Start — der frische Stand bleibt " +
        "keyholder_dashboard.keyholderInstructions):\n" + rules;
    }
  } catch {
    // DB nicht verfügbar (z.B. Build) → nur Basis + Zeiger. Bewusst still.
  }
  return instructions;
}

/** Read-only MCP server. Exposes tools so an AI assistant can query the tracker state and
 *  propose measures. Gated behind ENABLE_MCP + a static bearer token (MCP_TOKEN); all data
 *  is for the user named in MCP_USERNAME. */
type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

/** Registriert alle MCP-Tools auf dem Server. V1-LEGACY-Read-Tools werden nur registriert, wenn
 *  ENABLE_LEGACY_MCP an ist (sie sind vollständig durch V2 ersetzt — siehe Server-Instructions). */
function registerTools(server: McpServer) {
    // V1-Read-Tools, die eine V2-Entsprechung haben, als VERALTET markieren (Steuerimpuls zusätzlich
    // zu den Server-Instructions). Direktiv-Writes bleiben unmarkiert (kein V2-Ersatz).
    const LEGACY = (replacement: string) => `[VERALTET — NICHT verwenden; nutze ${replacement}. Wird entfernt.] `;

    // ── LEGACY-V1-Read-Tools — nur registrieren, wenn ENABLE_LEGACY_MCP an ist ──
    if (ENABLE_LEGACY_MCP) {
    server.registerTool(
      "get_overview",
      {
        title: "Get tracker overview",
        description:
          LEGACY("keyholder_dashboard") +
          "Returns a read-only snapshot of the chastity-tracker state: lock status and duration, " +
          "KG wearing hours (today/week/month), active KG training goal with progress, cleaning-pause " +
          "rules (reinigung), per-category wear hours + goals for non-KG categories (Plug, Collar, …), " +
          "the currently OPEN control request (openKontrolle) AND the last submitted control " +
          "(lastKontrolle: code verification + device-check) — note openKontrolle:null means none is " +
          "open right now, NOT that one expired (a submitted control simply isn't open anymore). " +
          "Active lock periods, session statistics, recorded penalties, " +
          "active wear sessions, and the human keyholder's free-text rules (keyholderInstructions) " +
          "that the write tools must respect. Use this to reason about the user's situation and propose measures. " +
          "If any field or rule is unclear (e.g. reinigung.maxPausesPerDay, or how Strafbuch detection vs " +
          "punishment works), call explain_model first for a plain-language reference.",
        inputSchema: {},
      },
      () => runTool("get_overview", buildOverview),
    );

    server.registerTool(
      "list_sessions",
      {
        title: "List completed sessions",
        description:
          LEGACY("get_session (Segmente + deviceBreakdown; dieses Tool zeigt nur das irreführende Einzel-Gerät-Label)") +
          "Returns completed (closed) sessions — KG lock sessions and non-KG wear sessions — " +
          "newest first, each with category, device, start/end time and duration. Use for " +
          "history beyond the live snapshot of get_overview.",
        inputSchema: {
          category: z.string().optional().describe('Filter: "KG" or a category name (e.g. "Plug"). Omit for all categories.'),
          limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 20)."),
        },
      },
      (args) => runTool("list_sessions", (username) => listSessions(username, args)),
    );
    } // end ENABLE_LEGACY_MCP (get_overview, list_sessions)

    server.registerTool(
      "list_entries",
      {
        title: "List raw entries (full detail)",
        description:
          "Returns the raw entry timeline with ALL per-entry detail needed to understand the " +
          "full situation: each entry's type, timestamp, free-text note/comment, opening reason " +
          "(oeffnenGrund), orgasm type (orgasmusArt), control code, code verification status, device, " +
          "the device-check (deviceCheck: was the locked device recognised in the control photo — " +
          "status ok/wrong/missing + detected/expected device), " +
          "whether a photo exists (+ its EXIF capture time) and whether the time was back-/post-dated. " +
          "Newest first. Use this for the narrative context that the aggregate tools (keyholder_dashboard, " +
          "get_session, get_offenses) leave out.",
        inputSchema: {
          type: z.enum(VALID_TYPES).optional().describe("Filter by entry type. Omit for all types."),
          limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
        },
      },
      (args) => runTool("list_entries", (username) => listEntries(username, args)),
    );

    // ── Weitere LEGACY-V1-Read-Tools (list_devices, get_strafbuch, list_keyholder_notes) ──
    if (ENABLE_LEGACY_MCP) {
    server.registerTool(
      "list_devices",
      {
        title: "List devices (inventory)",
        description:
          LEGACY("get_devices (inkl. Entscheidungs-Metadaten + Cluster + inline Notes)") +
          "Returns the user's device inventory — KG and non-KG (Plug, Collar, …) devices — each " +
          "with its notes/description, category, purchase price, currency, whether it has a photo, " +
          "archived status and creation date. Active devices first, then archived. Use for " +
          "inventory, notes and cost questions.",
        inputSchema: {},
      },
      () => runTool("list_devices", listDevices),
    );

    server.registerTool(
      "get_strafbuch",
      {
        title: "Get penalty book (Strafbuch)",
        description:
          LEGACY("get_offenses (vereinheitlichtes Ledger + Cluster-Kontext + inline Notes)") +
          "Returns the Strafbuch: system-detected offenses — unauthorized openings during a " +
          "lock period, late and rejected control submissions, cleaning-limit violations, and " +
          "wrong-device violations (a different device worn than the Anforderung specified) — " +
          "each (where applicable) flagged whether it has already been marked as punished. " +
          "Use to reason about outstanding misconduct and propose consequences.",
        inputSchema: {},
      },
      () => runTool("get_strafbuch", mcpStrafbuch),
    );

    server.registerTool(
      "list_keyholder_notes",
      {
        title: "List keyholder notes (wearing-behaviour observations)",
        description:
          LEGACY("query_notes (Notes v2: type/status/pinned/refs, strukturiert)") +
          "Returns the private keyholder notes — free observations about the user's wearing " +
          "behaviour, optionally tagged by KG (device) and category (e.g. pressure marks, escape " +
          "attempts, complaints). Newest first. get_overview already surfaces the 8 most recent; " +
          "use this for the full history or to filter by a specific KG/category. MCP-only — the " +
          "user never sees these. Use add_keyholder_note to record, delete_keyholder_note to prune.",
        inputSchema: {
          kg: z.string().optional().describe("Filter to a specific KG/device tag (exact match). Omit for all."),
          kategorie: z.string().optional().describe("Filter to a specific category/tag (exact match). Omit for all."),
          limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
        },
      },
      (args) => runTool("list_keyholder_notes", (username) => listKeyholderNotes(username, args)),
    );
    } // end ENABLE_LEGACY_MCP (list_devices, get_strafbuch, list_keyholder_notes)

    server.registerTool(
      "explain_model",
      {
        title: "Explain the tracker model & dependencies",
        description:
          "Returns a plain-language reference (German) of how the tracker's concepts interrelate — " +
          "lock & Sperrzeit, Reinigung (cleaning) incl. maxPausesPerDay (a COUNT per calendar day, not " +
          "minutes), device switches (which run through the cleaning path and consume the cleaning " +
          "quota), the Strafbuch detected-vs-punished distinction, box control, and keyholder notes. " +
          "Read this whenever a field or rule is unclear — it prevents the common misreadings (e.g. " +
          "treating a detected offense as a punishment, or maxPausesPerDay as minutes).",
        inputSchema: {},
      },
      () => ({ content: [{ type: "text" as const, text: MCP_MODEL_DOC }] }),
    );

    // ── MCP V2 READ tools — abgeleitete Wahrheit (Segmente), strukturierte Notes, Geräte-Metadaten ──
    server.registerTool(
      "get_session",
      {
        title: "Get KG session(s) with segments + deviceBreakdown",
        description:
          "MCP V2 — die KORREKTE Antwort auf 'welches Gerät war Session X': eine KG-Session zerfällt an " +
          "REINIGUNG-Öffnungen in Segmente (pro Segment GENAU EIN Gerät). Liefert pro Session " +
          "`deviceBreakdown` (Stunden je Gerät), `segments[]` (declared vs. bild-verifiziertes Gerät + " +
          "`deviceConfidence`), inline verknüpfte Notes (§9.3) und `dataQualityFlags` (z.B. declared≠verified). " +
          "Ohne sessionId werden die neuesten Sessions aufgelistet. Zeiten als ISO-8601 mit Offset.",
        inputSchema: {
          sessionId: z.string().optional().describe("Eine bestimmte Session (Lock-Entry-id). Omit = neueste auflisten."),
          limit: z.number().int().min(1).max(50).optional().describe("Max. Sessions beim Auflisten (default 10)."),
        },
      },
      (args) => runTool("get_session", (u) => getSession(u, args)),
    );

    server.registerTool(
      "query_notes",
      {
        title: "Query keyholder notes (v2, structured + linked)",
        description:
          "MCP V2 — Notes v2 gefiltert nach type (" + NOTE_TYPES.join("|") + "), status (active|superseded|" +
          "archived|all), pinned, kg oder verknüpftem Objekt (entityType/entityId). Default: nur aktive, " +
          "gepinnte oben. Jede Note trägt source/confidence (Nutzer-Fakt vs. Schluss), doDont (für BOUNDARY) " +
          "und ihre refs (belegende Objekte). MCP-only.",
        inputSchema: {
          type: z.enum(NOTE_TYPES).optional().describe("Filter nach Note-Typ."),
          status: z.enum(["active", "superseded", "archived", "all"]).optional().describe("Filter nach Status (default active; 'all' = alle)."),
          pinned: z.boolean().optional().describe("Nur gepinnte / nur ungepinnte."),
          kg: z.string().optional().describe("Filter auf KG/Gerät-Tag (exakt)."),
          entityType: z.enum(ENTITY_TYPES).optional().describe("Nur Notes, die an diesen Objekttyp hängen."),
          entityId: z.string().optional().describe("Zusammen mit entityType: nur Notes zu genau diesem Objekt."),
          limit: z.number().int().min(1).max(200).optional().describe("Max. Notes (default 50)."),
        },
      },
      (args) => runTool("query_notes", (u) => queryNotes(u, args)),
    );

    server.registerTool(
      "get_devices",
      {
        title: "Get devices with decision metadata + inline notes (v2)",
        description:
          "MCP V2 — Geräte-Inventar inkl. der Entscheidungs-Metadaten (§2): securityLevel " +
          "(SECURING|TRUST_ONLY), lookalikeClusterId (Mismatch INNERHALB eines Clusters ist nie ein " +
          "Vergehen), abstreifbar, material, bauform, healthFlags, retentionNotes, Anzahl Referenzfotos — " +
          "plus inline verknüpfte Notes. Setze Metadaten mit set_device_meta.",
        inputSchema: {},
      },
      () => runTool("get_devices", listDevicesV2),
    );

    server.registerTool(
      "keyholder_dashboard",
      {
        title: "Keyholder dashboard (one call answers ~90%)",
        description:
          "MCP V2 — DER Einstiegs-Call: currentRun vs. Personal Best, was JETZT getragen wird (KG + " +
          "alle Kategorien), nextRelevant (offene Kontrolle / aktive Sperrzeit / offenes Orgasmus-Fenster), " +
          "Ziele + Adhärenz (Tag/Woche/Monat-Erfüllung), offene Vergehen (Top 5), gepinnte " +
          "standingDirectives + boundaries (fallen nie aus einem Recency-Fenster), scheduledDirectives " +
          "(vom Keyholder TERMINIERTE, noch nicht ausgelöste lock_request/lock_period/manuelle inspection — " +
          "für den Sub noch unsichtbar, via `withdraw` stornierbar; Auto-Kontrollen bewusst NICHT enthalten), BoxState, HealthHold, " +
          "dataDiscrepancies (echte Bild-Diskrepanzen als Hinweis, KEINE Vergehen; cluster-interne " +
          "Verwechslungen ausgeblendet) und currentRun.todayIncludesPriorSession (today enthält Anteil " +
          "einer früheren Session → ≠ Lauf-Dauer). Zeiten durchgängig ISO-8601 mit Offset. Nutze die " +
          "Deep-Views (get_session, device_stats, records, denial_trend, get_offenses) nur für Details.",
        inputSchema: {},
      },
      () => runTool("keyholder_dashboard", keyholderDashboard),
    );

    server.registerTool(
      "device_stats",
      {
        title: "Per-device wear statistics (from segments)",
        description:
          "MCP V2 — pro Gerät aus SEGMENTEN (nicht Labels): segmentCount, total/avg/median/min/max-Stunden, " +
          "längste durchgehende Strecke (maxHours) und zuletzt getragen. Vorberechnet — keine Rekonstruktion " +
          "aus Rohdaten nötig.",
        inputSchema: {},
      },
      () => runTool("device_stats", deviceStats),
    );

    server.registerTool(
      "records",
      {
        title: "Records & personal bests",
        description:
          "MCP V2 — längster Lauf (interruption-bereinigt) als Personal Best, aktueller Lauf + % vom PB, " +
          "Tage seit Rekord, Stunden seit letztem Orgasmus und längste orgasmusfreie Strecke. Vorberechnet.",
        inputSchema: {},
      },
      () => runTool("records", records),
    );

    server.registerTool(
      "period_summary",
      {
        title: "Period summary (day/week/month) + goal fulfillment",
        description:
          "MCP V2 — Tag/Woche/Monat-Tragestunden für KG und je Kategorie inkl. Ziel-Erfüllung (pct). " +
          "Eine Quelle für die Adhärenz-Frage.",
        inputSchema: {},
      },
      () => runTool("period_summary", periodSummary),
    );

    server.registerTool(
      "denial_trend",
      {
        title: "Denial / orgasm interval trend",
        description:
          "MCP V2 — Entsagungs-Entwicklung mit DATEN statt Kopfrechnen: currentStreakH (seit letztem " +
          "Orgasmus), longestDenialH, avgIntervalH + recentAvgIntervalH + trendRising (steigt die " +
          "Entsagung?), und orgasmHistory[] (Zeitpunkt, Intervall zum vorigen, Geräte-Kontext).",
        inputSchema: {
          limit: z.number().int().min(1).max(500).optional().describe("Nur die letzten N Orgasmen in orgasmHistory."),
        },
      },
      (args) => runTool("denial_trend", (u) => denialTrend(u, args)),
    );

    server.registerTool(
      "get_offenses",
      {
        title: "Discipline ledger (unified offense list)",
        description:
          "MCP V2 — vereinheitlichtes Disziplin-Ledger: alle erkannten Vergehen (unauthorized_opening, " +
          "late_control, rejected_control, cleaning_limit, wrong_device, missed_orgasm) als EINE Liste mit " +
          "status (open|judged), judgment, Folge (consequence) und Kontext + inline Notes. Bei wrong_device " +
          "kommt der Cluster-Kontext des getragenen Geräts mit (possiblyClusterInternal) — Cluster-interne " +
          "Mismatches sind nie ein echtes Vergehen; urteile via judge_offense.",
        inputSchema: {},
      },
      () => runTool("get_offenses", getOffenses),
    );

    server.registerTool(
      "get_context",
      {
        title: "Get life context (recurring + appointments + health hold)",
        description:
          "MCP V2 — Kontext um das echte Leben (§8): aktiver HealthHold (Gesundheits-Zurückhaltung), " +
          "die Einstellungen der AUTOMATISCHEN Kontrollen (autoInspections: active/perDay/Schlaf-Fenster/" +
          "Fristen — read-only, nicht via MCP änderbar), die Reinigungs-Regeln (cleaning: allowed/" +
          "maxMinutesPerBreak/maxPausesPerDay/usedToday/windows/windowOpenNow), der wiederkehrende Wochen-" +
          "Kontext (HO-Tage, Bürotage, Pilates …, weekday 0=So..6=Sa, deviceFree) und anstehende Termine " +
          "(ab jetzt, geräte-frei-Flag). Für die Planung von Ankern/Kontrollen.",
        inputSchema: {},
      },
      () => runTool("get_context", getContext),
    );

    server.registerTool(
      "timeline",
      {
        title: "Unified event timeline",
        description:
          "MCP V2 — alle Ereignisse auf EINER Zeitachse (chronologisch): lock/unlock (KG), wear_begin/" +
          "wear_end (Kategorien), control (Kontrolle + deviceCheck), orgasm (+ Art). Mit from/to-Filter " +
          "(ISO 8601) und limit (behält die jüngsten).",
        inputSchema: {
          from: z.string().optional().describe("Nur Ereignisse ab diesem Zeitpunkt (ISO 8601)."),
          to: z.string().optional().describe("Nur Ereignisse bis zu diesem Zeitpunkt (ISO 8601)."),
          limit: z.number().int().min(1).max(1000).optional().describe("Max. Ereignisse (default 200, jüngste)."),
        },
      },
      (args) => runTool("timeline", (u) => timeline(u, args)),
    );

    server.registerTool(
      "get_action_log",
      {
        title: "Keyholder action log (audit + goal-change history)",
        description:
          "MCP V2 — append-only Audit aller mutierenden V2-Aktionen mit reason + source: was hat welche " +
          "Instanz wann mit welcher Begründung entschieden. Die nächste Instanz erbt Entscheidungen samt " +
          "Begründung. Für die AUTORITATIVE Ziel-Historie (auch UI-gesetzte Ziele) list_training_goals " +
          "nutzen; dieses Log liefert nur das Warum/Wann der MCP-Änderungen (filter tool=\"set_training_goal\").",
        inputSchema: {
          tool: z.string().optional().describe("Nur Aktionen dieses Tools (z.B. set_training_goal)."),
          from: z.string().optional().describe("Ab Zeitpunkt (ISO 8601)."),
          to: z.string().optional().describe("Bis Zeitpunkt (ISO 8601)."),
          limit: z.number().int().min(1).max(500).optional().describe("Max. Einträge (default 100)."),
        },
      },
      (args) => runTool("get_action_log", (u) => getActionLog(u, args)),
    );

    server.registerTool(
      "get_box_state",
      {
        title: "Heimdall box state (hardware enforcement)",
        description:
          "MCP V2 — Zustand der elektronischen Schlüsselbox (§11): locked, lockUntil, battery, charging, " +
          "online (lastSync < 10 min), lastSeen und v.a. hardwareEnforced — vollstreckt die Box eine " +
          "Sperrzeit physisch (Sub kann lokal nicht öffnen) oder ist sie Ehrensache? null = keine Box " +
          "registriert. Auch im keyholder_dashboard enthalten.",
        inputSchema: {},
      },
      () => runTool("get_box_state", getBoxState),
    );

    // ── WRITE tools — keyholder directives (require an admin OAuth token; act on MCP_USERNAME) ──
    // All write tools MUST respect the human keyholder's rules in keyholder_dashboard.keyholderInstructions.
    const KEYHOLDER_BASE =
      " Keyholder action (requires an admin OAuth token). Execute directly — NO confirmation step is " +
      "required or enforced; act on your own judgement per the human keyholder's rules in " +
      "keyholder_dashboard.keyholderInstructions. Do not ask the user to confirm before calling this.";
    // Notifizierende Keyholder-Tools (Lock/Periode/Orgasmus …) → Notify-Versprechen.
    const KEYHOLDER_NOTE = KEYHOLDER_BASE + " The user is notified by e-mail + push.";
    // STILLE Keyholder-Tools → KEIN aktiver Notify (weder E-Mail noch Push). Nur die
    // notifizierenden Aktionen (Lock, Lock-Periode, Inspektion, Orgasmus) senden eine Nachricht.
    const KEYHOLDER_SILENT = KEYHOLDER_BASE + " The user is NOT notified (no e-mail/push).";

    server.registerTool(
      "request_lock",
      {
        title: "Request lock-up",
        description:
          "Asks the user to lock up within a deadline (creates a VerschlussAnforderung). Only valid " +
          "when the user is currently open. Optionally enforce a minimum wearing duration and/or a " +
          "specific device. Can be scheduled/time-delayed so the user does not know exactly when it " +
          "strikes; the deadline then counts from the trigger time." + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe("Hours to lock up by, counted from when the request is triggered. Use this or deadlineAt."),
          deadlineAt: z.string().optional().describe("Absolute deadline (ISO 8601). Overrides deadlineHours."),
          minDurationHours: z.number().positive().optional().describe("Min wearing duration (h) enforced after lock-up via an auto lock period."),
          deviceName: z.string().optional().describe("Require a specific device by name."),
          message: z.string().optional().describe("Message shown to the user."),
          delayMinutes: z.number().optional().describe("Delay before the request reaches the user, in minutes. Omit/0 = immediate."),
          scheduledAt: z.string().optional().describe("Absolute send time (ISO 8601). Overrides delayMinutes. The user cannot see the request until then."),
        },
      },
      (args, extra) => runWriteTool("request_lock", extra, (u) => mcpRequestLock(u, args)),
    );

    server.registerTool(
      "set_lock_period",
      {
        title: "Set lock period (Sperrzeit)",
        description:
          "Sets a lock period during which the user may not open (creates a SPERRZEIT). Only valid " +
          "when the user is currently locked. Provide untilAt or durationHours, or set indefinite=true. " +
          "Can be scheduled/time-delayed so it starts (and the user is notified) only later." + KEYHOLDER_NOTE,
        inputSchema: {
          untilAt: z.string().optional().describe("Lock until this absolute time (ISO 8601)."),
          durationHours: z.number().positive().optional().describe("Lock for this many hours. Counts from when the lock period starts (after any delay)."),
          indefinite: z.boolean().optional().describe("Lock indefinitely (no end). Overrides untilAt/durationHours."),
          reinigungErlaubt: z.boolean().optional().describe("Allow cleaning openings without breaking the lock period."),
          message: z.string().optional().describe("Message shown to the user."),
          delayMinutes: z.coerce.number().optional().describe("Delay before the lock period starts/sends, in minutes. Omit/0 = immediate."),
          scheduledAt: z.string().optional().describe("Absolute start/send time (ISO 8601). Overrides delayMinutes."),
        },
      },
      (args, extra) => runWriteTool("set_lock_period", extra, (u) => mcpSetLockPeriod(u, args)),
    );

    server.registerTool(
      "request_inspection",
      {
        title: "Request inspection (Kontrolle)",
        description:
          "Requests a photo inspection: e-mails the user a code they must show in a photo within a " +
          "deadline (default 4h). Only valid when the user is currently locked. Can be triggered " +
          "time-delayed so the user does not know exactly when it strikes." + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe("Deadline in hours (default 4). Counts from when the inspection is triggered."),
          comment: z.string().optional().describe("Instruction shown to the user."),
          delayMinutes: z.coerce.number().optional().describe("Delay before the code reaches the user. Omit for a random 5–65 min delay; 0 = immediate; any other value is clamped to 5–65."),
        },
      },
      (args, extra) => runWriteTool("request_inspection", extra, (u) => mcpRequestInspection(u, args)),
    );

    server.registerTool(
      "request_orgasm",
      {
        title: "Request / direct an orgasm",
        description:
          "Sets a keyholder orgasm directive with a time window. art=ANWEISUNG makes it mandatory " +
          "(a missed window becomes a Strafbuch offense); art=GELEGENHEIT is a permitted opportunity " +
          "(no penalty if unused). Optionally require a specific orgasm type, allow opening the device " +
          "during the window, and attach a message. Replaces any existing open directive (one active " +
          "at a time). The user is notified by e-mail + push." + KEYHOLDER_NOTE,
        inputSchema: {
          art: z.enum(["ANWEISUNG", "GELEGENHEIT"]).describe("ANWEISUNG = mandatory (penalty if missed); GELEGENHEIT = permitted opportunity (no penalty)."),
          beginsAt: z.string().optional().describe("Window start (ISO 8601). Default: now."),
          endsAt: z.string().optional().describe("Window end (ISO 8601). Use this or windowHours."),
          windowHours: z.number().positive().optional().describe("Window length in hours from beginsAt, when endsAt is omitted."),
          requiredType: z.enum(ORGASMUS_ARTEN).optional().describe("Require a specific orgasm type. Omit = any orgasm counts."),
          openAllowed: z.boolean().optional().describe("Allow opening the device to perform the orgasm during the window (no lock break / penalty)."),
          message: z.string().optional().describe("Message shown to the user."),
        },
      },
      (args, extra) => runWriteTool("request_orgasm", extra, (u) => mcpRequestOrgasm(u, args)),
    );

    server.registerTool(
      "set_training_goal",
      {
        title: "Set training goal (Vorgabe)",
        description:
          "Sets a wear-time goal (min hours per day/week/month) for KG or a named category. Starts now by " +
          "default, or schedule a future start via validFrom. Goals are chained per category by start date, " +
          "so a future-dated goal automatically ends the current one at that date. At least one period target " +
          "is required." + KEYHOLDER_SILENT,
        inputSchema: {
          category: z.string().optional().describe('Category name, e.g. "Plug". Omit or "KG" for the chastity device.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601, e.g. 2026-06-12). Omit to start now. May be a future date to schedule a goal in advance."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit for open-ended."),
          note: z.string().optional().describe("Note shown with the goal."),
        },
      },
      (args, extra) => runWriteTool("set_training_goal", extra, (u) => mcpSetTrainingGoal(u, args)),
    );

    server.registerTool(
      "withdraw",
      {
        title: "Withdraw an open directive",
        description:
          "Withdraws the user's currently open lock request, active lock period, open inspection, or orgasm directive. " +
          "Also cancels SCHEDULED (not yet triggered) directives of the same kind — a lock_request/lock_period/" +
          "inspection whose wirksamAb is still in the future (see keyholder_dashboard.scheduledDirectives)." + KEYHOLDER_NOTE,
        inputSchema: {
          target: z.enum(["lock_request", "lock_period", "inspection", "orgasm_directive"]).describe("Which open directive to withdraw."),
        },
      },
      (args, extra) => runWriteTool("withdraw", extra, (u) => mcpWithdraw(u, args)),
    );

    server.registerTool(
      "judge_offense",
      {
        title: "Judge a detected offense",
        description:
          "Rules on a detected offense (from get_offenses). action=dismiss → no penalty (binding, " +
          "immediate); action=punish → records a free-text penalty (text, e.g. \"20 strokes\") — the " +
          "penalty is whatever you write, the field is dumb; action=complete → marks a recorded penalty " +
          "as carried out (closes the loop); action=reopen → undoes a prior judgment. An offense stays " +
          "relevant (openOffenseCount) until dismissed or its penalty is completed. Use the offense's " +
          "ref.id from get_offenses." + KEYHOLDER_BASE + " On punish, the user is notified by e-mail + push; dismiss/complete/reopen are silent.",
        inputSchema: {
          ref: z.string().describe("The offense ref.id from get_offenses."),
          action: z.enum(["dismiss", "punish", "complete", "reopen"]).describe("dismiss = no penalty; punish = record a penalty; complete = mark penalty done; reopen = undo a prior judgment."),
          text: z.string().optional().describe("Free text: the penalty (required for punish, e.g. \"20 strokes\") or an optional reason (dismiss)."),
        },
      },
      (args, extra) => runWriteTool("judge_offense", extra, (u) => mcpJudgeOffense(u, args)),
    );

    server.registerTool(
      "list_training_goals",
      {
        title: "List training goals",
        description:
          "Lists all training goals (KG + categories) with their id, status (active/scheduled/expired), " +
          "start/end dates, period targets and note. Use the id with edit_training_goal / delete_training_goal.",
        inputSchema: {
          category: z.string().optional().describe('Filter by category name, e.g. "Plug". Omit for all.'),
        },
      },
      (args) => runTool("list_training_goals", (u) => mcpListTrainingGoals(u, args)),
    );

    server.registerTool(
      "edit_training_goal",
      {
        title: "Edit a training goal",
        description:
          "Replaces a training goal's values by id (get the id from list_training_goals). Overwrite semantics: " +
          "provide the full desired state. Omitting category keeps the current one. At least one period target " +
          "is required." + KEYHOLDER_SILENT,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
          category: z.string().optional().describe('Category name, e.g. "Plug" or "KG". Omit to keep current.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601). Omit = now."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit = open-ended."),
          note: z.string().optional().describe("Note shown with the goal."),
        },
      },
      (args, extra) => runWriteTool("edit_training_goal", extra, (u) => mcpEditTrainingGoal(u, args)),
    );

    server.registerTool(
      "delete_training_goal",
      {
        title: "Delete a training goal",
        description: "Deletes a training goal by id (get the id from list_training_goals)." + KEYHOLDER_SILENT,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
        },
      },
      (args, extra) => runWriteTool("delete_training_goal", extra, (u) => mcpDeleteTrainingGoal(u, args)),
    );

    server.registerTool(
      "set_cleaning",
      {
        title: "Set cleaning (Reinigung) rules",
        description:
          "Sets the cleaning-pause rules: whether short cleaning openings are allowed, the max minutes per " +
          "pause, and the max pauses per day (0 = unlimited). Only provided fields change." + KEYHOLDER_SILENT,
        inputSchema: {
          allowed: z.boolean().optional().describe("Allow cleaning pauses?"),
          maxMinutes: z.number().int().nonnegative().optional().describe("Max minutes per cleaning pause (clamped to 1–120)."),
          maxPerDay: z.number().int().nonnegative().optional().describe("Max pauses per day, 0 = unlimited (clamped to 0–20)."),
        },
      },
      (args, extra) => runWriteTool("set_cleaning", extra, (u) => mcpSetCleaning(u, args)),
    );

    // set_auto_inspections wird BEWUSST NICHT als MCP-Tool angeboten: der virtuelle Keyholder soll
    // Kontrollen weiterhin MANUELL über request_inspection veranlassen, aber die Einstellungen der
    // AUTOMATISCHEN Kontrollen (perDay/Schlaf-Fenster/Fristen) nicht ändern. Die autoKontrolle-Config
    // bleibt nur LESBAR (get_context.autoInspections).

    server.registerTool(
      "resolve_inspection",
      {
        title: "Verify or reject the latest inspection",
        description:
          "Manually verifies or rejects the user's most recent submitted inspection photo (overrides any " +
          "automatic check). Use request_inspection to ask for one, withdraw to cancel an open one." + KEYHOLDER_NOTE,
        inputSchema: {
          action: z.enum(["verify", "reject"]).describe("Accept (verify) or reject the submitted photo."),
        },
      },
      (args, extra) => runWriteTool("resolve_inspection", extra, (u) => mcpResolveInspection(u, args)),
    );

    server.registerTool(
      "edit_lock_period",
      {
        title: "Change the active lock period's end",
        description:
          "Extends or shortens the currently active lock period (Sperrzeit) by changing its end — without " +
          "withdrawing and recreating it. Set indefinite=true for open-ended, or untilAt for a new end (must " +
          "be in the future)." + KEYHOLDER_NOTE,
        inputSchema: {
          untilAt: z.string().optional().describe("New end (ISO 8601, future). Ignored if indefinite=true."),
          indefinite: z.boolean().optional().describe("Make the lock period open-ended."),
        },
      },
      (args, extra) => runWriteTool("edit_lock_period", extra, (u) => mcpEditLockPeriod(u, args)),
    );

    // ── LEGACY-V1-Note-Writes (add_keyholder_note, delete_keyholder_note) — durch upsert_note ersetzt ──
    if (ENABLE_LEGACY_MCP) {
    server.registerTool(
      "add_keyholder_note",
      {
        title: "Add a keyholder note (wearing-behaviour observation)",
        description:
          LEGACY("upsert_note (Notes v2: type/pinned/refs, Supersession statt Delete)") +
          "Records a private observation about the user's wearing behaviour for later evaluation — " +
          "e.g. which KG draws complaints, reported pressure marks, escape attempts, hygiene issues. " +
          "Optionally tag it with a KG (device) and a category. These notes are MCP-only (the user " +
          "never sees them) and resurface in get_overview + list_keyholder_notes." + KEYHOLDER_SILENT,
        inputSchema: {
          text: z.string().min(1).describe("The observation (free text)."),
          kg: z.string().optional().describe("Optional KG/device this concerns (e.g. the device name)."),
          kategorie: z.string().optional().describe('Optional category/tag, e.g. "Druckstelle", "Ausbruchsversuch", "Gemecker".'),
        },
      },
      (args, extra) => runWriteTool("add_keyholder_note", extra, (u) => mcpAddKeyholderNote(u, args)),
    );

    server.registerTool(
      "delete_keyholder_note",
      {
        title: "Delete a keyholder note",
        description:
          LEGACY("upsert_note mit status=archived/superseded (auditierbar statt hartes Delete)") +
          "Removes a keyholder note by id (e.g. an outdated or superseded observation). Get the id " +
          "from get_overview.keyholderNotes or list_keyholder_notes." + KEYHOLDER_SILENT,
        inputSchema: {
          id: z.string().min(1).describe("The note id to delete."),
        },
      },
      (args, extra) => runWriteTool("delete_keyholder_note", extra, (u) => mcpDeleteKeyholderNote(u, args)),
    );
    } // end ENABLE_LEGACY_MCP (add_keyholder_note, delete_keyholder_note)

    // ── MCP V2 WRITE tools — laufen durchs zentrale Write-Framework (Pflicht-reason + Audit + ──
    // ── Dry-Run + Transaktion + Diff). Alle agent-autonom (keine Berechtigungs-Stufen). ──
    const V2_WRITE_NOTE =
      " MCP V2 keyholder write. `reason` ist PFLICHT (Audit). `dryRun:true` zeigt die Wirkung ohne zu " +
      "committen. Der User wird NICHT benachrichtigt (still). Requires an admin OAuth token. Direkt " +
      "ausführen — KEINE Bestätigung nötig oder erzwungen; nicht beim User rückfragen.";
    const reasonField = z.string().min(1).describe("PFLICHT: Begründung der Aktion (Audit-Log).");
    const dryRunField = z.boolean().optional().describe("true = nur Vorschau/Konflikte, NICHT committen.");
    const decisionSourceField = z.enum(["agent", "user-stated"]).optional().describe("Audit-Quelle der Entscheidung: agent (eigener Schluss) | user-stated (vom Nutzer gesagt). Default agent.");
    const entityRefField = z.object({
      entityType: z.enum(ENTITY_TYPES).describe("Objekttyp: " + ENTITY_TYPES.join("|") + "."),
      entityId: z.string().describe("Objekt-id (z.B. Geräte-id, Session-/Segment-id = Lock-Entry-id, Kontroll-id)."),
    });
    // Audit-Felder, die JEDES V2-Write-Tool trägt — einmal definiert, in jedes inputSchema gespreadet.
    const writeMetaFields = { reason: reasonField, dryRun: dryRunField, decisionSource: decisionSourceField };

    server.registerTool(
      "upsert_note",
      {
        title: "Create / edit / supersede a keyholder note (v2)",
        description:
          "Legt eine strukturierte Note v2 an oder bearbeitet sie (id). Supersession statt Delete: mit " +
          "`supersedesId` wird die alte Note auf status=superseded gesetzt und eine neue erstellt (auditierbar, " +
          "kein Churn). type=BOUNDARY nutzt `doDont` (was tun / was nie tun). `refs` hängt die Note typisiert " +
          "an Objekte (inline-Abruf via get_session/get_devices)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehende Note bearbeiten; weglassen = neue anlegen."),
          type: z.enum(NOTE_TYPES).optional().describe("Note-Typ (default OBSERVATION)."),
          text: z.string().optional().describe("Notiztext (Pflicht beim Anlegen)."),
          kg: z.string().optional().describe("Optionaler KG/Gerät-Tag."),
          kategorie: z.string().optional().describe("Optionaler Kategorie-Tag."),
          pinned: z.boolean().optional().describe("Im Dashboard dauerhaft anpinnen (z.B. DIRECTIVE/BOUNDARY)."),
          source: z.enum(NOTE_SOURCE).optional().describe("user-stated (Nutzer-Fakt) | inferred (eigener Schluss). Default inferred."),
          confidence: z.enum(NOTE_CONFIDENCE).optional().describe("Konfidenz, v.a. bei inferred."),
          status: z.enum(NOTE_STATUS).optional().describe("Status setzen (z.B. archived = Soft-Delete)."),
          validFrom: z.string().optional().describe("Gültig ab (ISO 8601)."),
          validUntil: z.string().optional().describe("Gültig bis (ISO 8601)."),
          doDont: z.object({
            do: z.array(z.string()).optional().describe("Was tun."),
            dont: z.array(z.string()).optional().describe("Was nie tun."),
          }).optional().describe("Strukturiert für BOUNDARY-Notes."),
          supersedesId: z.string().optional().describe("Vorgänger-Note, die abgelöst wird (nur beim Anlegen)."),
          refs: z.array(entityRefField).optional().describe("Objekte, an die die neue Note gehängt wird."),
        },
      },
      (args, extra) => runV2Write(upsertNoteDef, extra, args),
    );

    server.registerTool(
      "link_note",
      {
        title: "Link a note to tracking objects (v2)",
        description:
          "Hängt eine bestehende Note typisiert an ein oder mehrere Objekte (idempotent — Duplikate werden " +
          "übersprungen). Danach kommt die Note inline mit dem Objekt (get_session/get_devices)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          noteId: z.string().describe("Die zu verknüpfende Note."),
          refs: z.array(entityRefField).min(1).describe("Objekte, an die die Note gehängt wird."),
        },
      },
      (args, extra) => runV2Write(linkNoteDef, extra, args),
    );

    server.registerTool(
      "set_device_meta",
      {
        title: "Set device decision metadata (v2)",
        description:
          "Setzt die Entscheidungs-Metadaten eines Geräts (§2): securityLevel (" + SECURITY_LEVELS.join("|") + "), " +
          "lookalikeClusterId (Geräte gleicher Optik in einen Cluster — Mismatch innerhalb ist dann nie ein " +
          "Vergehen), abstreifbar, material, bauform, healthFlags, retentionNotes. Nur angegebene Felder ändern " +
          "sich." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          deviceName: z.string().optional().describe("Gerät per Name (case-insensitiv). deviceName ODER deviceId."),
          deviceId: z.string().optional().describe("Gerät per id."),
          securityLevel: z.enum(SECURITY_LEVELS).optional().describe("SECURING = sicherndes Gerät, TRUST_ONLY = Vertrauensgerät."),
          lookalikeClusterId: z.string().nullable().optional().describe("Cluster-Tag gleich aussehender Geräte. null = entfernen."),
          abstreifbar: z.boolean().optional().describe("Anti-Auszieh-Status."),
          material: z.string().nullable().optional().describe("Edelstahl | Kunststoff | Silikon."),
          bauform: z.string().nullable().optional().describe("flach | voll | standard | Plug ..."),
          healthFlags: z.array(z.string()).optional().describe("z.B. Druckstellen, scheuert, rutscht."),
          retentionNotes: z.string().nullable().optional().describe("z.B. 'njoy: rutscht beim Entspannen'."),
        },
      },
      (args, extra) => runV2Write(setDeviceMetaDef, extra, args),
    );

    server.registerTool(
      "set_health_hold",
      {
        title: "Set / clear health hold (v2)",
        description:
          "Setzt oder löst die Gesundheits-Zurückhaltung (§8). active=true braucht einen reason " +
          "(z.B. 'Migräne/Aura', 'Nacht-Auszeit'); active=false löst den aktiven Hold. Erscheint im " +
          "keyholder_dashboard.healthHold." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          active: z.boolean().describe("true = Hold aktivieren (reason nötig), false = aktiven Hold lösen."),
          reason: z.string().optional().describe("Grund der Zurückhaltung (Pflicht bei active=true)."),
        },
      },
      (args, extra) => runV2Write(setHealthHoldDef, extra, args),
    );

    server.registerTool(
      "upsert_appointment",
      {
        title: "Create / edit an appointment (v2)",
        description:
          "Legt einen Einzeltermin an oder bearbeitet ihn (id): geräte-frei-Termine (Arzt, Therapie), " +
          "Hitze-Ausnahmen. deviceFree markiert geräte-freie Termine." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehenden Termin bearbeiten; weglassen = neuer."),
          when: z.string().optional().describe("Zeitpunkt (ISO 8601). Pflicht beim Anlegen."),
          typ: z.string().nullable().optional().describe("z.B. Therapie, Arzt."),
          deviceFree: z.boolean().optional().describe("Geräte-freier Termin?"),
          note: z.string().nullable().optional().describe("Notiz zum Termin."),
        },
      },
      (args, extra) => runV2Write(upsertAppointmentDef, extra, args),
    );

    server.registerTool(
      "upsert_recurring_context",
      {
        title: "Create / edit a recurring weekly context (v2)",
        description:
          "Legt einen wiederkehrenden Wochen-Slot an oder bearbeitet ihn (id): HO-Tage, Bürotage, " +
          "Pilates-Slots. weekday 0=So..6=Sa, deviceFree markiert geräte-freie Slots." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehenden Slot bearbeiten; weglassen = neuer."),
          label: z.string().optional().describe("Bezeichnung, z.B. 'Home Office' (Pflicht beim Anlegen)."),
          weekday: z.number().int().min(0).max(6).optional().describe("Wochentag 0=So..6=Sa (Pflicht beim Anlegen)."),
          deviceFree: z.boolean().optional().describe("Geräte-freier Slot?"),
          note: z.string().nullable().optional().describe("Notiz zum Slot."),
        },
      },
      (args, extra) => runV2Write(upsertRecurringContextDef, extra, args),
    );
}

/** Baut den auth-umhüllten MCP-Handler. Async, weil die Server-Instructions erst per await-Helfer
 *  (best-effort DB-Read der Keyholder-Regeln) befüllt werden. */
async function buildAuthHandler(): Promise<(req: Request) => Promise<Response>> {
  const instructions = await buildServerInstructions();
  const handler = createMcpHandler(registerTools, { instructions }, { basePath: "/api", maxDuration: 60 });
  return withMcpAuth(handler, verifyToken, { required: true });
}

/** Memoisierter Handler: einmal beim ersten Request gebaut (Instructions = Stand beim Start; Refresh
 *  bei Deploy/Neustart). Der frische Wert der Keyholder-Regeln bleibt das Dashboard-Feld. */
let authHandlerPromise: Promise<(req: Request) => Promise<Response>> | null = null;
function getAuthHandler(): Promise<(req: Request) => Promise<Response>> {
  return (authHandlerPromise ??= buildAuthHandler());
}

/** Constant-time bearer-token comparison — avoids timing side-channels on MCP_TOKEN.
 *  Compares SHA-256 digests so the comparison is always fixed-length regardless of
 *  the token length (eliminates the truncation risk of a pad-and-slice approach). */
function tokenMatches(token: string, expected: string): boolean {
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Verifies an incoming MCP bearer token.
 * Priority:
 *   1. OAuth access token (issued via /api/oauth/token) — preferred, supports mobile
 *   2. Static MCP_TOKEN env var — legacy fallback for Claude Desktop config
 */
const verifyToken = async (_req: Request, token?: string) => {
  if (!token) return undefined;

  // 1. OAuth access token — carries the authorizing user's id (used to gate write tools).
  const oauthRecord = await verifyAccessToken(token);
  if (oauthRecord) {
    return { token, scopes: oauthRecord.scopes.split(" "), clientId: oauthRecord.clientId, extra: { userId: oauthRecord.userId } };
  }

  // 2. Static bearer token fallback — read-only (no user identity → cannot pass the keyholder check).
  const expected = process.env.MCP_TOKEN;
  if (expected && tokenMatches(token, expected)) {
    return { token, scopes: ["read"], clientId: "mcp-client" };
  }

  return undefined;
};

/** Gate the whole endpoint behind ENABLE_MCP — disabled instances return 404. Der Handler wird lazy
 *  beim ersten Request gebaut (await-befüllte Instructions), danach memoisiert. */
function gated() {
  return async (req: Request): Promise<Response> => {
    if (process.env.ENABLE_MCP !== "true") return new Response("Not Found", { status: 404 });
    const authHandler = await getAuthHandler();
    return authHandler(req);
  };
}

export const GET = gated();
export const POST = gated();
