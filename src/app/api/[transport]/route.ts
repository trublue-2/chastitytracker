import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import { timingSafeEqual, createHash } from "crypto";
import { z } from "zod";
import { listEntries } from "@/lib/mcp/entries";
import { loadMcpImage, mcpImageToolVisible } from "@/lib/mcp/entryImage";
import { MCP_MODEL_DOC } from "@/lib/mcpModelDoc";
import { structuredLog, redactDigits } from "@/lib/serverLog";
import {
  checkMcpKeyholder, mcpRequestLock, mcpSetLockPeriod, mcpRequestInspection, mcpSetTrainingGoal, mcpWithdraw,
  mcpListTrainingGoals, mcpEditTrainingGoal, mcpDeleteTrainingGoal, mcpSetCleaning, mcpSetAutoInspections, mcpResolveInspection, mcpEditLockPeriod, mcpEditLockRequest, mcpCreateTask,
  mcpReviewTaskProof, mcpEditTask,
  mcpRequestOrgasm, mcpJudgeOffense, mcpRecordOffense,
} from "@/lib/mcpWrite";
import { DEVICE_NAME_MAX_LENGTH, VALID_CURRENCIES, ORGASMUS_ARTEN, VALID_TYPES, CLEANING_MAX_MINUTES_RANGE, CLEANING_MAX_PER_DAY_RANGE, CLEANING_WINDOWS_MAX, INSPECTION_DELAY_RANGE, INSPECTION_RANDOM_DELAY, INSPECTION_DEADLINE_DEFAULT_H, MCP_IMAGE_MAX_AGE_H, MCP_IMAGE_PER_HOUR, MCP_IMAGE_PER_DAY, type NumberRange, AUTO_INSPECTION_PER_DAY_RANGE, AUTO_INSPECTION_DEADLINE_FROM_RANGE, AUTO_INSPECTION_DEADLINE_TO_RANGE } from "@/lib/constants";
import { verifyAccessToken } from "@/lib/oauth";
// ── MCP V2 ──
import { getSession } from "@/lib/mcp/sessions";
import { queryNotes, upsertNoteDef, linkNoteDef, NOTE_TYPES, NOTE_STATUS, NOTE_SOURCE, NOTE_CONFIDENCE, ENTITY_TYPES } from "@/lib/mcp/notes";
import { listDevicesV2, setDeviceMetaDef, upsertDeviceDef, deleteDeviceDef, SECURITY_LEVELS } from "@/lib/mcp/devices";
import { upsertCategoryDef, deleteCategoryDef } from "@/lib/mcp/categories";
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAME_MAX_LENGTH } from "@/lib/categoryConstants";
import { executeWrite, recordAction, type WriteDef, type WriteSource } from "@/lib/mcp/writeFramework";
import { buildWriteContext } from "@/lib/mcp/common";
import { prisma } from "@/lib/prisma";
import { keyholderDashboard, getBoxState } from "@/lib/mcp/dashboard";
import { deviceStats, records, denialTrend, periodSummary } from "@/lib/mcp/stats";
import { getOffenses, OFFENSE_TYPES } from "@/lib/mcp/ledger";
import { getContext, setHealthHoldDef, upsertAppointmentDef, upsertRecurringContextDef } from "@/lib/mcp/context";
import { timeline } from "@/lib/mcp/timeline";
import { getActionLog } from "@/lib/mcp/actionlog";
import { weightHistory, logWeightDef, setWeightLimitsDef } from "@/lib/mcp/weight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ein Inhaltsblock einer Werkzeug-Antwort — der Typ des SDK, nicht eine Teilmenge daneben. Bis auf
 *  ein Werkzeug liefern alle reinen Text; der Bild-Block trägt base64 statt einer URL, der Client
 *  lädt also nichts nach. */
type ToolContent = ContentBlock;

type ToolResult = { content: ToolContent[]; isError?: boolean };

/** Resolves MCP_USERNAME, runs the aggregator, and wraps the result as a tool response.
 *  Centralizes the misconfig check + error handling shared by all tools.
 *
 *  `render` bestimmt, wie das Ergebnis zu Inhaltsblöcken wird. Alle Werkzeuge bis auf eines nehmen
 *  die Vorgabe (JSON als Text); ein Ergebnis, das kein Text ist, würde sonst durch `JSON.stringify`
 *  und wieder zurück laufen — bei einem base64-Bild verdoppelt das die Nutzlast ohne Gegenwert. */
async function runToolWith<T>(
  label: string,
  fn: (username: string) => Promise<T>,
  render: (data: T) => ToolContent[],
): Promise<ToolResult> {
  const username = process.env.MCP_USERNAME;
  if (!username) {
    return { content: [{ type: "text", text: "Server misconfigured: MCP_USERNAME is not set." }], isError: true };
  }
  try {
    return { content: render(await fn(username)) };
  } catch (e) {
    return { content: [{ type: "text", text: `${label} failed: ${(e as Error).message}` }], isError: true };
  }
}

async function runTool<T>(label: string, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  return runToolWith(label, fn, (data) => [{ type: "text", text: JSON.stringify(data, null, 2) }]);
}

/** Auth context the MCP SDK passes to tool callbacks. The OAuth branch of verifyToken stores the
 *  authorizing user's id under authInfo.extra.userId. */
type ToolExtra = { authInfo?: { extra?: { userId?: string } } };

/** Freitext-Felder der Write-Args — nur hier könnte ein Keyholder einen Code eintippen, also NUR
 *  diese redigieren. IDs (cuids), Zeitstempel und Zahlenwerte bleiben intakt, damit die Audit-Zeile
 *  nachvollziehbar bleibt (welcher Datensatz, welche Deadline). */
// `text` stand im Kommentar unten als Beispiel, fehlte aber in der Liste — ausgerechnet der
// Straftext von `judge_offense`. `title`/`description` kamen mit `record_offense` dazu. Wer ein
// neues Freitext-Feld einführt, trägt es hier ein: die Liste ist die einzige Stelle, an der ein
// versehentlich hineingeratener Kontroll-Code noch abgefangen wird.
const MCP_FREE_TEXT_KEYS = new Set(["message", "comment", "note", "kommentar", "reason", "text", "title", "description"]);

/** Redigiert Ziffernfolgen NUR in Freitext-Feldern (redactDigits gegen versehentliches Code-Leak),
 *  nicht in IDs/Zeitstempeln — geteilt vom Container-Log (`serializeMcpArgs`) UND vom DB-Audit
 *  (`recordAction`-Aufruf in `runWriteTool`): ein Kontroll-Code, der versehentlich in ein Freitext-
 *  Feld wie `message`/`text` gerät, darf nirgends unredigiert landen, auch nicht dauerhaft in
 *  `KeyholderActionLog.argsJson`. */
function redactMcpArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") return args ?? {};
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) =>
      MCP_FREE_TEXT_KEYS.has(k) && typeof v === "string" ? [k, redactDigits(v)] : [k, v],
    ),
  );
}

/** Serialisiert die (redigierten) Write-Args fürs Container-Log. */
function serializeMcpArgs(args: unknown): string {
  return JSON.stringify(redactMcpArgs(args));
}

/** Loggt jeden MCP-Write-Event (Direktive) in die Container-Logs: Tool, Ziel-User, Ausgang und die
 *  Aufruf-Args (Freitext ziffern-redigiert). Reads werden bewusst NICHT geloggt — nur die vom MCP
 *  gesendeten Zustandsänderungen. */
function logMcpWrite(tool: string, args: unknown, outcome: "ok" | "error" | "denied" | "dryrun") {
  structuredLog("MCP", "write", {
    tool,
    user: process.env.MCP_USERNAME ?? "unknown",
    outcome,
    args: serializeMcpArgs(args),
  });
}

/** Loggt einen abgelehnten Write und baut die einheitliche Deny-Antwort — von beiden Write-Wrappern
 *  genutzt, damit Log-Zeile und Fehlertext an einer Stelle liegen. */
function denyWrite(tool: string, args: unknown, reason: string): ToolResult {
  logMcpWrite(tool, args, "denied");
  return { content: [{ type: "text", text: `Write denied: ${reason}.` }], isError: true };
}

/** Wrapper for WRITE tools: enforces keyholder (admin OAuth) authorization, requires a non-empty
 *  `reason` (B-03: same audit obligation as the V2 write framework), then delegates to runTool and —
 *  on success — writes a KeyholderActionLog row so `get_action_log` can finally see these writes too.
 *  The static MCP_TOKEN has no user identity and is therefore always rejected here.
 *
 *  Not atomic with the V1 write itself (unlike executeWrite's V2 path, which commits mutation + audit
 *  in one transaction): `fn()` already committed via its own service call before the audit write runs
 *  here. A crash between the two would leave a mutation without an audit row — an accepted gap for
 *  this lighter-weight V1 pass; the full V1→V2 migration (K-01) closes it structurally. */
async function runWriteTool<T>(label: string, extra: ToolExtra, args: Record<string, unknown>, fn: (username: string) => Promise<T>): Promise<ToolResult> {
  const check = await checkMcpKeyholder(extra?.authInfo?.extra?.userId);
  if (!check.ok) return denyWrite(label, args, check.reason);
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";
  if (!reason) return denyWrite(label, args, `"${label}" requires a non-empty reason (audit is mandatory)`);

  const isDryRun = args.dryRun === true;
  const result = await runTool(label, fn);
  logMcpWrite(label, args, result.isError ? "error" : isDryRun ? "dryrun" : "ok");

  // dryRun committet nichts (siehe mcpWrite.ts) — folgerichtig auch kein Audit-Eintrag, exakt wie
  // der V2-Pfad (executeWrite gibt bei dryRun zurück, bevor die Transaktion je beginnt).
  if (!result.isError && !isDryRun) {
    const username = process.env.MCP_USERNAME;
    if (username) {
      try {
        const ctx = await buildWriteContext(username, extra?.authInfo?.extra?.userId);
        // Kein $transaction: recordAction schreibt hier nur EINE Zeile, und dieser Pfad ist ohnehin
        // nicht atomar mit dem V1-Write selbst (siehe Docblock) — eine Transaktion um einen einzelnen
        // Insert wäre reiner Overhead ohne zusätzliche Garantie.
        await recordAction(prisma, { ctx, tool: label, reason, source: "agent", args: redactMcpArgs(args) });
      } catch (e) {
        // Der Write selbst ist schon committet — ein Audit-Fehler darf ihn nicht rückwirkend als
        // Fehler melden, nur laut werden.
        structuredLog("MCP", "audit-write-failed", { tool: label, error: (e as Error).message });
      }
    }
  }
  return result;
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
  if (!check.ok) return denyWrite(def.tool, raw, check.reason);
  const username = process.env.MCP_USERNAME;
  if (!username) {
    logMcpWrite(def.tool, raw, "error");
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
    logMcpWrite(def.tool, raw, dryRun ? "dryrun" : "ok");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    logMcpWrite(def.tool, raw, "error");
    return { content: [{ type: "text", text: `${def.tool} failed: ${(e as Error).message}` }], isError: true };
  }
}

/** Server-Instructions (MCP `initialize.instructions`) — leiten die Tool-Wahl global, damit der Agent
 *  nicht der Beschreibungs-Ähnlichkeit ausgeliefert ist. */
const MCP_SERVER_INSTRUCTIONS =
  "ChastityTracker Keyholder-MCP. Tool-Wahl:\n" +
  "• LESEN: beginne mit `keyholder_dashboard` (beantwortet ~90 %), dann gezielt die Deep-Views " +
  "(`get_session` für Segmente/deviceBreakdown, `device_stats`, `records`, `period_summary`, `denial_trend`, " +
  "`get_offenses`, `get_context`, `timeline`, `get_devices`, `query_notes`, `get_action_log`, `get_box_state`, " +
  "`list_entries` für Roh-Einträge). Die Auto-Kontroll-Einstellungen und die Reinigungs-Regeln stehen in " +
  "`get_context` (autoInspections + cleaning). Welche Vergehensarten bei diesem Sub überhaupt zählen, " +
  "steht ebenfalls in `get_context` (offenseRules) — nur lesbar, umgelegt werden sie in der " +
  "Admin-Oberfläche, nicht über den MCP.\n" +
  "• DIREKTIVEN (Sperrzeit, Inspektion, Orgasmus, Strafe, Trainingsziele, Reinigung): `set_lock_period`, " +
  "`request_lock`, `request_inspection`, `request_orgasm`, `judge_offense`, `record_offense`, `set_training_goal`, " +
  "`set_cleaning`, `set_auto_inspections`, `withdraw`, `edit_lock_period`, `edit_lock_request`, `resolve_inspection`, … Ein Vergehen, das " +
  "der Tracker nicht sehen kann (gebrochene Abmachung, Unhöflichkeit), notierst du mit `record_offense`; " +
  "beurteilt wird es danach wie jedes andere. `set_cleaning` deckt ALLE " +
  "Reinigungs-Regeln ab, auch die Tages-Fenster (`windows` — ersetzt die ganze Liste, `[]` löst die Reinigung von der " +
  "Uhrzeit statt sie zu verbieten). Eine EINZELNE Kontrolle veranlasst du weiterhin von Hand über " +
  "`request_inspection`; die REGELN der automatischen Kontrollen (Hauptschalter, Anzahl/Tag, Schlaf-Fenster, " +
  "Fristen, festes Auslöse-Fenster, nur-bei-Sperrzeit) ändert `set_auto_inspections` — Bestand lesen in " +
  "get_context.autoInspections. Zusätzlich zum Tagesplan folgt auf jeden " +
  "Wiederverschluss nach einer Reinigungspause selbsttätig eine Kontrolle — feste Regel, keine Einstellung " +
  "(Details: `explain_model`, Abschnitt 3).\n" +
  "• INVENTAR: Geräte und Kategorien pflegst du selbst — `upsert_device` (anlegen/umbenennen, " +
  "Kategorie, Preis, Kontroll-Code-Pflicht), `upsert_category` (anlegen/ändern inkl. der drei Regeln; " +
  "an der eingebauten KG-Kategorie sind die Regeln unveränderlich), `delete_device`/`delete_category` " +
  "zum Wegräumen. Bestand samt Kategorie-ids: `get_devices`.\n" +
  "• WISSEN/META/KONTEXT: `upsert_note`, `link_note`, `set_device_meta`, `set_health_hold`, " +
  "`upsert_appointment`, `upsert_recurring_context`. Diese Schicht ist dein GEDÄCHTNIS: zwischen zwei " +
  "Sitzungen erinnerst du nur, was hier in der DB steht — vom Gespräch bleibt nichts. Halte darum fest, " +
  "was du gelernt hast (`upsert_note`; `refs` hängt die Notiz gleich ans Objekt, `link_note` nur für " +
  "bestehende Notizen), pinne Dauervorgaben und Grenzen (`type` DIRECTIVE bzw. BOUNDARY mit `doDont`, " +
  "dazu `pinned: true` — nur gepinnte Notizen dieser beiden Typen stehen im Dashboard oben) und trage " +
  "genannte Termine sofort ein (`upsert_appointment`, wiederkehrende Muster `upsert_recurring_context`). " +
  "Eine Sitzung, die nur Direktiven vergibt und nichts festhält, ist unvollständig.\n" +
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

/**
 * Macht die Eingabe-Schemas ALLER danach registrierten Tools strikt: ein Feld, das im Schema nicht
 * steht, führt zu einem Fehler statt still verworfen zu werden. Verändert `server` an Ort und
 * Stelle und gibt bewusst nichts zurück — ein Rückgabewert läse sich wie eine Hülle, die er nicht ist.
 *
 * **Warum das nötig war (Befunde vom 23.08.2026):** Zod verwirft unbekannte Schlüssel
 * standardmässig lautlos. `period_summary { granularity, periods }` lieferte darum ohne Murren
 * immer dieselbe feste Auswertung, und `upsert_device { id, trackingEnabled: false }` meldete
 * `ok: true` mit leerem `diff` — das Feld hängt an der Kategorie, nicht am Gerät. In beiden Fällen
 * bekam die Aufruferin die Bestätigung einer Wirkung, die es nicht gab. Ein still ignorierter
 * Parameter ist die schlechteste der drei möglichen Antworten; ein Fehler ist die ehrlichste.
 *
 * Sitzt hier und nicht an 48 Registrierungen: eine Regel, die man je Tool wiederholen muss, gilt
 * über kurz oder lang nicht mehr für alle. `z.strictObject` schreibt zusätzlich
 * `additionalProperties: false` in das veröffentlichte JSON-Schema — die Aufruferin sieht die
 * Schranke also, bevor sie dagegen läuft.
 */
function makeInputsStrict(server: McpServer): void {
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: { inputSchema?: z.ZodRawShape }, cb: unknown) =>
    register(name, { ...config, inputSchema: z.strictObject(config.inputSchema ?? {}) } as never, cb as never)
  ) as typeof server.registerTool;
}

/** Registriert alle MCP-Tools auf dem Server. */
function registerTools(server: McpServer) {
    makeInputsStrict(server);
    server.registerTool(
      "list_entries",
      {
        title: "List raw entries (full detail)",
        description:
          "Returns the raw entry timeline with ALL per-entry detail needed to understand the " +
          "full situation: each entry's type, timestamp, free-text note/comment, opening reason " +
          "(oeffnenGrund), orgasm type (orgasmusArt), control code, code verification status, device, " +
          "the device-check (deviceCheck: was the locked device recognised in the control photo — " +
          "status pending/ok/wrong/missing/not_checked — wrong NUR mit benanntem detected, sonst not_checked; " +
          "pending = the recognition is still running, ask again in a few minutes, do NOT read it as a result), " +
          "why the code verification did not match (verifikationFailure: reason + what was read — the only way " +
          "to tell an unreadable code from a wrong one when verifikationStatus is null), " +
          "whether a photo exists (+ its EXIF capture time), whether a key-box photo exists (hasBoxImage), " +
          "the entry id (the address get_image takes) and whether the time was back-/post-dated. " +
          "Newest first. Use this for the narrative context that the aggregate tools (keyholder_dashboard, " +
          "get_session, get_offenses) leave out.",
        inputSchema: {
          type: z.enum(VALID_TYPES).optional().describe("Filter by entry type. Omit for all types."),
          limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
        },
      },
      (args) => runTool("list_entries", (username) => listEntries(username, args)),
    );

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
        title: "Get session(s) with segments + deviceBreakdown (all categories)",
        description:
          "Die KORREKTE Antwort auf 'welches Gerät war Session X'. Über ALLE Kategorien: eine KG-Session " +
          "zerfällt an REINIGUNG-Öffnungen in Segmente (pro Segment GENAU EIN Gerät); Trage-Sessions der " +
          "übrigen Kategorien (Plug, Halsband, Knebel) haben genau ein Segment und das deklarierte Gerät. " +
          "Liefert pro Session `category`, `deviceBreakdown` (Stunden je Gerät), `segments[]` (declared vs. " +
          "bild-verifiziertes Gerät + `deviceConfidence`: declared|undeclared|image-confirmed|" +
          "image-conflict|cluster-ambiguous — undeclared = KEIN Gerät angegeben, kein Vergehen), inline " +
          "verknüpfte Notes (explain_model) und `dataQualityFlags` (z.B. declared≠verified oder " +
          "undeclared). Ohne sessionId werden die neuesten Sessions " +
          "aufgelistet — mit `category` nur die einer Kategorie. Zeiten als ISO-8601 mit Offset.",
        inputSchema: {
          sessionId: z.string().optional().describe("Eine bestimmte Session (Lock-Entry-id). Omit = neueste auflisten."),
          category: z.string().optional().describe('Nur Sessions dieser Kategorie (Name, z.B. "KG" oder "Plug"). Omit = alle.'),
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
          "MCP V2 — Geräte-Inventar inkl. der Entscheidungs-Metadaten (explain_model): securityLevel " +
          "(SECURING|TRUST_ONLY; v.a. für sichernde Geräte wie KG oder Halsreif — null ist keine " +
          "Datenlücke), lookalikeClusterId (Mismatch INNERHALB eines Clusters ist nie ein " +
          "Vergehen), pullOffRisk (true = abstreifbar/unsicher, false = geprüft sicher, null = nie " +
          "beurteilt), material, bauform, healthFlags, retentionNotes, trackingEnabled (false = " +
          "Inventory-only-Kategorie, liefert per Design keine Sessions), referenceImages (BEWUSST nur die " +
          "Anzahl — die Bilder wertet der Server für deviceConfidence aus und sie sind via MCP nicht " +
          "abrufbar) — plus inline verknüpfte Notes. Archivierte Geräte sind per Default ausgeblendet. " +
          "`categories` listet ALLE Kategorien des Subs (unabhängig von den Geräte-Filtern) mit id, Regeln " +
          "und Zählungen — die ids braucht `upsert_device` für die Zuordnung. SCHREIBEN: Inventar (Name, " +
          "Beschreibung, Kategorie, Preis, Kontroll-Code-Pflicht) mit `upsert_device`, Beurteilungs-" +
          "Metadaten (inkl. archived) mit `set_device_meta`, Kategorien mit `upsert_category`; " +
          "`delete_device`/`delete_category` räumen weg.",
        inputSchema: {
          deviceId: z.string().optional().describe("Nur dieses eine Gerät (per id) zurückgeben."),
          includeNotes: z.boolean().optional().describe("Inline-Notes mitliefern (Default true). false spart den teuersten Teil des Calls."),
          includeArchived: z.boolean().optional().describe("Auch archivierte (ausgemusterte) Geräte mitliefern (Default false)."),
        },
      },
      (args) => runTool("get_devices", (u) => listDevicesV2(u, args)),
    );

    server.registerTool(
      "keyholder_dashboard",
      {
        title: "Keyholder dashboard (one call answers ~90%)",
        description:
          "MCP V2 — DER Einstiegs-Call: WICHTIG: keyholderInstructions (erstes Feld) sind die " +
          "verbindlichen Freitext-Regeln des menschlichen Keyholders — vor jeder Direktive lesen und " +
          "befolgen, nicht nur zur Kenntnis nehmen. Ausserdem: currentRun vs. Personal Best, was JETZT " +
          "getragen wird (KG + alle Kategorien), nextRelevant (offene Kontrolle / aktive Sperrzeit inkl. " +
          "reinigungErlaubt = erlaubt die Sperre Reinigungsöffnungen? / offenes Orgasmus-Fenster), " +
          "Ziele + Adhärenz (Tag/Woche/Monat-Erfüllung), offene Vergehen (Top 5), gepinnte " +
          "standingDirectives + boundaries (fallen nie aus einem Recency-Fenster), scheduledDirectives " +
          "(vom Keyholder TERMINIERTE, noch nicht ausgelöste lock_request/lock_period/manuelle inspection — " +
          "für den Sub noch unsichtbar, via `withdraw` stornierbar; Auto-Kontrollen bewusst NICHT enthalten), BoxState, HealthHold, " +
          "dataDiscrepancies (echte Bild-Diskrepanzen als Hinweis, KEINE Vergehen; cluster-interne " +
          "Verwechslungen ausgeblendet) und currentRun.todayIncludesPriorSession (today enthält Anteil " +
          "einer früheren Session → ≠ Lauf-Dauer). currentRun.since = Lauf-Anfang (deckt sich mit " +
          "durationHours); currentRun.currentSegmentSince/currentSegmentDurationHours = Beginn und Dauer " +
          "des AKTUELLEN Segments, weichen bei Reinigungspausen von since/durationHours ab (A-01). " +
          "ACHTUNG bei wornNow: `deviceName` nennt das Gerät des aktuellen SEGMENTS, `since`/" +
          "`durationHours` messen den ganzen LAUF — nach einem Gerätewechsel in einer Pause gehören die " +
          "beiden NICHT zusammen. Die zum Gerät passende Uhr ist `deviceSince`/`deviceDurationHours`. " +
          "Zeiten durchgängig ISO-8601 mit Offset. Nutze die " +
          "Deep-Views (get_session, device_stats, records, denial_trend, get_offenses) nur für Details.",
        inputSchema: {},
      },
      () => runTool("keyholder_dashboard", keyholderDashboard),
    );

    server.registerTool(
      "device_stats",
      {
        title: "Per-device wear statistics (from sessions)",
        description:
          "Pro Gerät aus SESSIONS (nicht Labels): sessionCount, total/avg/median/min/max-Stunden, längste " +
          "einzelne Session (maxHours) und zuletzt getragen. sessionCount zählt, wie oft ein Gerät GETRAGEN " +
          "wurde — eine Reinigungspause trennt nicht (ein durchgehend getragenes KG bleibt EINE Session). " +
          "Vorberechnet — keine Rekonstruktion aus Rohdaten nötig. `devices` enthält nur echte Geräte; " +
          "KG-Zeiten ohne Geräte-Zuordnung stehen separat in `unassigned` (Projektgeschichte, kein Gerät). " +
          "Nie getragene Geräte (auch Inventory-only-Kategorien, trackingEnabled=false) fehlen hier ganz — " +
          "Abwesenheit ist keine Nichtnutzung; Inventar-Wahrheit ist get_devices.",
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
          "Tage seit Rekord, Stunden seit letztem Orgasmus und längste orgasmusfreie Strecke. " +
          "longestRunHours ist eine SESSION-Bruttosumme über Segmente/Geräte hinweg (Reinigungspausen " +
          "raus, Gerätewechsel NICHT getrennt) — für die ehrliche Dauertrage-Marke " +
          "longestUnbrokenSegmentHours nutzen (längstes EINZELNES abgeschlossenes Segment, ein Gerät, " +
          "keine Pause darin) + currentUnbrokenSegmentHours/currentUnbrokenVsBestPct fürs laufende " +
          "Segment (A-14). Vorberechnet.",
        inputSchema: {},
      },
      () => runTool("records", records),
    );

    server.registerTool(
      "period_summary",
      {
        title: "Period summary (day/week/month) + goal fulfillment",
        description:
          "MCP V2 — Tag/Woche/Monat/Jahr-Tragestunden für KG und je Kategorie inkl. Ziel-Erfüllung (pct). " +
          "Eine Quelle für die Adhärenz-Frage. Liegt eine Zielgrenze (Beginn/Ende einer Vorgabe) INNERHALB " +
          "einer Periode, ist deren pct bewusst null und goalChangedInPeriod.<periode> true: Ist-Stunden der " +
          "ganzen Periode gegen ein Ziel für einen Teil davon ergäbe keine Aussage. Die Absolutwerte daneben " +
          "gelten weiter; ein angebrochener TAG bekommt gar kein Ziel (goalDayH null), weil ein Tagesziel " +
          "einen Tagesbogen misst und keinen Nachmittag. Nimmt KEINE Parameter — granularity/periods gibt es " +
          "nicht, ein Aufruf damit schlägt fehl statt sie still zu ignorieren.",
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
          "Orgasmus), longestDenialH, avgIntervalH + recentAvgIntervalH (Mittelwerte, informativ) + " +
          "trendRising (steigt die Entsagung? MEDIAN-Vergleich jüngstes 3er-Fenster vs. Rest, toleriert " +
          "GENAU EINEN Ausreisser im Fenster, nicht zwei; null bei <8 Intervallen insgesamt statt " +
          "einer vorgetäuschten Aussage — A-10, MCP-Befundliste 2026-07-17), recentWindowN (Grösse " +
          "des Fensters) + trendConfidence (low<8/medium<15/high — grobe Datenlage-Einschätzung, " +
          "kein Signifikanztest), und orgasmHistory[] (Zeitpunkt, Intervall zum vorigen, Geräte-Kontext).",
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
          "MCP V2 — vereinheitlichtes Disziplin-Ledger: alle erkannten Vergehen (" + OFFENSE_TYPES.join(", ") + ") als EINE Liste mit " +
          "status (open|judged), judgment, Folge (consequence) und Kontext + inline Notes. Bei wrong_device " +
          "kommt der Cluster-Kontext des getragenen Geräts mit (possiblyClusterInternal) — Cluster-interne " +
          "Mismatches sind nie ein echtes Vergehen; urteile via judge_offense. Filter optional — die " +
          "Zähler (detectedOffenseCount/openOffenseCount/pendingPenaltyCount) bleiben UNGEFILTERTE Gesamtstände.",
        inputSchema: {
          type: z.enum(OFFENSE_TYPES).optional().describe("Nur diesen Vergehenstyp."),
          openOnly: z.boolean().optional().describe("Nur noch nicht beurteilte (status open)."),
          from: z.string().optional().describe("ISO-8601 untere Grenze auf detectedAt."),
          to: z.string().optional().describe("ISO-8601 obere Grenze auf detectedAt."),
          limit: z.number().int().min(1).max(200).optional().describe("Neueste zuerst, dann auf limit gekürzt."),
        },
      },
      (args) => runTool("get_offenses", (u) => getOffenses(u, args)),
    );

    server.registerTool(
      "get_context",
      {
        title: "Get life context (recurring + appointments + health hold)",
        description:
          "MCP V2 — Kontext um das echte Leben (explain_model): aktiver HealthHold (Gesundheits-Zurückhaltung), " +
          "die Einstellungen der AUTOMATISCHEN Kontrollen (autoInspections: active/perDayMin/perDayMax/Schlaf-Fenster/" +
          "Fristen/Auslöse-Fenster — geändert werden sie mit `set_auto_inspections`), die Reinigungs-Regeln (cleaning: allowed/" +
          "maxMinutesPerBreak/maxPausesPerDay/usedToday/windows/windowOpenNow/windowsBinding/" +
          "windowsBindingReason/openingAllowedNow — geändert werden sie mit `set_cleaning`; windows binden NUR während einer aktiven Sperrzeit, " +
          "die Reinigen erlaubt; openingAllowedNow beantwortet direkt, ob JETZT eine Reinigungsöffnung " +
          "erlaubt ist, statt windows/windowOpenNow selbst zu verrechnen), die geltenden Vergehens-Regeln " +
          "(offenseRules: welche Arten bei diesem Sub zählen — off/on, bei unauthorized_orgasm zusätzlich " +
          "lockedOnly/always; NUR LESBAR, es gibt bewusst kein Tool zum Umlegen — das entscheidet der Mensch " +
          "in der Admin-Oberfläche, suche also nicht danach), der wiederkehrende " +
          "Kontext (HO-Tage, Bürotage, Pilates …, weekday 0=So..6=Sa, deviceFree; ordinal/ordinalLabel " +
          "grenzt monatliche Slots ein — z.B. 'erster Mittwoch im Monat') und anstehende Termine " +
          "(per Default ab jetzt, geräte-frei-Flag). Für die Planung von Ankern/Kontrollen. " +
          "appointmentsFrom/-To öffnen vergangene Termine (lesbar UND via upsert_appointment(id) korrigierbar).",
        inputSchema: {
          appointmentsFrom: z.string().optional().describe("ISO-8601 untere Grenze für appointments (Default: jetzt)."),
          appointmentsTo: z.string().optional().describe("ISO-8601 obere Grenze für appointments (optional)."),
        },
      },
      (args) => runTool("get_context", (u) => getContext(u, args)),
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
          "Append-only Audit ALLER mutierenden Aktionen (V1 wie V2, seit B-03 — vorher nur V2) mit reason + " +
          "decisionSource (agent|user-stated; umbenannt von source, kollidierte mit args.source) + actorLabel: was hat welche " +
          "Instanz wann mit welcher Begründung entschieden. Die nächste Instanz erbt Entscheidungen samt " +
          "Begründung. Für die AUTORITATIVE Ziel-Historie (auch UI-gesetzte Ziele) list_training_goals " +
          "nutzen; dieses Log liefert nur das Warum/Wann der MCP-Änderungen (filter tool=\"set_training_goal\"). " +
          "Achtung: `reason`-Texte hier sind wie Notes NICHT für den Sub gedacht — beim Formulieren keinen " +
          "Note-Inhalt verbatim wiederholen, der geheim bleiben soll.",
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
          "MCP V2 — Zustand der elektronischen Schlüsselbox (explain_model): locked (SOLL: soll die Box zu sein), " +
          "reportedLocked (IST: war sie beim letzten Sync wirklich zu; kann vom SOLL abweichen — 'soll " +
          "zu, steht offen und wartet auf Knopf/USB', denn zufahren tut die Box nur mit jemandem am " +
          "Gerät; null = noch keine IST-Meldung, dann gilt das SOLL), lockUntil, battery, charging, " +
          "lastSeen (letzter Sync). hardwareEnforced ist die EINE ehrliche Vollstreckungs-Antwort — " +
          "hält die Box den Schlüssel gerade fest, UNABHÄNGIG davon, ob sie online ist (der zuletzt " +
          "gemeldete Zustand gilt, bis die Box etwas anderes meldet). true nur, wenn das IST zu meldet " +
          "UND keyInBox!==false UND !openArmed UND !staleLock. Ist hardwareEnforced false, nennt genau " +
          "EIN Feld das WARUM: locked:false (soll offen), reportedLocked:false (steht offen), " +
          "keyInBox:false (Ehrensache, Schlüssel beim Sub), openArmed:true (zu, aber ein Knopfdruck vom " +
          "Offen entfernt) oder staleLock:true. openArmed = die Öffnung ist SCHARFGESTELLT: Frist " +
          "verstrichen oder SOLL offen — seit FW 0.2.34 öffnet die Box dann nicht mehr von selbst, " +
          "sondern beim nächsten Knopf/USB-Kontakt, ohne weitere Prüfung. staleLock = die Box hat sich " +
          "seit dem letzten Sync per Offline-Failsafe (nach offlineOpenHours ohne Sync) selbst " +
          "geöffnet — der einzige verbliebene deterministische Selbst-Öffner neben Akku-Not; passiert " +
          "auch offline, „online\" spielt bewusst keine Rolle. " +
          "keyInBox = Deklaration des Subs beim laufenden Verschluss: false heisst, der Schlüssel liegt " +
          "NICHT in der Box (er trägt ihn bei sich, z.B. auf Reise) — dann hat die Box bewusst kein lock " +
          "bekommen, und das ERKLÄRT ein hardwareEnforced:false, das sonst wie eine Box-Störung aussieht. " +
          "null = nicht erklärt oder nicht verschlossen, also KEIN 'nein'. " +
          "keySecured beantwortet direkt, was eine Alleinzeit-Vorgabe verlangt (Käfig zu UND " +
          "Schlüssel drin): reportedLocked===true && keyInBox===true && !staleLock — beide MÜSSEN " +
          "explizit true sein UND die Box darf sich nicht seit dem letzten Sync selbst geöffnet " +
          "haben, kein Fallback auf locked wie bei hardwareEnforced. Nicht selbst aus " +
          "reportedLocked+keyInBox zusammenrechnen (A-06, MCP-Befundliste 2026-07-17). " +
          "failsafeWarnings = VORWARNUNG vor einer autonomen Selbst-Öffnung, fertig gerechnet: " +
          "offlineOpen (Funkstille — hoursOffline, thresholdHours = das Fenster der Box, hoursLeft, " +
          "dueAt) und lowBatteryOpen (percent, opensAtPercent). severity info/warn/due bei " +
          "offlineOpen, nur warn/due bei lowBatteryOpen; due heisst, die Not-Öffnung ist erfolgt ODER " +
          "steht unmittelbar bevor. [] heisst 'kein Anlass ODER keine Datenbasis' — eine nie " +
          "gesynchronisierte Box und eine Alt-Zeile ohne gemeldete Schwellen schweigen ebenfalls, " +
          "Stille ist also kein Beleg für Ungefährlichkeit. Verhindern " +
          "lässt sie sich NUR, indem rechtzeitig jemand für Netz bzw. Strom sorgt — wenn hier etwas " +
          "steht, gehört es dem Sub gesagt. ACHTUNG: hardwareEnforced/keySecured/staleLock kennen nur " +
          "den Funkstille-Öffner; ein lowBatteryOpen:due kann neben hardwareEnforced:true stehen — " +
          "dann gilt die Warnung. " +
          "boxState:null = keine Box registriert. Auch im keyholder_dashboard enthalten.",
        inputSchema: {},
      },
      () => runTool("get_box_state", getBoxState),
    );

    // ── WRITE tools — keyholder directives (require an admin OAuth token; act on MCP_USERNAME) ──
    // All write tools MUST respect the human keyholder's rules in keyholder_dashboard.keyholderInstructions.
    const KEYHOLDER_BASE =
      " Keyholder action (requires an admin OAuth token). Execute directly — NO confirmation step is " +
      "required or enforced; act on your own judgement per the human keyholder's rules in " +
      "keyholder_dashboard.keyholderInstructions. Do not ask the user to confirm before calling this. " +
      "`reason` is REQUIRED (audit log, see get_action_log). `dryRun:true` previews the effective " +
      "arguments and the rules checkable without committing — NOT a full state check (that runs only " +
      "on the real commit) and not logged to get_action_log.";
    // B-03: Pflichtfeld für ALLE Write-Tools (V1 wie V2) — dieselbe Instanz für beide, damit die
    // Beschreibung nicht zweimal gepflegt wird. V1-Tools werfen ohne reason in runWriteTool; V2 wirft
    // in executeWrite (writeFramework.ts).
    const reasonField = z.string().min(1).describe("REQUIRED: why you're doing this (audit log, get_action_log).");
    // K-01 (leichte Variante): dryRun für alle 12 V1-Tools — zeigt die effektiven Argumente + die
    // hier prüfbaren Regeln (mcpWrite.ts), OHNE zu committen. Bewusst EIGENES Feld statt des V2-
    // `dryRunField` weiter unten: die V2-Vorschau prüft den vollen Service-Zustand (executeWrite
    // ruft dieselbe preview()-Logik wie apply()); die V1-Vorschau tut das NICHT (siehe Docblock in
    // mcpWrite.ts) — dieselbe Beschreibung für beide zu verwenden würde das V2-Versprechen aufweichen.
    const dryRunFieldV1 = z.boolean().optional().describe("true = nur Vorschau, NICHT committen. Prüft Argument-Auflösung + die hier verfügbaren Regeln — NICHT alle service-internen Zustandsprüfungen (die laufen erst beim echten Commit).");
    // Ein geklemmtes Zahlen-Feld der Settings-Tools: Schema-Grenzen UND der Bereich im Text kommen aus
    // DERSELBEN `NumberRange`. Vorher stand der Bereich nur im Text, während das Schema alles bis zur
    // Integer-Grenze zuliess — ein Client sah die echten Grenzen nicht und verliess sich auf den
    // stillen Clamp im Service. Über diese Helferin können die beiden nicht mehr auseinanderlaufen.
    // Damit lehnt der MCP-Pfad ab, wo der Service klemmen würde; der Admin-Formular-Pfad klemmt
    // weiterhin still (er hat kein Schema, sein Eingabefeld begrenzt schon beim Tippen). Nicht jedes
    // Zahlenfeld passt hier hinein: `delayMinutes` etwa hat mit 0/weggelassen zwei Sonderwerte
    // AUSSERHALB seines Bereichs und nennt ihn deshalb weiter nur im Text.
    const rangeField = (range: NumberRange, text: string, extra = "") =>
      z.number().int().min(range.min).max(range.max).optional().describe(`${text} (${range.min}–${range.max}).${extra}`);
    // Notifizierende Keyholder-Tools (Lock/Periode/Orgasmus …) → Notify-Versprechen.
    const KEYHOLDER_NOTE = KEYHOLDER_BASE + " The user is notified by e-mail + push.";
    // Tools, die auch auf TERMINIERTE (noch nicht ausgelöste) Direktiven wirken: dort schweigt der
    // Tracker. Eine geplante Direktive ist für den Sub unsichtbar; sie zu melden verriete sie — genau
    // das, was die Terminierung verhindern soll.
    const SCHEDULED_SILENT =
      " NOTE: if the directive is still SCHEDULED (not yet triggered), the user is NOT notified — " +
      "they never learned it existed, and telling them now would disclose it. The response says which " +
      "case applied.";
    // STILLE Keyholder-Tools → KEIN aktiver Notify (weder E-Mail noch Push). Nur die
    // notifizierenden Aktionen (Lock, Lock-Periode, Inspektion, Orgasmus) senden eine Nachricht.
    const KEYHOLDER_SILENT = KEYHOLDER_BASE + " The user is NOT notified (no e-mail/push).";
    // Für alle Tools mit delayMinutes/scheduledAt (request_lock, set_lock_period, request_inspection,
    // request_orgasm, create_task):
    // der Trigger-Zeitpunkt selbst darf dem Sub nie mitgeteilt werden (nicht in message/comment, nicht
    // im Gespräch) — sonst ist der Überraschungseffekt der Terminierung hinfällig.
    // Beide Edit-Tools teilen die Zielwahl (`pickEditTarget`) — und damit auch ihre Beschreibung.
    // Vorher stand die Regel in beiden Tool-Texten und beiden id-Feldern, also viermal.
    const MULTI_OPEN_NOTE = (what: string) =>
      ` More than one ${what} can be open at once; with more than one open, id is REQUIRED and the ` +
      `error names the candidates. Any others stay untouched and are named in the answer.`;
    const editIdField = (what: string, source: string) =>
      z.string().optional().describe(`Which ${what} to edit (id from ${source}). Optional only while exactly one is open.`);
    const NO_SCHEDULE_DISCLOSURE =
      " IMPORTANT: never disclose the scheduled trigger time (delayMinutes/scheduledAt) to the user — " +
      "not in the message/comment field, not in conversation. Revealing it defeats the point of scheduling.";

    server.registerTool(
      "request_lock",
      {
        title: "Request lock-up",
        description:
          "Asks the user to lock up within a deadline (creates a VerschlussAnforderung). An IMMEDIATE " +
          "request requires the user to be open right now; a SCHEDULED one may be queued while they are " +
          "still locked (it self-cancels if they are still locked when it triggers). Optionally enforce a " +
          "lock period after lock-up — either a minimum wearing duration (minDurationHours, relative to the " +
          "actual lock-up) or an absolute end (lockUntilAt, fixed wall clock) — plus a specific device. " +
          "Several lock requests can be open at once: a new one does NOT replace an existing one, and a " +
          "single lock-up fulfils all of them (use edit_lock_request to change one, withdraw with id to " +
          "cancel one). Can be scheduled/time-delayed so the user does not know exactly when it " +
          "strikes; the deadline then counts from the trigger time." + NO_SCHEDULE_DISCLOSURE + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe("Hours to lock up by, counted from when the request is triggered. Use this or deadlineAt."),
          deadlineAt: z.string().optional().describe("Absolute deadline (ISO 8601, must be in the future). Overrides deadlineHours."),
          minDurationHours: z.number().positive().optional().describe("Min wearing duration (h) enforced after lock-up via an auto lock period — counted from the actual lock-up. Mutually exclusive with lockUntilAt."),
          lockUntilAt: z.string().optional().describe("Absolute lock end (ISO 8601) enforced after lock-up — fixed wall clock, a late lock-up does NOT shift it. Mutually exclusive with minDurationHours."),
          cleaningAllowed: z.boolean().optional().describe("Let cleaning openings not break the resulting lock period. Only has an effect together with minDurationHours/lockUntilAt."),
          deviceName: z.string().optional().describe("Require a specific device by name."),
          message: z.string().optional().describe("Message shown to the user."),
          delayMinutes: z.number().optional().describe("Delay before the request reaches the user, in minutes. Omit/0 = immediate."),
          scheduledAt: z.string().optional().describe("Absolute send time (ISO 8601). Overrides delayMinutes. The user cannot see the request until then."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("request_lock", extra, args, (u) => mcpRequestLock(u, args)),
    );

    server.registerTool(
      "set_lock_period",
      {
        title: "Set lock period (Sperrzeit)",
        description:
          "Sets a lock period during which the user may not open (creates a SPERRZEIT). Only valid " +
          "when the user is currently locked. Provide untilAt or durationHours, or set indefinite=true. " +
          "Can be scheduled/time-delayed so it starts (and the user is notified) only later." + NO_SCHEDULE_DISCLOSURE + KEYHOLDER_NOTE,
        inputSchema: {
          untilAt: z.string().optional().describe("Lock until this absolute time (ISO 8601)."),
          durationHours: z.number().positive().optional().describe("Lock for this many hours. Counts from when the lock period starts (after any delay)."),
          indefinite: z.boolean().optional().describe("Lock indefinitely (no end). Overrides untilAt/durationHours."),
          reinigungErlaubt: z.boolean().optional().describe("Allow cleaning openings without breaking the lock period."),
          message: z.string().optional().describe("Message shown to the user."),
          delayMinutes: z.coerce.number().optional().describe("Delay before the lock period starts/sends, in minutes. Omit/0 = immediate."),
          scheduledAt: z.string().optional().describe("Absolute start/send time (ISO 8601). Overrides delayMinutes."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("set_lock_period", extra, args, (u) => mcpSetLockPeriod(u, args)),
    );

    server.registerTool(
      "request_inspection",
      {
        title: "Request inspection (Kontrolle)",
        description:
          "Requests a photo inspection: e-mails the user a code they must show in a photo within a " +
          "deadline (default 4h). Targets the chastity device by default (requires the user to be " +
          "locked), or a wear category via `category` (requires a running wear session in it). One " +
          "inspection per target may be open at a time — a KG and a plug inspection can run in " +
          "parallel. Can be triggered time-delayed so the user does not know exactly when it strikes."
          + NO_SCHEDULE_DISCLOSURE + KEYHOLDER_NOTE,
        inputSchema: {
          deadlineHours: z.number().positive().optional().describe(`Deadline in hours (default ${INSPECTION_DEADLINE_DEFAULT_H}). Fractions allowed, e.g. 0.25 for 15 minutes. Counts from when the inspection is triggered.`),
          comment: z.string().optional().describe("Instruction shown to the user."),
          category: z.string().optional().describe('Target category, e.g. "Plug". Omit or "KG" for the chastity device.'),
          device: z.string().optional().describe("Target exactly this device (by name) instead of any device of the category. It must be the one currently locked/worn."),
          delayMinutes: z.coerce.number().optional().describe(
            `Delay before the code reaches the user. Omit for a random ${INSPECTION_RANDOM_DELAY.min}–${INSPECTION_RANDOM_DELAY.max} min delay; `
            + `0 = immediate; any other value is clamped to ${INSPECTION_DELAY_RANGE.min}–${INSPECTION_DELAY_RANGE.max} `
            + "(the response reports the effective value and flags a clamp).",
          ),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("request_inspection", extra, args, (u) => mcpRequestInspection(u, args)),
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
          "at a time). The user is notified by e-mail + push." + KEYHOLDER_NOTE + NO_SCHEDULE_DISCLOSURE,
        inputSchema: {
          art: z.enum(["ANWEISUNG", "GELEGENHEIT"]).describe("ANWEISUNG = mandatory (penalty if missed); GELEGENHEIT = permitted opportunity (no penalty)."),
          beginsAt: z.string().optional().describe("Window start (ISO 8601). Default: now."),
          endsAt: z.string().optional().describe("Window end (ISO 8601). Use this or windowHours."),
          windowHours: z.number().positive().optional().describe("Window length in hours from beginsAt, when endsAt is omitted."),
          // Kein statisches Enum: die gültigen Arten sind pro Sub anpassbar (reasonsService). Der
          // Write-Service validiert `vorgegebeneArt` gegen die effektive Liste des Ziel-Subs.
          requiredType: z.string().optional().describe(`Require a specific orgasm type (must be one of the sub's configured types; built-in defaults: ${ORGASMUS_ARTEN.join(", ")}). Omit = any orgasm counts.`),
          openAllowed: z.boolean().optional().describe("Allow opening the device to perform the orgasm during the window (no lock break / penalty)."),
          delayMinutes: z.number().optional().describe("Delay before the directive reaches the user, in minutes. Omit/0 = immediate. Until it triggers the window does not apply: it grants no opening and cannot be fulfilled."),
          scheduledAt: z.string().optional().describe("Absolute send time (ISO 8601). Overrides delayMinutes. The user cannot see the directive until then."),
          message: z.string().optional().describe("Message shown to the user."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("request_orgasm", extra, args, (u) => mcpRequestOrgasm(u, args)),
    );

    server.registerTool(
      "set_training_goal",
      {
        title: "Set training goal (Vorgabe)",
        description:
          "Sets a wear-time goal (min hours per day/week/month) for KG or a named category. Without " +
          "validFrom the goal starts at the user's NEXT MIDNIGHT, not at the moment of the call — a goal " +
          "that begins mid-period splits that period and makes its fulfilment percentage meaningless. " +
          "Pass validFrom to schedule a later start, or to start mid-period on purpose; periods holding a " +
          "goal boundary then report their percentage as null (see period_summary.goalChangedInPeriod). " +
          "Goals are chained per category by start date, so a new goal automatically ends the current one " +
          "of that category at its start. At least one period target is required." + KEYHOLDER_SILENT,
        inputSchema: {
          category: z.string().optional().describe('Category name, e.g. "Plug". Omit or "KG" for the chastity device.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month."),
          minPerYearHours: z.number().nonnegative().optional().describe("Min hours per year. Prorated to the goal's overlap with the year when it starts/ends mid-year."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601, e.g. 2026-06-12). Omit to start at the user's next midnight — the next period boundary. Set it to schedule a goal in advance, or to start mid-period deliberately."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit for open-ended."),
          note: z.string().optional().describe("Note shown with the goal."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("set_training_goal", extra, args, (u) => mcpSetTrainingGoal(u, args)),
    );

    server.registerTool(
      "withdraw",
      {
        title: "Withdraw an open directive",
        description:
          "Withdraws the user's currently open lock request, active lock period, open inspection, or orgasm directive. " +
          "Also cancels SCHEDULED (not yet triggered) directives of the same kind — a lock_request/lock_period/" +
          "inspection whose wirksamAb is still in the future (see keyholder_dashboard.scheduledDirectives). " +
          "Without id this hits ALL open ones of that kind — since several lock requests can be open at once, " +
          "pass id to cancel exactly one. For lock_request/lock_period, a dryRun without id lists each open one " +
          "(id, status, message, dates) so you can see which to pick. " +
          "The response always names what actually went (withdrawnItems: id, status, dates, message, and the " +
          "code for inspections) — read it, the count alone does not tell you WHICH directives you took away. " +
          "target=inspection never touches an AUTOMATIC inspection that has not triggered yet — those are " +
          "deliberately hidden from you (see keyholder_dashboard.scheduledDirectives) and are not yours to " +
          "cancel; an automatic one that has already triggered is withdrawn like any other. " +
          "target=manual_offense takes back a hand-noted offense (record_offense, id required): it leaves " +
          "the Strafbuch but stays on record, and a judgment already passed on it is NOT undone " +
          "(judge_offense action:\"reopen\" does that)." +
          // KEYHOLDER_BASE statt KEYHOLDER_NOTE: das Notify-Versprechen gilt hier nicht mehr für ALLE
          // Ziele (manual_offense ist still), und ein Werkzeug, dessen Text beides behauptet, ist für
          // den Agenten schlechter als eines, das die Ausnahme benennt — dieselbe Wahl wie bei
          // judge_offense, dessen Aktionen sich ebenfalls unterschiedlich verhalten.
          KEYHOLDER_BASE +
          " The user is notified by e-mail + push — with ONE exception: target=manual_offense is silent " +
          "(a hand-noted offense was never shown to them in the first place)." +
          SCHEDULED_SILENT,
        inputSchema: {
          target: z.enum(["lock_request", "lock_period", "inspection", "orgasm_directive", "task", "manual_offense"]).describe("Which open directive to withdraw. `task` and `manual_offense` always need an id."),
          id: z.string().optional().describe("Withdraw exactly THIS directive (id from keyholder_dashboard.openLockRequests / scheduledDirectives / openTasks, or get_offenses.manualOffenses[].ref.id). Only for lock_request/lock_period/task/manual_offense."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("withdraw", extra, args, (u) => mcpWithdraw(u, args)),
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
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("judge_offense", extra, args, (u) => mcpJudgeOffense(u, args)),
    );

    server.registerTool(
      "record_offense",
      {
        title: "Note an offense by hand",
        description:
          "Records an offense the tracker cannot derive from entries — a broken agreement, rudeness, " +
          "anything that left no trace in the data. It is the ONLY offense type that is written down " +
          "instead of derived, and the only one no rule can switch off. It appears in get_offenses " +
          "(manualOffenses) like any other and is ruled on with judge_offense; recording it is NOT a " +
          "judgment and imposes no penalty by itself. A wrong note is taken back with " +
          "withdraw target:\"manual_offense\", never deleted." + KEYHOLDER_SILENT,
        inputSchema: {
          title: z.string().min(1).describe("What happened, in one sentence — the line it appears under in the Strafbuch."),
          occurredAt: z.string().optional().describe("When it happened (ISO 8601), NOT when you note it. Default: now. Must not be in the future."),
          description: z.string().optional().describe("Longer text (returned as `description` by get_offenses)."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("record_offense", extra, args, (u) => mcpRecordOffense(u, args)),
    );

    server.registerTool(
      "list_training_goals",
      {
        title: "List training goals",
        description:
          "Lists training goals (KG + categories) with their id, status (active/scheduled/expired/deleted), " +
          "start/end dates, period targets and note. Use the id with edit_training_goal / delete_training_goal. " +
          "Soft-deleted goals (deletedAt set, status:'deleted') are hidden by default — this IS the authoritative " +
          "goal history, including past ones, once includeDeleted:true is set.",
        inputSchema: {
          category: z.string().optional().describe('Filter by category name, e.g. "Plug". Omit for all.'),
          includeDeleted: z.boolean().optional().describe("Include soft-deleted goals (status:'deleted', deletedAt set). Default false."),
        },
      },
      (args) => runTool("list_training_goals", (u) => mcpListTrainingGoals(u, args)),
    );

    server.registerTool(
      "edit_training_goal",
      {
        title: "Edit a training goal",
        description:
          "Partial edit of a training goal by id (get the id from list_training_goals). Any omitted field keeps " +
          "its current value — send only what you want to change. At least one period target must remain set." + KEYHOLDER_SILENT,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
          category: z.string().optional().describe('Category name, e.g. "Plug" or "KG". Omit to keep current.'),
          minPerDayHours: z.number().nonnegative().optional().describe("Min hours per day. Omit to keep current."),
          minPerWeekHours: z.number().nonnegative().optional().describe("Min hours per week. Omit to keep current."),
          minPerMonthHours: z.number().nonnegative().optional().describe("Min hours per month. Omit to keep current."),
          minPerYearHours: z.number().nonnegative().optional().describe("Min hours per year. Omit to keep current."),
          validFrom: z.string().optional().describe("Goal start (ISO 8601). Omit to keep current."),
          validUntil: z.string().optional().describe("Goal end (ISO 8601). Must be after validFrom. Omit to keep current."),
          note: z.string().optional().describe("Note shown with the goal. Omit to keep current."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("edit_training_goal", extra, args, (u) => mcpEditTrainingGoal(u, args)),
    );

    server.registerTool(
      "delete_training_goal",
      {
        title: "Delete a training goal",
        description:
          "Soft-deletes a training goal by id (get the id from list_training_goals). The goal is hidden from " +
          "list_training_goals but kept for history — pass includeDeleted:true there to see it again." + KEYHOLDER_SILENT,
        inputSchema: {
          id: z.string().describe("Goal id from list_training_goals."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("delete_training_goal", extra, args, (u) => mcpDeleteTrainingGoal(u, args)),
    );

    server.registerTool(
      "set_cleaning",
      {
        title: "Set cleaning (Reinigung) rules",
        description:
          "Sets the cleaning-pause rules: whether short cleaning openings are allowed at all, the max minutes " +
          "per pause, the max pauses per day (0 = unlimited), and the daily time windows in which cleaning is " +
          "permitted. Only provided fields change; read the current values from get_context.cleaning first. " +
          "`windows` REPLACES the whole list (that is how a window is retimed, added or deleted) — pass every " +
          "window you want to keep, not just the new one. `windows:[]` clears them, which does NOT forbid " +
          "cleaning: with no windows it is simply no longer tied to a time of day. Use allowed:false to forbid " +
          "it. Windows only bind while a lock period that permits cleaning is running " +
          "(get_context.cleaning.windowsBinding)." + KEYHOLDER_SILENT,
        inputSchema: {
          allowed: z.boolean().optional().describe("Allow cleaning pauses at all?"),
          maxMinutes: rangeField(CLEANING_MAX_MINUTES_RANGE, "Max minutes per cleaning pause"),
          maxPerDay: rangeField(CLEANING_MAX_PER_DAY_RANGE, "Max pauses per day, 0 = unlimited"),
          windows: z.array(z.object({
            start: z.string().describe(`Window start, "HH:MM" in the sub's local time (00:00–23:59).`),
            end: z.string().describe(`Window end, "HH:MM" in the sub's local time, after start (up to "24:00").`),
          })).optional().describe(
            `The complete new list of daily cleaning windows (max ${CLEANING_WINDOWS_MAX}), replacing the current one. ` +
            `A window cannot cross midnight — split it (e.g. 22:00–24:00 plus 00:00–06:00).`,
          ),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("set_cleaning", extra, args, (u) => mcpSetCleaning(u, args)),
    );

    server.registerTool(
      "set_auto_inspections",
      {
        title: "Set automatic-inspection settings",
        description:
          "Sets the settings of the AUTOMATIC (random) inspections: the master switch, how many per day, the " +
          "sleep window, the compliance deadline range, the optional fixed trigger window, and whether they " +
          "are only delivered during a lock period. Only provided fields change; read the current values from " +
          "get_context.autoInspections first. Each day a RANDOM count from [perDayMin, perDayMax] is spread " +
          "over the day on its own (equal values = a fixed count); perDayMax:0 plans none. Changing a planning " +
          "field re-rolls what is still pending TODAY (already delivered inspections stay). This does not " +
          "issue an inspection — a single one on demand is request_inspection. Two rules are NOT settings: " +
          "the inspection after a cleaning relock (hangs on `active` alone), and that a random inspection " +
          "needs the sub to be locked." + KEYHOLDER_SILENT,
        inputSchema: {
          active: z.boolean().optional().describe("Master switch. false = no automatic inspections at all (including the one after a cleaning relock)."),
          perDayMin: rangeField(AUTO_INSPECTION_PER_DAY_RANGE, "Lower bound of the random count per day"),
          perDayMax: rangeField(AUTO_INSPECTION_PER_DAY_RANGE, "Upper bound of the random count per day, 0 = none", " Setting one bound past the other pulls the other one along."),
          sleepFrom: z.string().optional().describe(`Sleep window start, "HH:MM" in the sub's local time. No inspection is triggered in the sleep window and no deadline falls into it.`),
          sleepUntil: z.string().optional().describe(`Sleep window end, "HH:MM" in the sub's local time.`),
          deadlineMinFrom: rangeField(AUTO_INSPECTION_DEADLINE_FROM_RANGE, "Lower bound of the random time to comply, in minutes"),
          deadlineMinTo: rangeField(AUTO_INSPECTION_DEADLINE_TO_RANGE, "Upper bound of the random time to comply, in minutes"),
          triggerWindowFrom: z.string().nullable().optional().describe(`Fixed trigger window start, "HH:MM", or null to switch the window off (then triggers spread over the whole waking window). Both ends belong together.`),
          triggerWindowUntil: z.string().nullable().optional().describe(`Fixed trigger window end, "HH:MM" after the start (it cannot cross midnight), or null to switch the window off.`),
          onlyDuringLockPeriod: z.boolean().optional().describe("true = a due inspection is only delivered while an active lock period (SPERRZEIT) runs, otherwise it is withdrawn (never caught up). false = any running lock is enough."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("set_auto_inspections", extra, args, (u) => mcpSetAutoInspections(u, args)),
    );

    server.registerTool(
      "resolve_inspection",
      {
        title: "Verify or reject the latest inspection",
        description:
          "Manually verifies or rejects the user's most recent submitted inspection photo (overrides any " +
          "automatic check). Use request_inspection to ask for one, withdraw to cancel an open one." + KEYHOLDER_NOTE,
        inputSchema: {
          action: z.enum(["verify", "reject"]).describe("Accept (verify) or reject the submitted photo."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("resolve_inspection", extra, args, (u) => mcpResolveInspection(u, args)),
    );

    server.registerTool(
      "edit_lock_period",
      {
        title: "Change the active lock period's end",
        description:
          "Extends or shortens an open lock period (Sperrzeit) by changing its end — without " +
          "withdrawing and recreating it. Works on a SCHEDULED lock period too; the new end is then delivered " +
          "with the trigger notification. Set indefinite=true for open-ended, or untilAt for a new end (must " +
          "be in the future). A scheduled lock period survives while the user re-locks." + MULTI_OPEN_NOTE("lock period") + KEYHOLDER_NOTE + SCHEDULED_SILENT,
        inputSchema: {
          untilAt: z.string().optional().describe("New end (ISO 8601, future). Ignored if indefinite=true."),
          indefinite: z.boolean().optional().describe("Make the lock period open-ended."),
          id: editIdField("lock period", "keyholder_dashboard.scheduledDirectives"),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("edit_lock_period", extra, args, (u) => mcpEditLockPeriod(u, args)),
    );

    server.registerTool(
      "edit_lock_request",
      {
        title: "Change an open lock request",
        description:
          "Changes an open lock request (VerschlussAnforderung) instead of withdrawing and recreating it — " +
          "deadline, message, required device, the lock period it enforces after lock-up, and the scheduled " +
          "trigger time. Only fields you pass are changed. Works on a SCHEDULED request too; the updated " +
          "version is then delivered when it triggers (use triggerNow to deliver it immediately)." + MULTI_OPEN_NOTE("lock request") + NO_SCHEDULE_DISCLOSURE + KEYHOLDER_NOTE + SCHEDULED_SILENT,
        inputSchema: {
          id: editIdField("request", "keyholder_dashboard.openLockRequests / scheduledDirectives"),
          deadlineAt: z.string().optional().describe("New absolute deadline to lock up (ISO 8601)."),
          deadlineHours: z.number().positive().optional().describe("New deadline in hours, counted from the (possibly new) trigger time. Ignored if deadlineAt is given."),
          minDurationHours: z.number().positive().optional().describe("Min wearing duration (h) after lock-up. Replaces any absolute lockUntilAt."),
          lockUntilAt: z.string().optional().describe("Absolute lock end (ISO 8601) after lock-up. Replaces any minDurationHours."),
          clearLockPeriod: z.boolean().optional().describe("Drop the lock period entirely — locking up then creates no Sperrzeit."),
          cleaningAllowed: z.boolean().optional().describe("Let cleaning openings not break the resulting lock period."),
          deviceName: z.string().optional().describe("Require this device by name."),
          clearDevice: z.boolean().optional().describe("Drop the device requirement."),
          message: z.string().optional().describe('New message shown to the user; "" clears it.'),
          scheduledAt: z.string().optional().describe("New trigger time (ISO 8601) for a request that has not been delivered yet."),
          triggerNow: z.boolean().optional().describe("Deliver a scheduled request immediately (e-mail + push go out now)."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("edit_lock_request", extra, args, (u) => mcpEditLockRequest(u, args)),
    );

    server.registerTool(
      "create_task",
      {
        title: "Set a task",
        description:
          "Sets the user a task: free text plus any number of CONDITIONS that must hold CONTINUOUSLY " +
          "until a point in time — wear a device (by category, optionally a specific one) and/or keep the " +
          "chastity device locked. Example: \"vacuum the flat, wearing collar and gag, locked, until 15:00\" " +
          "= requireKgLocked plus two requireWearing entries and holdUntilAt=15:00. Taking one of them off " +
          "before the deadline makes the task unfulfilled (an offense of type unfulfilled_task). Without " +
          "conditions it is a plain to-do that the user reports done. State is DERIVED from the user's own " +
          "entries — nothing to confirm manually. A task may be flagged as a punishment. " +
          "Additionally you may demand PHOTO PROOFS via requireProof: each entry may carry its own " +
          "deadline (dueMinutes) — that is how \"three photos spread over the day\" is expressed. " +
          "The user submits one photo per entry, " +
          "and their CAPTURE times must ascend in the order you list them (capture time, not upload time — " +
          "otherwise uploading everything at the end would pass; set proofOrderMatters=false where the " +
          "order is incidental). A proof with requireCode is checked " +
          "automatically against a random code the user must write in the shot; every other proof, and any " +
          "photo without a capture timestamp, puts the task into \"awaitingReview\" until YOU accept or " +
          "reject it — it is then neither fulfilled nor missed. " +
          "Pass offenseRef to make the task the PENALTY for a detected offense instead of a free-text one — " +
          "judge_offense is then not needed, the judgment is written with the task. " +
          "Can be scheduled/time-delayed: until it triggers the task does not exist for the user, and all of " +
          "its deadlines count from the trigger time." + NO_SCHEDULE_DISCLOSURE + KEYHOLDER_NOTE,
        inputSchema: {
          title: z.string().describe("Short title, e.g. \"Vacuum the flat\"."),
          description: z.string().optional().describe("The full instruction shown to the user."),
          holdUntilAt: z.string().optional().describe("Hold everything until this moment (ISO 8601, future)."),
          holdHours: z.number().positive().optional().describe("Hold for this many hours from now. Ignored if holdUntilAt is given."),
          holdMinutesFromStart: z.number().positive().optional().describe(
            "Hold for this many minutes counted from the moment the user actually has EVERYTHING on (with " +
            "several devices: the last one), not from now. Overrides holdUntilAt/holdHours. Use this " +
            "whenever you mean \"wear it for 30 minutes\" — with a fixed end the start grace is deducted, so " +
            "a user who takes his time putting it on wears it for correspondingly less. Requires at least " +
            "one condition (without one there is nothing to put on and the clock would never start).",
          ),
          requireKgLocked: z.boolean().optional().describe("The chastity device must stay locked for the whole time."),
          requireWearing: z.array(z.object({
            category: z.string().describe("Category name, e.g. \"Halsband\". Not \"KG\" — use requireKgLocked."),
            device: z.string().optional().describe("Require this specific device of that category."),
          })).optional().describe("Devices that must be worn continuously."),
          requireProof: z.array(z.object({
            description: z.string().describe("What must be visible, e.g. \"the closed lock\" or \"a photo with at least two receipts\"."),
            requireCode: z.boolean().optional().describe("Demand a handwritten random code in the shot. Only these are decided automatically; without it the proof waits for your review."),
            dueMinutes: z.number().positive().optional().describe(
              "Own deadline for THIS proof: minutes counted from the moment the task becomes " +
              "effective (for a scheduled task: from its trigger time). Omit and the proof stays " +
              "open until the task ends, as before. Use it for \"three photos spread over the day\" " +
              "— 240/480/720. Letting one pass unsubmitted makes the task unfulfilled right then, " +
              "before its own deadline. Must not lie after the end of the task.",
            ),
          })).optional().describe("Photo proofs, in the order they must be TAKEN."),
          proofOrderMatters: z.boolean().optional().describe(
            "Does that order count? Default true (capture times must ascend). Set false when the " +
            "order is incidental — \"a selfie in the vegetable aisle and one in the flower aisle\" is " +
            "not a demand to visit them in that sequence, and enforcing it would make the task missed " +
            "for nothing. With false, a photo without a capture time also no longer needs your review.",
          ),
          startGraceMinutes: z.number().min(0).optional().describe("Minutes the user has to put everything on (default 30). Starting later counts as not held continuously."),
          isPunishment: z.boolean().optional().describe("Mark the task as a punishment."),
          penaltyReason: z.string().optional().describe("What the punishment is for. Only kept when isPunishment is true."),
          offenseRef: z.string().optional().describe(
            "The `ref` of a currently detected offense (from get_offenses). Makes this task the PENALTY for it: " +
            "task and judgment are written together, the offense counts as PUNISHED with this task as the penalty, " +
            "and a previous penalty task for the same offense is withdrawn. The penalty counts as served once the " +
            "task is fulfilled; missing it leaves the penalty open AND becomes a new offense of its own.",
          ),
          delayMinutes: z.number().optional().describe("Delay before the task reaches the user, in minutes. Omit/0 = immediate."),
          scheduledAt: z.string().optional().describe("Absolute time the task becomes effective (ISO 8601). Overrides delayMinutes."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("create_task", extra, args, (u) => mcpCreateTask(u, args)),
    );

    server.registerTool(
      "review_task_proof",
      {
        title: "Review a submitted proof",
        description:
          "Judges ONE submitted proof photo of a task: accept or reject, optionally with a note the user " +
          "sees. This is the ONLY way out of the state \"awaitingReview\" — a proof without a code (or one " +
          "whose code the image check could not confirm) is neither fulfilled nor missed until you decide. " +
          "Address the proof by task plus its POSITION (1-based), the way keyholder_dashboard lists it. " +
          "Rejecting makes the task unfulfilled (offense unfulfilled_task); accepting the last open proof " +
          "completes it. Accepting also RESCUES a proof that was submitted after its deadline: it counts " +
          "again and the task is fulfilled instead of missed. Such a task counts as missed until you judge " +
          "it, so it is NOT in keyholder_dashboard.openTasks — find it in get_offenses as unfulfilled_task, " +
          "whose refId is the taskId. Either way the user is told, and if the task is thereby decided its " +
          "result goes out to both sides at once. A judgment can be revised — say so if you change your " +
          "mind." + KEYHOLDER_NOTE,
        inputSchema: {
          taskId: z.string().describe("The task, from keyholder_dashboard.openTasks[].id."),
          index: z.number().int().positive().describe("Which proof, 1-based, in the order they were demanded."),
          accepted: z.boolean().describe("true = the proof counts, false = it does not."),
          note: z.string().optional().describe("Shown to the user next to the proof — say WHY, especially when rejecting."),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("review_task_proof", extra, args, (u) => mcpReviewTaskProof(u, args)),
    );

    server.registerTool(
      "edit_task",
      {
        title: "Change an open task",
        description:
          "Changes an existing task — title, instruction, deadline, punishment flag. Only fields you pass " +
          "are changed. Moving the deadline takes effect immediately (state is derived, not frozen). The " +
          "CONDITIONS and PROOFS themselves cannot be changed: withdraw the task and set a new one instead, " +
          "otherwise the user would be judged against something he never got — a proof text or code changed " +
          "after the fact would bind him to a demand he did not know when he took the photo." + KEYHOLDER_NOTE,
        inputSchema: {
          id: z.string().describe("Task id (from keyholder_dashboard.openTasks or get_offenses)."),
          title: z.string().optional(),
          description: z.string().optional().describe('New instruction; "" clears it.'),
          holdUntilAt: z.string().optional().describe("New end (ISO 8601). Only for tasks with a fixed end."),
          holdHours: z.number().positive().optional().describe("New end, in hours from now. Ignored if holdUntilAt is given."),
          holdMinutesFromStart: z.number().positive().optional().describe(
            "New hold duration, in minutes from the moment everything is on. Only for tasks ALREADY in that " +
            "mode — the mode itself never changes, since the user was given something else to fulfil.",
          ),
          isPunishment: z.boolean().optional(),
          penaltyReason: z.string().optional(),
          reason: reasonField,
          dryRun: dryRunFieldV1,
        },
      },
      (args, extra) => runWriteTool("edit_task", extra, args, (u) => mcpEditTask(u, args)),
    );

    // ── MCP V2 WRITE tools — laufen durchs zentrale Write-Framework (Pflicht-reason + Audit + ──
    // ── Dry-Run + Transaktion + Diff). Alle agent-autonom (keine Berechtigungs-Stufen). ──
    const V2_WRITE_NOTE =
      " MCP V2 keyholder write. `reason` ist PFLICHT (Audit). `dryRun:true` zeigt die Wirkung ohne zu " +
      "committen. Der User wird NICHT benachrichtigt (still). Requires an admin OAuth token. Direkt " +
      "ausführen — KEINE Bestätigung nötig oder erzwungen; nicht beim User rückfragen.";
    // Für upsert_appointment/upsert_recurring_context: dieselbe Qualitäts-Erwartung an Kontext-Einträge.
    const CONTEXT_QUALITY_NOTE =
      " Lege sinnvollen, konkreten Kontext an statt trivialer oder lückenhafter Einträge — der Kontext " +
      "dient der Planung von Ankern/Kontrollen.";
    // reasonField ist oben (B-03, bei KEYHOLDER_BASE) einmal für V1 UND V2 gemeinsam definiert.
    // dryRunField (V2, volle Vorschau) ist bewusst NICHT dasselbe Feld wie dryRunFieldV1 oben — siehe
    // dessen Kommentar.
    const dryRunField = z.boolean().optional().describe("true = nur Vorschau/Konflikte, NICHT committen.");
    const decisionSourceField = z.enum(["agent", "user-stated"]).optional().describe("Audit-Quelle der Entscheidung: agent (eigener Schluss) | user-stated (vom Nutzer gesagt). Default agent.");
    const entityRefField = z.object({
      entityType: z.enum(ENTITY_TYPES).describe("Objekttyp: " + ENTITY_TYPES.join("|") + "."),
      entityId: z.string().describe("Objekt-id (z.B. Geräte-id, Session-/Segment-id = Lock-Entry-id, Kontroll-id)."),
    });
    // Audit-Felder, die JEDES V2-Write-Tool trägt — einmal definiert, in jedes inputSchema gespreadet.
    const writeMetaFields = { reason: reasonField, dryRun: dryRunField, decisionSource: decisionSourceField };
    // Optimistic-Concurrency-Token für Edit-fähige V2-Writes (Note, Device, Termin, Slot).
    const expectedVersionField = z.number().int().min(1).optional().describe(
      "Optimistic-Concurrency-Token: erwartete `version` des Objekts (steht in get_devices/query_notes/" +
      "get_context und in jedem Write-Ergebnis). Weicht die aktuelle Version ab (anderer Schreiber " +
      "dazwischen), wird der Write mit Konflikt-Fehler abgelehnt statt still zu überschreiben — dann " +
      "neu lesen und mit der aktuellen Version wiederholen. Bei Edits empfohlen — beim Anlegen " +
      "ungültig (eine neue Zeile hat noch keine Version).");

    server.registerTool(
      "upsert_note",
      {
        title: "Create / edit / supersede a keyholder note (v2)",
        description:
          "Legt eine strukturierte Note v2 an oder bearbeitet sie (id). Notes sind explizit NICHT für " +
          "den Sub gedacht — er sieht sie nie, auch nicht indirekt. Supersession statt Delete: mit " +
          "`supersedesId` wird die alte Note auf status=superseded gesetzt und eine neue erstellt (auditierbar, " +
          "kein Churn). type=BOUNDARY nutzt `doDont` (was tun / was nie tun). `refs` hängt die Note typisiert " +
          "an Objekte (inline-Abruf via get_session/get_devices)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehende Note bearbeiten; weglassen = neue anlegen."),
          expectedVersion: expectedVersionField,
          type: z.enum(NOTE_TYPES).optional().describe("Note-Typ (default OBSERVATION)."),
          text: z.string().optional().describe("Notiztext (Pflicht beim Anlegen)."),
          kg: z.string().optional().describe("Optionaler KG/Gerät-Tag. Nennt er ein Inventar-Gerät (Name, case-insensitiv), wird automatisch ein device-Ref angelegt — die Note kommt dann inline mit get_devices."),
          kategorie: z.string().optional().describe("Optionaler Kategorie-Tag."),
          pinned: z.boolean().optional().describe("Im Dashboard dauerhaft anpinnen — wirkt NUR bei type DIRECTIVE/BOUNDARY (nur diese werden gepinnt ausgespielt); auf anderen Typen wird pinned:true abgelehnt."),
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
          "Setzt die Entscheidungs-Metadaten eines Geräts (explain_model): securityLevel (" + SECURITY_LEVELS.join("|") + "), " +
          "lookalikeClusterId (Geräte gleicher Optik in einen Cluster — Mismatch innerhalb ist dann nie ein " +
          "Vergehen), pullOffRisk, material, bauform, healthFlags, retentionNotes, archived (true = aus dem " +
          "aktiven Inventar nehmen). Nur angegebene Felder ändern " +
          "sich. ACHTUNG lookalikeClusterId: KEIN lokales Metadatenfeld — es rechnet die Geräte-Attribution " +
          "JEDER historischen Session mit Bild-Deklarations-Konflikt rückwirkend neu (inkl. device_stats + " +
          "records-Zusammensetzung). Vor dem Setzen den dryRun-diff prüfen (N-14)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          deviceName: z.string().optional().describe("Gerät per Name (case-insensitiv). deviceName ODER deviceId."),
          deviceId: z.string().optional().describe("Gerät per id."),
          expectedVersion: expectedVersionField,
          securityLevel: z.enum(SECURITY_LEVELS).optional().describe("SECURING = sicherndes Gerät, TRUST_ONLY = Vertrauensgerät. V.a. für sichernde Geräte (KG, Halsreif); null ist keine Datenlücke."),
          lookalikeClusterId: z.string().nullable().optional().describe("Cluster-Tag gleich aussehender Geräte. null = entfernen."),
          pullOffRisk: z.boolean().nullable().optional().describe("true = abstreifbar (unsicher), false = geprüft sicher, null = nie beurteilt."),
          material: z.string().nullable().optional().describe("Edelstahl | Kunststoff | Silikon."),
          bauform: z.string().nullable().optional().describe("flach | voll | standard | Plug ..."),
          healthFlags: z.array(z.string()).optional().describe("z.B. Druckstellen, scheuert, rutscht."),
          retentionNotes: z.string().nullable().optional().describe("z.B. 'njoy: rutscht beim Entspannen'."),
          archived: z.boolean().optional().describe("true = archivieren (aus dem aktiven Inventar nehmen), false = reaktivieren."),
        },
      },
      (args, extra) => runV2Write(setDeviceMetaDef, extra, args),
    );

    server.registerTool(
      "upsert_device",
      {
        title: "Create / edit a device (inventory fields) (v2)",
        description:
          "Legt ein Gerät an (Pflicht: `name`) oder ändert seine INVENTAR-Felder (`id`): name, " +
          "description, categoryId, purchasePrice + currency, requireInspectionCode. Die " +
          "BEURTEILUNGS-Felder (securityLevel, pullOffRisk, material, bauform, healthFlags, " +
          "retentionNotes, lookalikeClusterId, archived) setzt weiterhin `set_device_meta` — " +
          "beide zusammen ergeben den Datensatz, den `get_devices` zeigt. Kategorie-ids stehen in " +
          "get_devices.categories; ein Preis braucht immer eine Währung. Ein ARCHIVIERTES Gerät ist " +
          "nicht bearbeitbar — erst mit `set_device_meta { archived: false }` zurückholen. Nur " +
          "angegebene Felder ändern sich." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehendes Gerät bearbeiten; weglassen = neues anlegen."),
          expectedVersion: expectedVersionField,
          name: z.string().optional().describe(`Anzeigename (Pflicht beim Anlegen, max. ${DEVICE_NAME_MAX_LENGTH} Zeichen). Geht zusätzlich in die Geräte-Erkennung ein.`),
          description: z.string().nullable().optional().describe("Freitext-Beschreibung; null/leer = löschen. Geht in die Geräte-Erkennung ein."),
          categoryId: z.string().nullable().optional().describe("Kategorie-id aus get_devices.categories; null = Gerät aus der Kategorie nehmen."),
          purchasePrice: z.number().nullable().optional().describe("Kaufpreis (>= 0); null = löschen. Verlangt eine currency."),
          currency: z.enum(VALID_CURRENCIES).nullable().optional().describe("Währung des Kaufpreises: " + VALID_CURRENCIES.join(" | ") + "."),
          requireInspectionCode: z.boolean().optional().describe("Verlangt eine Kontrolle mit DIESEM Gerät den handschriftlichen Code im Foto? false schwächt die Kontrolle: die Erfüllung läuft dann über die offene Anforderung statt über den Code-Vergleich."),
        },
      },
      (args, extra) => runV2Write(upsertDeviceDef, extra, args),
    );

    server.registerTool(
      "delete_device",
      {
        title: "Delete or archive a device (v2)",
        description:
          "Entfernt ein Gerät aus dem Inventar — mit derselben Regel wie die Oberfläche: hängt KEIN " +
          "Eintrag daran, wird es hart gelöscht (samt Geräte- und Referenzfotos, unwiderruflich); " +
          "gibt es Einträge, wird es nur ARCHIVIERT, damit die Historie erhalten bleibt. Der dryRun " +
          "sagt vorher, welcher der beiden Fälle eintritt (`action` + `entryCount`). Zum blossen " +
          "Ausmustern reicht `set_device_meta { archived: true }`." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          deviceName: z.string().optional().describe("Gerät per Name (case-insensitiv). deviceName ODER deviceId."),
          deviceId: z.string().optional().describe("Gerät per id."),
        },
      },
      (args, extra) => runV2Write(deleteDeviceDef, extra, args),
    );

    server.registerTool(
      "weight_history",
      {
        title: "Weight history, target range and reporting gap",
        description:
          "Die Gewichts-Reihe des Trägers: Punkte je Kalendertag, aktueller Wert samt BMI, Veränderung " +
          "im Zeitraum und das gleitende 7-Tage-Mittel als Trend. Alle Werte METRISCH (kg). " +
          "`corridor` ist der WIRKSAME Zielbereich — der weitere aus dem, was der Träger sich gesetzt " +
          "hat (`subCorridor`), und deiner Nachbesserung. `daysSinceLastReport` ist die Zahl, an der die " +
          "Meldepflicht hängt (mehr als drei Tage ohne Angabe sind ein Vergehen, sofern die Regel " +
          "scharf ist — siehe get_context.offenseRules). `inWindow: false` heisst: ausserhalb der " +
          "Wiege-Fenster gemessen; der Wert zählt, bleibt aber aus dem Trend. `enabled: false` = das " +
          "Feature ist hier nicht freigeschaltet, dann ist die Reihe leer.",
        inputSchema: {
          days: z.number().int().positive().optional().describe("Zeitraum in Tagen; weglassen = seit Beginn."),
        },
      },
      (args) => runTool("weight_history", (u) => weightHistory(u, { days: args.days ?? null })),
    );

    server.registerTool(
      "log_weight",
      {
        title: "Record a weight measurement (v2)",
        description:
          "Trägt eine Messung für den Träger nach — METRISCH (kg). Höchstens EINE je Kalendertag " +
          "(seiner Zeitzone): eine zweite ersetzt die erste, `replaced` sagt es. Anders als beim " +
          "Träger braucht dein Eintrag keinen Foto-Beleg — du stehst nicht vor seiner Waage. " +
          "Verlässt der Wert den Zielbereich, geht darüber die übliche Meldung raus." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          weightKg: z.number().describe("Gewicht in Kilogramm (20–300)."),
          measuredAt: z.string().optional().describe("ISO-Zeitpunkt der Messung; weglassen = jetzt. Nicht in der Zukunft."),
          note: z.string().optional().describe("Kurze Notiz zur Messung."),
        },
      },
      (args, extra) => runV2Write(logWeightDef, extra, args),
    );

    server.registerTool(
      "set_weight_limits",
      {
        title: "Widen the wearer's weight target range (v2)",
        description:
          "Bessert den Zielbereich NACH — METRISCH (kg). Du darfst ihn nur WEITEN, nie verengen, und " +
          "nur dort, wo der Träger selbst eine Grenze gesetzt hat: die Grenzen gehören ihm, weil er " +
          "der Realistischere ist. Wirksam ist danach der weitere der beiden Werte. `null` nimmt deine " +
          "Nachbesserung zurück. Den Bestand zeigt weight_history (`subCorridor` / `corridor`)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          minKg: z.number().nullable().optional().describe("Deine Untergrenze — muss UNTER der des Trägers liegen; null = zurücknehmen."),
          maxKg: z.number().nullable().optional().describe("Deine Obergrenze — muss ÜBER der des Trägers liegen; null = zurücknehmen."),
        },
      },
      (args, extra) => runV2Write(setWeightLimitsDef, extra, args),
    );

    server.registerTool(
      "upsert_category",
      {
        title: "Create / edit a device category (v2)",
        description:
          "Legt eine Geräte-Kategorie an (Pflicht: `name`) oder ändert sie (`id`). Beschriftung: name, " +
          "color, icon, sortOrder. REGELN: `trackingEnabled` (false = Inventar-Kategorie, es werden " +
          "GAR KEINE Trage-Sessions gemessen — die Kategorie verschwindet damit aus device_stats), " +
          "`requirePhoto` (Trage-Beginn braucht ein Foto), `allowVorgaben` (Trainingsziele auf dieser " +
          "Kategorie erlaubt). Bei der eingebauten KG-Kategorie sind diese drei UNVERÄNDERLICH, " +
          "Beschriftung und Sortierung dort aber änderbar. Der Slug wird aus dem Namen abgeleitet und " +
          "bleibt danach stehen. Lege eine neue Kategorie möglichst mit `firstDeviceName` an: eine " +
          "Kategorie ohne Gerät ist eine Sackgasse, erfassen lässt sich darin nichts. Kein " +
          "`expectedVersion` — Kategorien führen bewusst kein Versions-Token, hier gilt last write wins." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehende Kategorie bearbeiten; weglassen = neue anlegen."),
          name: z.string().optional().describe(`Anzeigename (Pflicht beim Anlegen, max. ${CATEGORY_NAME_MAX_LENGTH} Zeichen).`),
          color: z.enum(CATEGORY_COLORS).optional().describe("Farb-Token der Kategorie."),
          icon: z.enum(CATEGORY_ICONS).optional().describe("Symbol-Name (lucide)."),
          sortOrder: z.number().int().optional().describe("Sortierung in den Listen (kleiner = weiter oben)."),
          trackingEnabled: z.boolean().optional().describe("false = Inventar-Kategorie ohne Zeiterfassung. Nicht an der KG-Kategorie setzbar."),
          requirePhoto: z.boolean().optional().describe("true = ein Trage-Beginn verlangt ein Foto. Nicht an der KG-Kategorie setzbar."),
          allowVorgaben: z.boolean().optional().describe("false = auf dieser Kategorie sind keine Trainingsziele erlaubt. Nicht an der KG-Kategorie setzbar."),
          firstDeviceName: z.string().optional().describe("Nur beim Anlegen: Name des ersten Geräts, im selben Vorgang mit angelegt."),
        },
      },
      (args, extra) => runV2Write(upsertCategoryDef, extra, args),
    );

    server.registerTool(
      "delete_category",
      {
        title: "Delete a device category (v2)",
        description:
          "Löscht eine Geräte-Kategorie — endgültig und nur, wenn nichts mehr daran hängt: die " +
          "eingebaute KG-Kategorie nie, und solange Geräte (auch archivierte) oder Trainingsziele " +
          "(auch historische) darauf verweisen, lehnt der Aufruf ab und nennt die Zahlen. Erst " +
          "umhängen (`upsert_device { categoryId }`) oder wegräumen, dann löschen." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Kategorie per id. id ODER categoryName."),
          categoryName: z.string().optional().describe("Kategorie per Name (case-insensitiv)."),
        },
      },
      (args, extra) => runV2Write(deleteCategoryDef, extra, args),
    );

    server.registerTool(
      "set_health_hold",
      {
        title: "Set / clear health hold (v2)",
        description:
          "Setzt oder löst die Gesundheits-Zurückhaltung (explain_model). active=true braucht healthReason " +
          "(z.B. 'Migräne/Aura', 'Nacht-Auszeit'); active=false löst den aktiven Hold. Erscheint im " +
          "keyholder_dashboard.healthHold. NUR nutzen bei gesundheitlichen Themen, die EFFEKTIV einen " +
          "Einfluss auf die Keuschhaltung haben (z.B. verhindern sie das Tragen, eine Kontrolle, eine " +
          "Direktive) — nicht bei beliebigen gesundheitlichen Erwähnungen ohne Bezug zur Keuschhaltung. " +
          "Hinweis: `healthReason` ist der medizinische Grund für den Hold selbst — zusätzlich zum " +
          "separaten PFLICHT-`reason` (Audit-Begründung der Aktion, siehe unten)." + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          active: z.boolean().describe("true = Hold aktivieren (healthReason nötig), false = aktiven Hold lösen."),
          healthReason: z.string().optional().describe("Medizinischer Grund der Zurückhaltung (Pflicht bei active=true)."),
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
          "Hitze-Ausnahmen. deviceFree markiert geräte-freie Termine. Echte Termine mit belastbarem " +
          "`when`/`typ` anlegen." + CONTEXT_QUALITY_NOTE + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehenden Termin bearbeiten; weglassen = neuer."),
          expectedVersion: expectedVersionField,
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
        title: "Create / edit a recurring weekly/monthly context (v2)",
        description:
          "Legt einen wiederkehrenden Slot an oder bearbeitet ihn (id): HO-Tage, Bürotage, Pilates-Slots. " +
          "weekday 0=So..6=Sa. Ohne ordinal = JEDE Woche. Mit ordinal = nur der n-te <weekday> im Monat " +
          "(1..5) oder der letzte (-1) — z.B. 'erster Mittwoch im Monat' = weekday:3, ordinal:1. " +
          "deviceFree markiert geräte-freie Slots. exclusionDates nennt Daten, an denen der Slot " +
          "AUSFÄLLT (Ferien/Feiertage) — damit 'Findet am X statt?' aus der API beantwortbar ist statt " +
          "aus dem Freitext. Echte, wiederkehrende Muster mit klarem `label` anlegen." + CONTEXT_QUALITY_NOTE + V2_WRITE_NOTE,
        inputSchema: {
          ...writeMetaFields,
          id: z.string().optional().describe("Bestehenden Slot bearbeiten; weglassen = neuer."),
          expectedVersion: expectedVersionField,
          label: z.string().optional().describe("Bezeichnung, z.B. 'Home Office' (Pflicht beim Anlegen)."),
          weekday: z.number().int().min(0).max(6).optional().describe("Wochentag 0=So..6=Sa (Pflicht beim Anlegen)."),
          ordinal: z.union([z.literal(-1), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable().optional()
            .describe("Weglassen/null = jede Woche. 1..5 = n-ter <weekday> im Monat, -1 = letzter <weekday> im Monat."),
          deviceFree: z.boolean().optional().describe("Geräte-freier Slot?"),
          exclusionDates: z.array(z.string()).optional().describe("Ausnahme-Daten YYYY-MM-DD, an denen der Slot NICHT stattfindet. Leeres Array = Ausnahmen löschen."),
          note: z.string().nullable().optional().describe("Notiz zum Slot."),
        },
      },
      (args, extra) => runV2Write(upsertRecurringContextDef, extra, args),
    );
}

/**
 * Das Bild-Werkzeug. Wird nur registriert, wenn der Sub-Schlüssel passt — das entscheidet der
 * Aufrufer, siehe `buildAuthHandler`.
 *
 * Nicht registrieren statt registrieren-und-verweigern: ohne Schlüssel erscheint es nicht einmal in
 * `tools/list`. Ein Werkzeug, das da ist und „nein" sagt, ist eine Ankündigung; eines, das nicht
 * existiert, ist keine.
 */
function registerImageTool(server: McpServer) {
  server.registerTool(
    "get_image",
    {
      title: "Fetch one photo",
      description:
        "Returns ONE named photo so you can look at it yourself. On demand only — nothing is " +
        "delivered automatically. Use it when you want to check something specific: how the device " +
        "sits after a change, the skin under the ring, or to read the device recognition yourself " +
        "when deviceCheck reports something uncertain. " +
        "The sources: \"entry\" is the entry's own photo — device/seal for VERSCHLUSS, the control " +
        "photo for PRUEFUNG; \"box\" is the shot through the key-box window; \"task_proof\" is a " +
        "submitted task proof. Which field addresses which source is written on the fields " +
        "themselves. Returns the image plus a caption naming the entry and the capture time. " +
        `LIMITS — these are rules, not faults: only entries recorded within the last ${MCP_IMAGE_MAX_AGE_H}h have a ` +
        `retrievable photo, and you may fetch ${MCP_IMAGE_PER_HOUR} per hour, ${MCP_IMAGE_PER_DAY} per day. list_entries still lists the ` +
        "whole archive; most of it has no image you can reach. Pick the one you actually want to " +
        "look at, and ask the user directly for anything older.",
      inputSchema: {
        source: z.enum(["entry", "box", "task_proof"]).describe("Which photo to fetch."),
        entryId: z.string().optional().describe("Entry id from list_entries. Required for source entry/box."),
        taskId: z.string().optional().describe("Task id from keyholder_dashboard.openTasks. Required for source task_proof."),
        proofIndex: z.number().int().min(1).optional().describe("1-based proof position, same address as review_task_proof. Required for source task_proof."),
      },
    },
    (args) => runToolWith(
      "get_image",
      async (username) => {
        const img = await loadMcpImage(username, args);
        // Wer welches Bild wann gesehen hat, gehört ins Instanz-Log — nicht als Kontrolle, sondern
        // damit ein Abruf überhaupt eine Spur hinterlässt. Hier und nicht im Renderer: `render` ist
        // als reine Abbildung dokumentiert, und dies ist sein erster Nutzer.
        // Scope "MCP" wie `logMcpWrite`, damit ein grep alles vom MCP findet. `redactDigits`, weil
        // die Bildunterschrift Freitext des Keyholders trägt (Aufgaben-Titel, Nachweis-Beschreibung)
        // — genau der Ort, an dem versehentlich ein Kontroll-Code steht, und die Logs bleiben ein
        // halbes Jahr liegen.
        structuredLog("MCP", "image", { source: args.source, caption: redactDigits(img.caption) });
        return img;
      },
      // Die Bildunterschrift steht VOR dem Bild: sie sagt, was gleich kommt, und bleibt lesbar,
      // falls der Client den Bild-Block nicht darstellen kann.
      (img) => [
        { type: "text", text: img.caption },
        { type: "image", data: img.base64, mimeType: img.mediaType },
      ],
    ),
  );
}

/** Baut den auth-umhüllten MCP-Handler. Async, weil die Server-Instructions erst per await-Helfer
 *  (best-effort DB-Read der Keyholder-Regeln) befüllt werden. */
async function buildAuthHandler(): Promise<(req: Request) => Promise<Response>> {
  const instructions = await buildServerInstructions();
  // Der Sub-Schlüssel braucht die Datenbank, die Werkzeug-Registrierung ist synchron — deshalb hier
  // auflösen. Das Tor steht damit an genau einer Stelle, dort wo der Wert entsteht.
  const imagesVisible = await mcpImageToolVisible();
  const handler = createMcpHandler(
    (server) => {
      registerTools(server);
      if (imagesVisible) registerImageTool(server);
    },
    { instructions },
    { basePath: "/api", maxDuration: 60 },
  );
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
