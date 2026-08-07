import { prisma } from "@/lib/prisma";
import { getUserDeviceOptions, getKeyholderSperrzeiten, getKeyholderLockRequests, getIsLocked, openLockRequestWhere, isScheduledDirective, keyholderVisibleKontrolleWhere } from "@/lib/queries";
import { isHiddenFromSub } from "@/lib/delayedTrigger";
import { createVerschlussAnforderung, updateSperrzeitEnde, updateLockRequest, mergeLockRequestPatch, withdrawVerschlussAnforderung, withdrawVerschlussAnforderungById, checkLockEnd, type UpdateLockRequestParams, type MergedLockRequest } from "@/lib/verschlussAnforderungService";
import { computeDelayedTrigger } from "@/lib/delayedTrigger";
import { requestKontrolle, resolveKontrolle, resolveInspectionEntry, hasActiveKontrolle, verifikationStatusFor } from "@/lib/kontrolleService";
import { resolveInspectionTarget, inspectionPreconditionProblem, inspectionTargetLabel } from "@/lib/inspectionTarget";
import { createVorgabe, updateVorgabe, deleteVorgabe, listVorgaben, checkGoalPlausibility, hasPeriodTarget, findActiveVorgabe } from "@/lib/vorgabeService";
import { setReinigungSettings, maxPausesPerDaySentinel, parseReinigungsFenster, reinigungsFensterListProblem, formatReinigungsFenster, type ReinigungsFenster } from "@/lib/reinigungService";
import { createOrgasmusAnforderung, withdrawOrgasmusAnforderung, checkOrgasmWindowEnd } from "@/lib/orgasmusAnforderungService";
import { judgeOffense, checkPenaltyText, judgmentStatus, collectDetectedOffenses, requireDetectedOffense, punishWithTask } from "@/lib/strafurteilService";
import { buildStrafbuch } from "@/lib/strafbuch";
import { matchByNameCI, parseIsoDate, tzOf, makeIso, isoForUser, buildEnvelope, type Envelope, type Iso } from "@/lib/mcp/common";
import { resolveTaskProof } from "@/lib/mcp/taskProofRef";
import { diffFields } from "@/lib/mcp/writeFramework";
import { CLEANING_MAX_MINUTES_RANGE, CLEANING_MAX_PER_DAY_RANGE, INSPECTION_DELAY_RANGE, INSPECTION_RANDOM_DELAY } from "@/lib/constants";
import { clamp, randomInt } from "@/lib/utils";
import type { ServiceResult } from "@/lib/serviceResult";
import en from "../../messages/en.json";
import { reviewTaskProof } from "@/lib/taskProofService";
import { createTask, updateTask, withdrawTask, mergeTaskPatch, type TaskRequirementInput } from "@/lib/taskService";

/**
 * dryRun (K-01, leichte Variante): validiert Referenzen/Werte und zeigt die effektiven Argumente,
 * OHNE die mutierende Service-Funktion aufzurufen. Bewusst NICHT dieselbe Tiefe wie die volle
 * V2-executeWrite-Vorschau (B-05) — Service-interne Zustandsprüfungen (z.B. "bereits verschlossen")
 * laufen nur beim echten Commit. Wo eine reine Prüf-Funktion bereits existiert (checkOrgasmWindowEnd,
 * checkGoalPlausibility), wird sie hier genutzt — dieselbe Regel, nicht neu beurteilt.
 */
export interface DryRunPreview {
  dryRun: true;
  tool: string;
  wouldSucceed: boolean;
  /** Nur gesetzt, wenn eine hier ausführbare Prüfung fehlschlagen würde. */
  problem?: string;
  preview: unknown;
  /** Nur bei Tools, die ein BESTEHENDES Objekt ändern/löschen/upserten — Feld-Diff [alt, neu],
   *  wie ihn der echte Commit liefert (B-05). Reine Creates haben kein "vorher"; dort bleibt das
   *  Feld weg statt eine leere oder irreführende Diff-Hülle vorzutäuschen. */
  diff?: Record<string, [unknown, unknown]>;
}

/** Baut die dryRun-Hülle — EINE Stelle für `{dryRun, tool, wouldSucceed, problem?, preview, diff?}`
 *  statt zwölfmal denselben Spread. Der tool-spezifische `preview`-Inhalt bleibt bei jedem Aufrufer. */
function dryRunPreview(tool: string, problem: string | undefined, preview: unknown, diff?: Record<string, [unknown, unknown]>): DryRunPreview {
  return { dryRun: true, tool, wouldSucceed: !problem, ...(problem ? { problem } : {}), preview, ...(diff ? { diff } : {}) };
}

/**
 * MCP write tools — keyholder directives issued over the MCP. The acting authority is the
 * OAuth-authorizing admin (verified via checkMcpKeyholder); the target is always MCP_USERNAME.
 * Each function reuses the same service layer as the admin UI, so behaviour + notifications match.
 */

/** Checks whether the OAuth-authorizing user may write (must be an existing admin/keyholder).
 *  Returns a precise reason on denial so the agent can self-diagnose instead of seeing a generic
 *  refusal. Single-instance model: any admin may direct MCP_USERNAME (mirrors requireAdminApi's
 *  blanket-admin behaviour); USE_ADMIN_RELATIONSHIPS scoping is not applied here. */
export async function checkMcpKeyholder(userId: string | undefined): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!userId) {
    return { ok: false, reason: "the token carries no user identity — the static MCP token is read-only; connect with an OAuth token authorized by an admin account" };
  }
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, role: true } });
  if (!u) return { ok: false, reason: "the token's user no longer exists" };
  if (u.role !== "admin") {
    return { ok: false, reason: `authorized as "${u.username}" (role: ${u.role}) — writing requires an admin (keyholder) account; reconnect the MCP and authorize while logged in as the admin` };
  }
  return { ok: true };
}

/** Resolves the configured MCP_USERNAME (the directive target) to its user id. Throws if missing. */
async function resolveTargetUserId(username: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!u) throw new Error(`User not found: ${username}`);
  return u.id;
}

/** Resolves a KG device name (case-insensitive) belonging to the user to its id. Throws if not found.
 *  Scoped to KG/built-in devices — the same set a VerschlussAnforderung (ANFORDERUNG) accepts. */
async function resolveDeviceId(userId: string, name: string): Promise<string> {
  const devices = await getUserDeviceOptions(userId);
  const match = matchByNameCI(devices, name);
  if (!match) throw new Error(`Device not found: "${name}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
  return match.id;
}

/** Resolves a category name to its id ("KG"/built-in or a user category). Throws if not found. */
async function resolveCategoryId(userId: string, name: string): Promise<string> {
  const cats = await prisma.deviceCategory.findMany({
    where: { userId },
    select: { id: true, name: true, isBuiltIn: true },
  });
  const match = (name.trim().toLowerCase() === "kg")
    ? cats.find((c) => c.isBuiltIn)
    : matchByNameCI(cats, name);
  if (!match) throw new Error(`Category not found: "${name}". Available: ${cats.map((c) => c.name).join(", ")}`);
  return match.id;
}

/** Die englischen Sätze zu den Service-Fehler-Codes. Bewusst aus `messages/en.json` gelesen statt
 *  aus einer zweiten Tabelle: sonst hätte derselbe Code zwei Texte, die auseinanderlaufen, sobald
 *  einer davon gepflegt wird. Der Parity-Test (serviceErrorCodes.test.ts) hält die Datei vollständig. */
const EN_ERRORS: Record<string, string> = en.errors;

/** Unwraps a ServiceResult, throwing the error as an English sentence so the tool wrapper surfaces
 *  something an MCP agent can act on. Services return stable CODES (`LOCK_USER_ALREADY_LOCKED`), and
 *  an agent has no `errors` namespace to resolve them against — so the boundary translates here.
 *  `Object.hasOwn` statt `EN_ERRORS[code]`: ein Code wie "constructor" träfe sonst eine geerbte
 *  Object-Property und würde eine Funktion als Fehlertext werfen. Unbekannter Code → roher Token,
 *  besser als eine irreführende Meldung. */
function unwrap<T>(r: ServiceResult<T>): T {
  if (!r.ok) throw new Error(enErrorText(r.error));
  return r.data;
}

/** Der englische Satz zu einem Service-Fehler-Code. Auch für Prüfungen, die ein Tool VOR dem Service
 *  vorwegnimmt (Fenster-Liste im dryRun) — dieselbe Regel muss denselben Satz ergeben, egal ob sie
 *  am Rand oder im Service zuschlägt. */
function enErrorText(code: string): string {
  return Object.hasOwn(EN_ERRORS, code) ? EN_ERRORS[code] : code;
}

export interface RequestLockArgs {
  deadlineHours?: number;
  deadlineAt?: string;
  minDurationHours?: number;
  /** Absolutes Sperr-Ende nach dem Einschliessen (Wanduhr) — Alternative zu minDurationHours. */
  lockUntilAt?: string;
  cleaningAllowed?: boolean;
  deviceName?: string;
  message?: string;
  /** Delay before the request reaches the user, in minutes (>0). Omit/0 = immediate. */
  delayMinutes?: number;
  /** Absolute send time (ISO 8601). Overrides delayMinutes. */
  scheduledAt?: string;
  dryRun?: boolean;
}

export async function mcpRequestLock(username: string, args: RequestLockArgs) {
  const userId = await resolveTargetUserId(username);
  const deviceId = args.deviceName ? await resolveDeviceId(userId, args.deviceName) : null;
  if (args.dryRun) {
    // Advisory (nicht TOCTOU-sicher wie der echte Commit, der in derselben Transaktion liest) —
    // fängt trotzdem den häufigsten Ablehnungsgrund: eine SOFORTIGE ANFORDERUNG verlangt einen NICHT
    // verschlossenen User. Eine terminierte darf angelegt werden, egal wie der Sub gerade steht.
    const immediate = !args.scheduledAt && !args.delayMinutes;
    const problem = args.minDurationHours != null && args.lockUntilAt != null ? "LOCK_DURATION_OR_END"
      : immediate && (await getIsLocked(userId)) ? "USER_ALREADY_LOCKED"
      : undefined;
    return dryRunPreview("request_lock", problem, { art: "ANFORDERUNG", deviceId, deadlineAt: args.deadlineAt ?? null, deadlineHours: args.deadlineHours ?? null, minDurationHours: args.minDurationHours ?? null, lockUntilAt: args.lockUntilAt ?? null, cleaningAllowed: args.cleaningAllowed ?? false, delayMinutes: args.delayMinutes ?? null, scheduledAt: args.scheduledAt ?? null });
  }
  const data = unwrap(await createVerschlussAnforderung({
    userId,
    art: "ANFORDERUNG",
    nachricht: args.message,
    endetAt: args.deadlineAt,
    fristH: args.deadlineHours,
    dauerH: args.minDurationHours,
    sperrEndetAt: args.lockUntilAt,
    reinigungErlaubt: args.cleaningAllowed,
    deviceId,
    delayMinutes: args.delayMinutes,
    wirksamAbAt: args.scheduledAt,
  }));
  // Anders als eine Sperrzeit ERSETZT eine neue Anforderung keine bestehende — mehrere koexistieren.
  // Ohne diesen Hinweis hielte die Keyholderin die eben gestellte für die einzige und wunderte sich
  // später über eine zweite Frist, die sie längst vergessen hatte.
  const openCount = await prisma.verschlussAnforderung.count({ where: openLockRequestWhere(userId) });
  const alsoOpen = openCount > 1
    ? ` NOTE: ${openCount} lock requests are now open (they add up, they do not replace each other) — one lock-up fulfils all of them. See keyholder_dashboard.openLockRequests / scheduledDirectives.`
    : "";
  if (data.scheduledFor) {
    return {
      ok: true,
      id: data.id,
      scheduledFor: data.scheduledFor,
      message: `Lock request scheduled — it will reach the user at ${data.scheduledFor}. The user cannot see it until it triggers.` + alsoOpen,
    };
  }
  return { ok: true, id: data.id, scheduledFor: null, message: "Lock request created; the user was notified by e-mail + push." + alsoOpen };
}

export interface SetLockPeriodArgs {
  untilAt?: string;
  durationHours?: number;
  indefinite?: boolean;
  reinigungErlaubt?: boolean;
  message?: string;
  /** Delay before the lock period is sent/starts, in minutes (>0). Omit/0 = immediate. */
  delayMinutes?: number;
  /** Absolute send/start time (ISO 8601). Overrides delayMinutes. */
  scheduledAt?: string;
  dryRun?: boolean;
}
export async function mcpSetLockPeriod(username: string, args: SetLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.dryRun) {
    const isIndefinite = !!args.indefinite;
    const now = new Date();
    const iso = await isoForUser(userId);
    const { wirksamAb } = computeDelayedTrigger(now, { delayMinutes: args.delayMinutes, wirksamAbAt: args.scheduledAt ? new Date(args.scheduledAt) : null });
    const endetAtDate = !isIndefinite && args.untilAt ? new Date(args.untilAt) : null;
    // Advisory (siehe request_lock): SPERRZEIT verlangt einen BEREITS verschlossenen User. checkLockEnd
    // ist dieselbe reine Prüfung, die createVerschlussAnforderung auf dem echten Pfad aufruft.
    const problem = !(await getIsLocked(userId)) ? "USER_NOT_LOCKED" : (checkLockEnd(endetAtDate, wirksamAb, now) ?? undefined);
    return dryRunPreview("set_lock_period", problem, { art: "SPERRZEIT", endetAt: iso(endetAtDate), durationHours: isIndefinite ? null : (args.durationHours ?? null), reinigungErlaubt: args.reinigungErlaubt ?? false, delayMinutes: args.delayMinutes ?? null, scheduledAt: args.scheduledAt ?? null });
  }
  const data = unwrap(await createVerschlussAnforderung({
    userId,
    art: "SPERRZEIT",
    nachricht: args.message,
    endetAt: args.indefinite ? null : args.untilAt,
    fristH: args.indefinite ? null : args.durationHours,
    reinigungErlaubt: args.reinigungErlaubt,
    delayMinutes: args.delayMinutes,
    wirksamAbAt: args.scheduledAt,
  }));
  if (data.scheduledFor) {
    return {
      ok: true,
      id: data.id,
      scheduledFor: data.scheduledFor,
      message: `Lock period scheduled — it starts at ${data.scheduledFor}. It does not enforce and the user is not notified until then.`,
    };
  }
  return { ok: true, id: data.id, scheduledFor: null, message: "Lock period set; the user was notified by e-mail + push." };
}

export interface RequestInspectionArgs {
  deadlineHours?: number;
  comment?: string;
  delayMinutes?: number;
  /** Ziel: Kategorie-Name („Plug"). Fehlt/„KG" = der Keuschheitsgürtel (Bestandsverhalten). */
  category?: string;
  /** Ziel: Gerätename innerhalb der Kategorie. Verengt sie auf genau dieses Gerät. */
  device?: string;
  dryRun?: boolean;
}
/** Delay-Policy (nur MCP): kein Wert → zufällig aus `INSPECTION_RANDOM_DELAY`; ≤0 → sofort; sonst auf
 *  `INSPECTION_DELAY_RANGE` geklemmt. Geteilt von Commit und dryRun-Preview, damit die beiden Pfade
 *  nicht auseinanderlaufen können. */
function clampInspectionDelay(delayMinutes: number | undefined): number {
  if (delayMinutes === undefined) return randomInt(INSPECTION_RANDOM_DELAY.min, INSPECTION_RANDOM_DELAY.max);
  if (delayMinutes <= 0) return 0;
  return clamp(delayMinutes, INSPECTION_DELAY_RANGE);
}

/** Satz für die Antwort, wenn der angeforderte Delay die Policy verletzt hat und geklemmt wurde —
 *  sonst null. Ein blosses „reicht in ~65 min" meldete den ERSETZTEN Wert als Erfolg; der Aufrufer
 *  plante seine Zeit aber um den angefragten herum und hat keine Möglichkeit, die Abweichung zu
 *  bemerken. (Vorfall 28.07.2026: 242 min angefragt, 65 geliefert, Antwort wies auf nichts hin.) */
function inspectionDelayNote(requested: number | undefined, effective: number): string | null {
  // `≤0` ist die dokumentierte Kurzform für „sofort", keine verletzte Grenze — dort ist die 0 das
  // VERLANGTE Ergebnis. Ohne diese Ausnahme meldete ausgerechnet der Ehrlichkeits-Hinweis eine
  // Abweichung, die es nicht gab, und riete zu „später erneut anfragen", obwohl sofort ausgelöst wurde.
  if (requested === undefined || requested <= 0 || Math.round(requested) === effective) return null;
  return `NOTE: the requested delay of ${requested} min was NOT applied — it was clamped to ${effective} min `
    + `(allowed: ${INSPECTION_DELAY_RANGE.min}–${INSPECTION_DELAY_RANGE.max} min, or ≤0 for immediate). `
    + `If you need the inspection at a specific later time, request it closer to that time.`;
}

export async function mcpRequestInspection(username: string, args: RequestInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  const requestedDelayMinutes = args.delayMinutes ?? null;
  // Namen → ids VOR dem dryRun-Zweig: die Vorschau soll an einem unbekannten Kategorie-/Gerätenamen
  // genauso scheitern wie der echte Aufruf, sonst prüft sie nicht das, was sie ankündigt.
  const categoryId = args.category ? await resolveCategoryId(userId, args.category) : null;
  const deviceId = args.device ? await resolveAnyDeviceId(userId, categoryId, args.device) : null;
  if (args.dryRun) {
    // Kein Zufallswert im Preview: ein hier gewürfelter Delay würde bei jedem dryRun-Aufruf einen
    // anderen Wert zeigen, ohne dass der echte Commit denselben zieht — ehrlicher, den Zufallsfall
    // als solchen zu benennen, statt eine Zahl vorzutäuschen, die beim Commit nicht wiederkehrt.
    // Die Kappung dagegen steht schon fest und gehört benannt — sie aufzudecken ist der Zweck des dryRun.
    const effective = args.delayMinutes === undefined ? null : clampInspectionDelay(args.delayMinutes);
    const preview = effective === null
      ? { delayMinutes: `random ${INSPECTION_RANDOM_DELAY.min}–${INSPECTION_RANDOM_DELAY.max} (drawn fresh on commit)`, delayNote: null }
      : { delayMinutes: effective, delayNote: inspectionDelayNote(args.delayMinutes, effective) };
    // Advisory (siehe request_lock): dieselbe Entscheidung wie der echte Pfad, aus derselben
    // Funktion — ein hier nachgebauter Check wäre genau der Unterschied, den der dryRun
    // verschweigen würde.
    const resolved = await resolveInspectionTarget(userId, { categoryId, deviceId });
    const target = resolved.ok ? resolved.target : null;
    const problem = inspectionPreconditionProblem(
      target,
      target?.active === true && await hasActiveKontrolle(userId, new Date(), { categoryId: target.categoryId }),
    );
    return dryRunPreview("request_inspection", problem, {
      deadlineHours: args.deadlineHours ?? null,
      comment: args.comment ?? null,
      target: inspectionTargetLabel(target, "KG"),
      requestedDelayMinutes,
      ...preview,
    });
  }
  const delayMinutes = clampInspectionDelay(args.delayMinutes);
  // Wie `alsoOpen` in request_lock: fertiger Anhang (mit führendem Leerzeichen) statt eines Ternärs
  // an jeder Rückgabe. Der unangehängte Satz bleibt als Feld erhalten.
  const delayNote = inspectionDelayNote(args.delayMinutes, delayMinutes);
  const noteSuffix = delayNote ? ` ${delayNote}` : "";

  const data = unwrap(await requestKontrolle({
    userId, kommentar: args.comment, deadlineH: args.deadlineHours, delayMinutes, categoryId, deviceId,
  }));

  // Das Ziel im Klartext (die Antwort spricht sonst von „the inspection", obwohl es mehrere
  // gleichzeitig geben kann — je Ziel eine).
  const targetText = args.device ?? args.category ?? "KG";
  // `delayMinutes`/`requestedDelayMinutes` auch als Felder, nicht nur im Fliesstext: ein Aufrufer,
  // der die Zeit weiterverarbeitet, soll die Abweichung prüfen können, ohne die Meldung zu parsen.
  const delayFields = { delayMinutes, requestedDelayMinutes, delayNote, target: targetText };
  if (data.scheduledFor) {
    return {
      ok: true,
      scheduledFor: data.scheduledFor,
      deadline: data.deadline,
      ...delayFields,
      message: `Inspection (${targetText}) scheduled — the code will reach the user in ~${delayMinutes} min (at ${data.scheduledFor}); the deadline then runs to ${data.deadline}. The user cannot see it until it triggers.` + noteSuffix,
    };
  }
  return {
    ok: true,
    deadline: data.deadline,
    ...delayFields,
    message: `Inspection (${targetText}) requested immediately; the code was e-mailed to the user. Deadline: ${data.deadline}.` + noteSuffix,
  };
}

export interface RequestOrgasmArgs {
  art: "ANWEISUNG" | "GELEGENHEIT";
  /** Window start (ISO). Default: now. */
  beginsAt?: string;
  /** Window end (ISO). Takes precedence over windowHours. */
  endsAt?: string;
  /** Window length in hours from beginsAt, used when endsAt is absent. */
  windowHours?: number;
  /** Required orgasm type (one of ORGASMUS_ARTEN). Omit = any orgasm counts. */
  requiredType?: string;
  /** Allow opening the device to perform the orgasm during the window (no Sperre break / penalty). */
  openAllowed?: boolean;
  message?: string;
  dryRun?: boolean;
}
export async function mcpRequestOrgasm(username: string, args: RequestOrgasmArgs) {
  const userId = await resolveTargetUserId(username);
  const iso = await isoForUser(userId);
  const beginnt = args.beginsAt ? parseIsoDate(args.beginsAt, "beginsAt") : new Date();
  let endet: Date;
  if (args.endsAt) {
    endet = parseIsoDate(args.endsAt, "endsAt");
  } else if (args.windowHours && args.windowHours > 0) {
    endet = new Date(beginnt.getTime() + args.windowHours * 60 * 60 * 1000);
  } else {
    throw new Error("Provide endsAt (ISO date) or windowHours (> 0).");
  }
  if (args.dryRun) {
    // Dieselbe Reihenfolge wie createOrgasmusAnforderung: erst endet<=beginnt (Struktur), dann
    // endet<=now (B-01) — sonst könnte ein explizites endsAt vor beginsAt hier fälschlich als
    // "würde gelingen" durchgehen, obwohl der echte Commit mit ORGASM_END_BEFORE_START ablehnt.
    const problem = endet <= beginnt ? "ORGASM_END_BEFORE_START" : (checkOrgasmWindowEnd(endet, new Date()) ?? undefined);
    return dryRunPreview("request_orgasm", problem, { art: args.art, beginsAt: iso(beginnt)!, endsAt: iso(endet)!, requiredType: args.requiredType ?? null, openAllowed: !!args.openAllowed });
  }
  const data = unwrap(await createOrgasmusAnforderung({
    userId,
    art: args.art,
    nachricht: args.message,
    beginntAt: beginnt,
    endetAt: endet,
    vorgegebeneArt: args.requiredType,
    oeffnenErlaubt: args.openAllowed,
  }));
  const kind = args.art === "ANWEISUNG" ? "mandatory directive" : "opportunity";
  return {
    ok: true,
    id: data.id,
    message: `Orgasm ${kind} set (window ${iso(beginnt)} – ${iso(endet)}); the user was notified by e-mail + push.`,
  };
}

export interface SetTrainingGoalArgs {
  category?: string;
  minPerDayHours?: number;
  minPerWeekHours?: number;
  minPerMonthHours?: number;
  minPerYearHours?: number;
  validFrom?: string;
  validUntil?: string;
  note?: string;
  dryRun?: boolean;
}


export async function mcpSetTrainingGoal(username: string, args: SetTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  const iso = await isoForUser(userId);
  const categoryId = args.category ? await resolveCategoryId(userId, args.category) : null;

  // Default to now; validFrom may be a future date to schedule a goal in advance.
  const gueltigAb = args.validFrom ? parseIsoDate(args.validFrom, "validFrom") : new Date();
  const gueltigBis = args.validUntil ? parseIsoDate(args.validUntil, "validUntil") : null;
  if (gueltigBis && gueltigBis.getTime() <= gueltigAb.getTime()) {
    throw new Error("validUntil must be after validFrom.");
  }

  if (args.dryRun) {
    const targets = { minProTagH: args.minPerDayHours, minProWocheH: args.minPerWeekHours, minProMonatH: args.minPerMonthHours, minProJahrH: args.minPerYearHours };
    const problem = !hasPeriodTarget(targets) ? "GOAL_PERIOD_TARGET_REQUIRED" : checkGoalPlausibility(targets);
    return dryRunPreview("set_training_goal", problem ?? undefined, { categoryId, validFrom: iso(gueltigAb)!, validUntil: iso(gueltigBis), ...targets });
  }

  const data = unwrap(await createVorgabe({
    userId,
    categoryId,
    gueltigAb,
    gueltigBis,
    minProTagH: args.minPerDayHours,
    minProWocheH: args.minPerWeekHours,
    minProMonatH: args.minPerMonthHours,
    minProJahrH: args.minPerYearHours,
    notiz: args.note,
  }));
  const when = args.validFrom ? `scheduled from ${iso(gueltigAb)!.slice(0, 10)}` : "active now";
  return { ok: true, id: data.id, message: `Training goal set (${when}).` };
}

export interface WithdrawArgs {
  target: "lock_request" | "lock_period" | "inspection" | "orgasm_directive" | "task";
  /** EINE Direktive gezielt zurückziehen (nur lock_request/lock_period). Ohne id trifft es alle
   *  offenen der Art — bei mehreren offenen Anforderungen wäre das mehr als gemeint. */
  id?: string;
  dryRun?: boolean;
}

/** Prüft, dass die per id gewählte Direktive zum Ziel-Sub UND zur angegebenen Art gehört — die id
 *  kommt vom Agenten, nicht aus einer bereits gefilterten Liste. Ohne diese Schranke zöge ein
 *  vertippter oder verwechselter Wert eine fremde Direktive zurück, und die Antwort meldete brav
 *  Erfolg. Die Zustands-Regeln (bereits zurückgezogen/erfüllt) prüft der Service selbst.
 *
 *  Gibt die geprüfte Zeile zurück, damit die Antwort sie benennen kann (`withdrawnItems`) — sie ist
 *  hier ohnehin geladen, ein zweiter Fetch wäre dieselbe Zeile ein zweites Mal. */
async function assertOwnedDirective(id: string, userId: string, target: WithdrawArgs["target"]): Promise<OpenDirective> {
  const art = target === "lock_request" ? "ANFORDERUNG" : "SPERRZEIT";
  const row = await prisma.verschlussAnforderung.findUnique({
    where: { id },
    select: { id: true, userId: true, art: true, wirksamAb: true, benachrichtigtAt: true, endetAt: true, nachricht: true },
  });
  if (!row || row.userId !== userId || row.art !== art) throw new Error(`No open ${target} with id ${id}.`);
  return row;
}

/** Eine tatsächlich zurückgezogene Direktive. Dieselbe Form wie die dryRun-`targets`
 *  ({@link DirectiveRow}), plus `code` für Kontrollen — damit „was WÜRDE weggehen" und „was IST
 *  weggegangen" nicht in zwei verschiedenen Formen gelesen werden müssen. */
interface WithdrawnItem extends DirectiveRow {
  /** Der 5-stellige Kontroll-Code (nur `target: "inspection"`), sonst null. */
  code: string | null;
}

export async function mcpWithdraw(username: string, args: WithdrawArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.target === "task") {
    // Aufgaben verlangen IMMER eine id: sie koexistieren beliebig, ein Rundumschlag über alle offenen
    // wäre bei ihnen nie die gemeinte Geste.
    if (!args.id) throw new Error("target task requires an id (from keyholder_dashboard.openTasks).");
    const task = await prisma.task.findUnique({ where: { id: args.id }, select: { userId: true, title: true, holdUntil: true } });
    if (!task || task.userId !== userId) throw new Error(`No task with id ${args.id}.`);
    if (args.dryRun) {
      return { dryRun: true, tool: "withdraw", wouldSucceed: true, preview: { target: "task", id: args.id, title: task.title, willWithdraw: 1 } } satisfies DryRunPreview;
    }
    unwrap(await withdrawTask(args.id, userId));
    const taskIso = await isoForUser(userId);
    // `withdrawnItems` auch hier: die Werkzeug-Beschreibung sagt „the response ALWAYS names what
    // actually went" — ein Zweig ohne die Liste macht daraus eine Lüge, und ein Agent, der sie
    // ausliest, bekäme `undefined`. Aufgaben kennen keinen geplanten Zustand (der Sub sieht sie ab
    // dem Stellen), deshalb immer `triggered` und `scheduledFor: null`.
    return {
      ok: true, withdrawn: 1, hidden: 0,
      withdrawnItems: [{ id: args.id, status: "triggered", scheduledFor: null, endsAt: taskIso(task.holdUntil), message: task.title, code: null }] satisfies WithdrawnItem[],
      message: `Task "${task.title}" withdrawn. The user was notified — it can no longer become an offense.`,
    };
  }
  if (args.id && args.target !== "lock_request" && args.target !== "lock_period") {
    throw new Error("id is only supported for target lock_request, lock_period or task.");
  }
  const owned = args.id ? await assertOwnedDirective(args.id, userId, args.target) : null;
  if (args.dryRun) {
    // Reine Lese-Vorschau: zeigt, was ein echter Aufruf träfe, ohne etwas zurückzuziehen. Dieselbe
    // "offen"-Definition wie withdrawVerschlussAnforderung/withdrawOrgasmusAnforderung/resolveKontrolle
    // (siehe dort), hier nur gelesen statt geändert.
    //
    // Bei den id-fähigen Zielen (lock_request/lock_period) OHNE id die betroffenen Zeilen EINZELN
    // auflisten — die blosse Anzahl sagt nicht, WELCHE getroffen würde, und bei mehreren offenen ist
    // genau das die Frage vor einem gezielten Einzel-Rückzug. `getKeyholderLockRequests`/
    // `getKeyholderSperrzeiten` liefern exakt die Zeilen, die withdrawVerschlussAnforderung(art) auch
    // stornieren würde (identisches where), also ist targets.length == willWithdraw garantiert.
    if (!args.id && (args.target === "lock_request" || args.target === "lock_period")) {
      const iso = await isoForUser(userId);
      const open = args.target === "lock_request"
        ? await getKeyholderLockRequests(userId)
        : await getKeyholderSperrzeiten(userId);
      const targets = open.map((s) => directiveRow(s, iso));
      return { dryRun: true, tool: "withdraw", wouldSucceed: true, preview: { target: args.target, willWithdraw: targets.length, targets } } satisfies DryRunPreview;
    }
    let willWithdraw = 0;
    if (args.id) {
      willWithdraw = 1; // genau die eine, oben schon auf Sub + Art geprüfte Zeile
    } else if (args.target === "orgasm_directive") {
      willWithdraw = await prisma.orgasmusAnforderung.count({ where: { userId, fulfilledAt: null, withdrawnAt: null } });
    } else if (args.target === "inspection") {
      // Dieselbe Where-Klausel wie der Commit-Pfad unten — sonst verspräche die Vorschau einen
      // anderen Umfang, als der echte Rückzug dann trifft.
      willWithdraw = await prisma.kontrollAnforderung.count({
        where: { userId, entryId: null, withdrawnAt: null, ...keyholderVisibleKontrolleWhere() },
      });
    }
    // Bewusst das Literal statt dryRunPreview(): der breitere Rückgabetyp der Helferin würde die
    // Nicht-dryRun-Felder (withdrawn/hidden/message) für Aufrufer unerreichbar machen.
    return { dryRun: true, tool: "withdraw", wouldSucceed: true, preview: { target: args.target, ...(args.id ? { id: args.id } : {}), willWithdraw } } satisfies DryRunPreview;
  }
  let count = 0;
  // `hidden` (Teilmenge von `count`) = davon terminiert und noch nicht ausgelöst. Trifft ein Rückzug
  // sowohl eine laufende als auch eine geplante Direktive, sagt ein blosses `count: 2` nicht, WAS da
  // mitgegangen ist — die Keyholderin muss die geplante bewusst verloren haben können.
  let hidden = 0;
  // `notified` = wusste der Sub von der Direktive? Eine terminierte, noch nicht ausgeloeste ist fuer
  // ihn unsichtbar; sie zu stornieren meldet ihm nichts. Die Antwort darf das nicht anders behaupten.
  let notified = true;
  // WAS weggegangen ist, Zeile für Zeile. Zahlen allein benennen es nicht: der Rückzug ohne `id` ist
  // ein Rundumschlag und trifft auch Direktiven, von denen der Aufrufer nichts wusste (belegter Fall
  // 28.07.2026: eine falsch terminierte Kontrolle zurückgezogen, `withdrawn: 3` — zwei weitere waren
  // offen).
  //
  // Die SICHTBARKEIT je Zeile stammt immer aus der Antwort des Service, der sie storniert hat — nie
  // aus einem eigenen Nachlesen. Sonst könnte der Poller genau dazwischen auslösen und die Liste
  // („war geplant, er wusste nichts davon") dem Zähler widersprechen, der es besser weiss. Genau
  // diese Verwirrung soll das Feld beenden.
  //
  // Beim Rundumschlag über `target` kommen auch die ZEILEN aus der Transaktion des Service. Bei den
  // beiden id-gezielten Pfaden (`owned`, und je Zeile bei `inspection`) ist das nicht nötig: dort
  // steht die id von vornherein fest, es gibt keine Menge, die abweichen könnte — nur der Status
  // muss vom Service kommen, und er tut es.
  const withdrawnItems: WithdrawnItem[] = [];
  const isoFn = await isoForUser(userId);
  const lockItem = (row: OpenDirective): WithdrawnItem => ({ ...directiveRow(row, isoFn), code: null });
  // Über die Shared-Services zurückziehen → der Nutzer wird konsistent benachrichtigt (wie in der Admin-UI).
  if (owned) {
    // Genau eine Zeile — sonst identisch zum Rundumschlag unten, inklusive Antwort-Formulierung.
    // Auf `owned` verzweigen statt auf `args.id`: dieselbe Bedingung, aber der Compiler weiss es.
    ({ notified } = unwrap(await withdrawVerschlussAnforderungById(owned.id)));
    count = 1;
    hidden = notified ? 0 : 1;
    // Sichtbarkeit aus `notified` ableiten, NICHT aus dem `owned`-Abbild: das wurde vor dem Rückzug
    // gelesen, und stempelte der Poller in der Zwischenzeit `benachrichtigtAt`, meldete die Zeile
    // „scheduled", während Zähler und Meldung derselben Antwort „der Sub wurde benachrichtigt" sagen.
    withdrawnItems.push({
      ...lockItem(owned),
      status: notified ? "triggered" : "scheduled",
    });
  } else if (args.target === "orgasm_directive") {
    // Orgasmus-Anforderungen kennen kein `wirksamAb` (nicht terminierbar, siehe delayedTrigger) —
    // der Sub weiss immer von ihnen. `directiveRow` leitet daraus von selbst "triggered" ab, statt
    // dass diese Stelle die Sichtbarkeits-Regel ein zweites Mal von Hand formuliert.
    const { count: n, rows } = unwrap(await withdrawOrgasmusAnforderung(userId));
    count = n;
    for (const o of rows) withdrawnItems.push(lockItem({ ...o, wirksamAb: null, benachrichtigtAt: null }));
  } else if (args.target === "lock_request" || args.target === "lock_period") {
    const { count: n, hidden: h, notified: was, rows } = unwrap(
      await withdrawVerschlussAnforderung(userId, args.target === "lock_request" ? "ANFORDERUNG" : "SPERRZEIT"),
    );
    count = n; hidden = h; notified = was;
    for (const s of rows) withdrawnItems.push(lockItem(s));
  } else if (args.target === "inspection") {
    // Jede offene (noch nicht eingereichte) Inspektion per id zurückziehen — auch TERMINIERTE, aber
    // nur so weit, wie `keyholderVisibleKontrolleWhere` reicht: eine noch nicht ausgelöste
    // AUTO-Kontrolle sieht der Aufrufer nicht und nimmt sie deshalb auch nicht weg (siehe dort).
    // resolveKontrolle schweigt bei den terminierten: eine noch nicht ausgelöste Kontrolle ist für
    // den Sub unsichtbar, und die Meldung wäre der Verrat des Plans.
    const open = await prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: null, withdrawnAt: null, ...keyholderVisibleKontrolleWhere() },
      select: { id: true, code: true, deadline: true, wirksamAb: true, kommentar: true },
    });
    notified = false;
    for (const ka of open) {
      // Dieselbe Antwort treibt Zähler UND Zeile: `status` kann dem `hidden` nicht widersprechen.
      const wasNotified = unwrap(await resolveKontrolle(ka.id, "withdraw")).notified;
      if (wasNotified) notified = true;
      else hidden++; // schweigend storniert = der Sub kannte sie nicht (terminiert, nicht ausgelöst)
      withdrawnItems.push({
        id: ka.id,
        status: wasNotified ? "triggered" : "scheduled",
        scheduledFor: isoFn(ka.wirksamAb),
        endsAt: isoFn(ka.deadline), // bei einer Kontrolle ist das Ende die Erfüllungs-FRIST
        message: ka.kommentar,
        code: ka.code,
      });
    }
    count = open.length;
  } else {
    throw new Error(`Unknown withdraw target: ${args.target}`);
  }
  if (count === 0) return { ok: true, withdrawn: 0, hidden: 0, withdrawnItems: [], message: `Nothing open to withdraw for ${args.target}.` };
  // Gemischter Treffer (laufend + geplant): beides benennen. Der Rückzug per target ist bewusst ein
  // Rundumschlag — er darf nur nicht so klingen, als hätte er eine einzige Direktive erwischt.
  const mixed = hidden > 0 && hidden < count;
  const hardware = boxConsequenceNote(args.target);
  if (mixed) {
    return {
      ok: true, withdrawn: count, hidden, withdrawnItems,
      message: `Withdrew ${count} ${args.target}: ${count - hidden} already triggered (the user was notified by e-mail + push) and ${hidden} still SCHEDULED — those they never learned about, and were withdrawn silently. See withdrawnItems for which ones.${hardware}`,
    };
  }
  return {
    ok: true,
    withdrawn: count,
    hidden,
    withdrawnItems,
    message: notified
      ? `Withdrew ${count} ${args.target}; the user was notified by e-mail + push.${hardware}`
      : `Withdrew ${count} ${args.target}. It had not been triggered yet, so the user was NOT notified — they never learned it existed.${hardware}`,
  };
}

/**
 * Was der Rückzug für die HARDWARE bedeutet — angehängt an die Antwort, wenn es etwas zu sagen gibt.
 *
 * Nur bei `lock_period`, und dort nötig: der Rückzug einer Frist ist keine Öffnungs-Anweisung. Das ist
 * Absicht — sonst hübe er einen laufenden Einschluss auf, den niemand aufheben wollte. Nur stand es
 * nirgends: die Antwort meldete „withdrawn: 1", die Box hielt, und das sah nach einem Fehler aus
 * (belegter Fall 28.07.2026 — der Rückzug sollte die Box für ein Firmware-Update öffnen und tat es
 * nicht). Die Box folgt für auf/zu den EINTRÄGEN des Subs, nie den Direktiven.
 *
 * Bewusst OHNE Aussage über die Riegelstellung. Ein früherer Entwurf schrieb „der Riegel bleibt zu"
 * und war damit in zwei Fällen falsch: läuft eine REINIGUNGSPAUSE, ist die Box offen (`holdOpen`), und
 * Heimdalls Umwandlung in eine eigene Sperre lässt genau diesen Fall aus — und ohne Box (kein
 * Heimdall, kein gemapptes Gerät) gibt es überhaupt keinen Riegel, über den man etwas behaupten
 * könnte. Eine Antwort, die eine Hardware-Folge zusichert, die nicht gilt, ist schlechter als
 * Schweigen: die Keyholder-KI gibt sie als Tatsache weiter.
 */
function boxConsequenceNote(target: WithdrawArgs["target"]): string {
  if (target !== "lock_period") return "";
  return " NOTE: withdrawing a lock period is NOT an instruction to open. A box enforcing this lock " +
    "does not release because of it, and one already open (cleaning pause) does not close because of " +
    "it either — the box follows the user's ENTRIES for open/close, never the directives. It opens " +
    "when they record an opening, which is also what gets logged and judged.";
}

// ── Training goals: list / edit / delete ────────────────────────────────────

/** Loads a training goal and asserts it belongs to `userId` (scopes id-based tools to the target).
 *  Returns the full row so partial-edit callers can backfill omitted fields without a second load.
 *  Existence (incl. soft-delete via `deletedAt`, B-04) is `findActiveVorgabe` — THE shared
 *  definition with vorgabeService.ts's updateVorgabe/deleteVorgabe, not a parallel copy of it. */
async function loadOwnedVorgabe(id: string, userId: string) {
  const v = await findActiveVorgabe(id);
  if (!v || v.userId !== userId) throw new Error(`Training goal not found: ${id}`);
  return v;
}

/** Scalar-Snapshot eines TrainingVorgabe-Bestands für den dryRun-Diff (B-05) — dieselben Feldnamen
 *  wie im edit/delete-Preview, damit diffFields() beide Seiten deckungsgleich vergleicht. */
function vorgabeSnapshot(v: { categoryId: string | null; gueltigAb: Date; gueltigBis: Date | null; minProTagH: number | null; minProWocheH: number | null; minProMonatH: number | null; minProJahrH: number | null; notiz: string | null }, iso: Iso): Record<string, unknown> {
  return {
    categoryId: v.categoryId,
    validFrom: iso(v.gueltigAb),
    validUntil: iso(v.gueltigBis),
    minProTagH: v.minProTagH,
    minProWocheH: v.minProWocheH,
    minProMonatH: v.minProMonatH,
    minProJahrH: v.minProJahrH,
    note: v.notiz,
  };
}

export interface TrainingGoalRow {
  id: string;
  category: string;
  /** Zeit-Lebenszyklus (scheduled|active|expired) — ODER "deleted" (B-04), wenn `deletedAt`
   *  gesetzt ist. "deleted" hat Vorrang: ein soft-gelöschtes Ziel ist keins der drei Zeit-Stadien
   *  mehr, egal was sein Datumsfenster sagt. */
  status: string;
  validFrom: string;
  validUntil: string | null;
  minPerDayHours: number | null;
  minPerWeekHours: number | null;
  minPerMonthHours: number | null;
  minPerYearHours: number | null;
  note: string | null;
  /** null = aktiv. Gesetzt = soft-gelöscht (B-04, MCP-Befundliste 2026-07-17) — die Zeile bleibt für
   *  die Historie erhalten, `includeDeleted` muss gesetzt sein, um sie hier überhaupt zu sehen. */
  deletedAt: string | null;
}

export interface ListTrainingGoalsResult extends Envelope {
  ok: true;
  goals: TrainingGoalRow[];
}

export interface ListTrainingGoalsArgs {
  category?: string;
  /** B-04: auch soft-gelöschte Ziele mitliefern (Default false — die AUTORITATIVE Ziel-Historie,
   *  die explain_model §13 verspricht, ist erst DAMIT wirklich vollständig einsehbar). */
  includeDeleted?: boolean;
}
export async function mcpListTrainingGoals(username: string, args: ListTrainingGoalsArgs): Promise<ListTrainingGoalsResult> {
  const userId = await resolveTargetUserId(username);
  const filterCatId = args.category ? await resolveCategoryId(userId, args.category) : undefined;
  const timezone = await tzOf(userId);
  const iso = makeIso(timezone);
  const now = new Date();
  const nowMs = now.getTime();
  const goals: TrainingGoalRow[] = (await listVorgaben(userId, { includeDeleted: args.includeDeleted }))
    .filter((g) => filterCatId === undefined || g.categoryId === filterCatId)
    .map((g) => {
      const ab = g.gueltigAb.getTime();
      const bis = g.gueltigBis ? g.gueltigBis.getTime() : null;
      const dateStatus = ab > nowMs ? "scheduled" : bis !== null && bis <= nowMs ? "expired" : "active";
      return {
        id: g.id,
        category: g.category?.name ?? "KG",
        status: g.deletedAt ? "deleted" : dateStatus,
        validFrom: iso(g.gueltigAb)!,
        validUntil: iso(g.gueltigBis),
        minPerDayHours: g.minProTagH,
        minPerWeekHours: g.minProWocheH,
        minPerMonthHours: g.minProMonatH,
        minPerYearHours: g.minProJahrH,
        note: g.notiz,
        deletedAt: iso(g.deletedAt),
      };
    });
  return { ok: true, ...buildEnvelope(now, iso, timezone), goals };
}

export interface EditTrainingGoalArgs extends SetTrainingGoalArgs {
  id: string;
}
export async function mcpEditTrainingGoal(username: string, args: EditTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  // Bestand laden (inkl. Ownership-Check) — edit ist ein PARTIAL-Update: jedes weggelassene
  // Argument behält seinen Bestandswert. updateVorgabe überschreibt alle Felder, daher müssen
  // ausgelassene hier explizit aus dem Bestand nachgereicht werden (sonst würden Startdatum,
  // manuelles Enddatum, Stundenziele und Notiz still auf Defaults zurückgesetzt).
  const existing = await loadOwnedVorgabe(args.id, userId);

  // Category: only change when provided (omit = keep existing).
  const categoryId = args.category !== undefined ? await resolveCategoryId(userId, args.category) : undefined;
  const gueltigAb = args.validFrom ? parseIsoDate(args.validFrom, "validFrom") : existing.gueltigAb;
  // validUntil gesetzt → neues, bewusst gesetztes Ende (manuell). Weggelassen/leer → Bestand
  // behalten, inkl. des bestehenden manuell-Flags (abgeleitetes Ende bleibt abgeleitet).
  // Truthy-Check bewusst: "" bedeutet „nicht angegeben" (nicht „parse Invalid Date").
  const validUntilProvided = !!args.validUntil;
  const gueltigBis = validUntilProvided ? parseIsoDate(args.validUntil!, "validUntil") : existing.gueltigBis;
  const validUntilManual = validUntilProvided ? true : existing.validUntilManual;
  // Datums-Guard nur prüfen, wenn dieser Edit ein Datum wirklich anfasst — sonst würde ein reiner
  // Notiz-/Stunden-Edit auf Bestandsdaten (z.B. verkettetes Ende == Start bei gleichem gueltigAb)
  // fälschlich „validUntil must be after validFrom" werfen, obwohl kein Datum geändert wurde.
  if ((args.validFrom || validUntilProvided) && gueltigBis && gueltigBis.getTime() <= gueltigAb.getTime()) {
    throw new Error("validUntil must be after validFrom.");
  }

  const merged = {
    minProTagH: args.minPerDayHours ?? existing.minProTagH,
    minProWocheH: args.minPerWeekHours ?? existing.minProWocheH,
    minProMonatH: args.minPerMonthHours ?? existing.minProMonatH,
    minProJahrH: args.minPerYearHours ?? existing.minProJahrH,
  };
  if (args.dryRun) {
    const iso = await isoForUser(userId);
    const problem = !hasPeriodTarget(merged) ? "GOAL_PERIOD_TARGET_REQUIRED" : checkGoalPlausibility(merged);
    // Dieselbe Feldnamen-Abbildung wie `vorgabeSnapshot` — statt sie hier ein zweites Mal von Hand
    // hinzuschreiben, durch einen (ungespeicherten) Vorgabe-artigen Zwischenstand jagen.
    const after = vorgabeSnapshot({ categoryId: categoryId ?? existing.categoryId, gueltigAb, gueltigBis, ...merged, notiz: args.note ?? existing.notiz }, iso);
    return dryRunPreview("edit_training_goal", problem ?? undefined, { id: args.id, ...after }, diffFields(vorgabeSnapshot(existing, iso), after));
  }

  unwrap(await updateVorgabe(args.id, {
    categoryId,
    gueltigAb,
    gueltigBis,
    validUntilManual,
    ...merged,
    notiz: args.note ?? existing.notiz,
  }));
  return { ok: true, id: args.id, message: "Training goal updated." };
}

export interface DeleteTrainingGoalArgs {
  id: string;
  dryRun?: boolean;
}
export async function mcpDeleteTrainingGoal(username: string, args: DeleteTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  const existing = await loadOwnedVorgabe(args.id, userId);
  if (args.dryRun) {
    const before = vorgabeSnapshot(existing, await isoForUser(userId));
    const deleted = Object.fromEntries(Object.keys(before).map((key) => [key, null])); // Objekt verschwindet — jedes Feld → null
    return dryRunPreview("delete_training_goal", undefined, { id: args.id, category: existing.categoryId }, diffFields(before, deleted));
  }
  unwrap(await deleteVorgabe(args.id));
  return { ok: true, id: args.id, message: "Training goal soft-deleted — hidden from list_training_goals unless includeDeleted:true, kept for history." };
}

// ── Cleaning (Reinigung) settings ───────────────────────────────────────────

export interface SetCleaningArgs {
  allowed?: boolean;
  maxMinutes?: number;
  maxPerDay?: number;
  /** Die Tages-Fenster VOLLSTÄNDIG ersetzen; `[]` löscht sie, Weglassen lässt sie unberührt
   *  (Bedeutung: siehe Tool-Beschreibung in `route.ts`). */
  windows?: { start: string; end: string }[];
  dryRun?: boolean;
}

/**
 * Wirft die Fenster-Regel des Services ({@link reinigungsFensterListProblem}) als Satz — mit der
 * STELLE, an der es klemmt. Der Service lehnt dieselbe Liste ohnehin ab; hier vorab, damit auch der
 * dryRun sie sieht und der Agent das schuldige Paar nicht raten muss.
 */
function assertCleaningWindows(windows: { start: string; end: string }[]): void {
  const problem = reinigungsFensterListProblem(windows);
  if (!problem) return;
  const stelle = problem.index === undefined ? "windows" : `windows[${problem.index}] ${JSON.stringify(windows[problem.index])}`;
  throw new Error(`${stelle}: ${enErrorText(problem.code)}`);
}

export async function mcpSetCleaning(username: string, args: SetCleaningArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.allowed === undefined && args.maxMinutes === undefined && args.maxPerDay === undefined && args.windows === undefined) {
    throw new Error("Provide at least one of: allowed, maxMinutes, maxPerDay, windows.");
  }
  // VOR dem dryRun-Zweig: eine ungültige Fenster-Liste muss auch der Preview als Fehler zeigen,
  // sonst verspricht er einen Stand, den der Commit danach ablehnt.
  const windows = args.windows;
  if (windows) assertCleaningWindows(windows);
  if (args.dryRun) {
    // Zeigt den GEKLEMMTEN Wert, nicht den rohen Input — sonst täuscht der Preview genau die
    // stille Klemmung vor, die er aufdecken soll (setReinigungSettings klemmt intern identisch).
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true },
    });
    const clampedMinutes = args.maxMinutes !== undefined ? clamp(args.maxMinutes, CLEANING_MAX_MINUTES_RANGE) : undefined;
    const clampedPerDay = args.maxPerDay !== undefined ? clamp(args.maxPerDay, CLEANING_MAX_PER_DAY_RANGE) : undefined;
    // maxPerDay durch denselben Null-Sentinel wie get_context.cleaning (0 = "unbegrenzt" → null nach
    // aussen) — sonst zeigt dieser Preview für denselben Zustand eine andere Zahl als get_context.
    // Die Fenster als "HH:MM-HH:MM"-Zeilen: der Diff soll die ganze ALTE gegen die ganze NEUE Liste
    // zeigen (die Ersetzung ist der Punkt), und eine Liste von Objekten liest dort niemand.
    const before: Record<string, unknown> = {
      allowed: current.reinigungErlaubt, maxMinutes: current.reinigungMaxMinuten,
      maxPerDay: maxPausesPerDaySentinel(current.reinigungMaxProTag),
      windows: parseReinigungsFenster(current.reinigungsFenster).map(formatReinigungsFenster),
    };
    const after: Record<string, unknown> = {
      allowed: args.allowed ?? before.allowed,
      maxMinutes: clampedMinutes ?? before.maxMinutes,
      maxPerDay: clampedPerDay !== undefined ? maxPausesPerDaySentinel(clampedPerDay) : before.maxPerDay,
      windows: windows ? windows.map(formatReinigungsFenster) : before.windows,
    };
    return dryRunPreview("set_cleaning", undefined, {
      ...after,
      ...(args.maxMinutes !== undefined && clampedMinutes !== args.maxMinutes ? { maxMinutesClampedFrom: args.maxMinutes } : {}),
      ...(args.maxPerDay !== undefined && clampedPerDay !== args.maxPerDay ? { maxPerDayClampedFrom: args.maxPerDay } : {}),
    }, diffFields(before, after));
  }
  unwrap(await setReinigungSettings(userId, {
    erlaubt: args.allowed,
    maxMinuten: args.maxMinutes,
    maxProTag: args.maxPerDay,
    fenster: windows,
  }));
  return { ok: true, message: `Cleaning settings updated.${windowsNote(windows)}` };
}

/** Der Zusatz zur Erfolgsmeldung, wenn die Fenster ersetzt wurden. Eine geleerte Liste bekommt einen
 *  eigenen Satz: „keine Fenster" heisst NICHT „keine Reinigung", sondern „jederzeit" — dieselbe
 *  Verwechslung, vor der die Tool-Beschreibung warnt, hier noch einmal am Ergebnis. */
function windowsNote(windows: ReinigungsFenster[] | undefined): string {
  if (!windows) return "";
  if (windows.length === 0) return " All cleaning windows removed — cleaning is no longer restricted to times of day (use allowed:false to forbid it).";
  return ` Cleaning windows replaced (${windows.length}): ${windows.map(formatReinigungsFenster).join(", ")}.`;
}

// Hinweis: Es gibt bewusst KEIN mcpSetAutoInspections mehr — die Einstellungen der automatischen
// Kontrollen dürfen über den MCP nicht geändert werden (nur manuelle Kontrollen via request_inspection).
// Die Admin-UI nutzt setAutoKontrolleSettings direkt.

// ── Inspections: verify / reject the latest submission ──────────────────────

export interface ResolveInspectionArgs {
  action: "verify" | "reject";
  dryRun?: boolean;
}
export async function mcpResolveInspection(username: string, args: ResolveInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  // Gesucht wird die juengste eingereichte Kontrolle — ueber den EINTRAG, nicht ueber die
  // Anforderung. Die Suche ueber `KontrollAnforderung` liess die freiwillige Selbstkontrolle
  // unauffindbar (sie hat keine Anforderung): der Keyholder bekam "No submitted inspection",
  // obwohl ein Foto vorlag, und eine Kontrolle mit zurueckgezogener Anforderung wurde still
  // uebersprungen — beurteilt wurde dann eine AELTERE. Beides derselbe Konstruktionsfehler wie in
  // der Admin-UI (Vorfall 07.08.2026).
  //
  // `imageUrl: { not: null }` ist die EINREICHUNG: beurteilt wird ein Foto. Der Keyholder-Pfad darf
  // eine Kontrolle ohne Foto nachtragen (`requirePhotoForPruefung: false`) — so eine Zeile ist
  // nichts, worueber es ein Urteil geben koennte, und wuerde sonst die echte Einreichung verdecken.
  //
  // `createdAt` statt `startTime`: die Eintrags-Zeit ist frei waehlbar, die Reihenfolge der
  // EINREICHUNGEN steht nur in der Server-Uhr.
  const entry = await prisma.entry.findFirst({
    where: { userId, type: "PRUEFUNG", imageUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, verifikationStatus: true },
  });
  if (!entry) throw new Error("No submitted inspection to verify or reject.");
  const action = args.action === "verify" ? "manuallyVerify" : "reject";
  if (args.dryRun) {
    const before: Record<string, unknown> = { verifikationStatus: entry.verifikationStatus };
    const after: Record<string, unknown> = { verifikationStatus: verifikationStatusFor(action) };
    return dryRunPreview("resolve_inspection", undefined, { id: entry.id, action: args.action }, diffFields(before, after));
  }
  unwrap(await resolveInspectionEntry(entry.id, action));
  return { ok: true, message: `Latest inspection ${args.action === "verify" ? "verified" : "rejected"}; the user was notified by e-mail + push.` };
}

// ── Lock period: change the end of an active Sperrzeit ───────────────────────

export interface EditLockPeriodArgs {
  untilAt?: string;
  indefinite?: boolean;
  /** Die zu ändernde Sperrzeit explizit wählen (id aus `keyholder_dashboard.scheduledDirectives`).
   *  Ohne id gewinnt die AUSGELÖSTE — siehe {@link mcpEditLockPeriod}. */
  id?: string;
  dryRun?: boolean;
}

/**
 * Ändert das Ende EINER offenen Sperrzeit — offen heisst: nicht zurückgezogen, nicht beendet, also
 * inklusive einer terminierten, noch nicht ausgelösten.
 *
 * **Es kann mehr als eine offene geben** (warum: {@link foldActiveSperrzeiten}), und die alte
 * „nimm die neueste"-Auswahl traf die gemeinte nur durch Zufall der Sortierung.
 *
 * Auswahl ohne `id`: **die AUSGELÖSTE gewinnt** (`!isHiddenFromSub` — die, die der Sub kennt und die
 * gerade durchsetzt). Sagt die Keyholderin „die Sperrzeit", meint sie die laufende, nicht die für in
 * drei Wochen geplante. Ein harter Fehler („multiple open — specify id") wäre die Alternative, wurde
 * aber verworfen: der häufige Fall (eine laufende + eine geplante) ist eindeutig gemeint, und die KI
 * daran scheitern zu lassen kostet mehr, als die seltene Fehlwahl korrigierbar zu machen. Gibt es NUR
 * geplante, wird die neueste genommen.
 *
 * Die Mehrdeutigkeit bleibt nicht stumm: `untouched` nennt die nicht gewählten mit id und Status, und
 * über `id` lässt sich jede davon gezielt ansprechen.
 */
/** Eine offene Direktive, die ein Edit-Tool treffen kann (Sperrzeit ODER Anforderung). */
type OpenDirective = { id: string; wirksamAb: Date | null; benachrichtigtAt: Date | null; endetAt: Date | null; nachricht: string | null };

/** Eine offene Direktive als Auswahl-Zeile: welche (id), kennt der Sub sie schon (triggered) oder
 *  ist sie noch geplant (scheduled), wann löst sie aus / endet sie, und die Nachricht als
 *  menschliches Unterscheidungsmerkmal. */
interface DirectiveRow {
  id: string;
  status: "scheduled" | "triggered";
  scheduledFor: string | null;
  endsAt: string | null;
  message: string | null;
}

/** Baut eine {@link DirectiveRow}. Geteilt von `pickEditTarget` (untouched) und dem withdraw-dryRun
 *  (targets), damit „welche Direktiven sind betroffen" überall dieselbe Form hat. */
function directiveRow(s: OpenDirective, iso: Iso): DirectiveRow {
  return {
    id: s.id,
    status: isHiddenFromSub(s) ? "scheduled" : "triggered",
    scheduledFor: iso(s.wirksamAb),
    endsAt: iso(s.endetAt),
    message: s.nachricht,
  };
}

/**
 * Wählt aus mehreren offenen Direktiven die gemeinte — und macht die Mehrdeutigkeit sichtbar,
 * statt sie zu verschlucken. Geteilt von `edit_lock_period` und `edit_lock_request`, damit die
 * Auswahl-Regel an EINER Stelle steht: ohne `id` gewinnt die AUSGELÖSTE (die, die der Sub kennt);
 * gibt es nur geplante, die erste der Liste.
 */
function pickEditTarget<T extends OpenDirective>(
  open: T[],
  id: string | undefined,
  iso: Iso,
  label: "lock period" | "lock request",
): { target: T; untouched: DirectiveRow[]; ambiguity: string } {
  if (open.length === 0) throw new Error(`No open ${label} to edit.`);
  const target = id
    ? open.find((s) => s.id === id)
    : open.find((s) => !isHiddenFromSub(s)) ?? open[0];
  if (!target) throw new Error(`No open ${label} with id ${id} (it may be withdrawn, ended, or belong to someone else).`);

  const untouched = open.filter((s) => s.id !== target.id).map((s) => directiveRow(s, iso));
  const ambiguity = untouched.length === 0 ? ""
    : ` NOTE: ${open.length} ${label}s are open — edited the ${isHiddenFromSub(target) ? "SCHEDULED" : "triggered"} one; the others are listed under "untouched". Pass id=… to edit one of those instead.`;
  return { target, untouched, ambiguity };
}

export async function mcpEditLockPeriod(username: string, args: EditLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
  const iso = await isoForUser(userId);
  if (!args.indefinite && !args.untilAt) throw new Error("Provide untilAt (ISO date) or indefinite=true.");
  const endetAt = args.indefinite ? null : parseIsoDate(args.untilAt!, "untilAt");

  const open = await getKeyholderSperrzeiten(userId); // aktive UND geplante, neueste zuerst
  const { target, untouched, ambiguity } = pickEditTarget(open, args.id, iso, "lock period");

  if (args.dryRun) {
    const lockEndError = checkLockEnd(endetAt, target.wirksamAb, new Date());
    const before: Record<string, unknown> = { endetAt: iso(target.endetAt), indefinite: target.endetAt === null };
    const after: Record<string, unknown> = { endetAt: iso(endetAt), indefinite: !!args.indefinite };
    return {
      dryRun: true, tool: "edit_lock_period", wouldSucceed: !lockEndError,
      ...(lockEndError ? { problem: lockEndError } : {}),
      preview: { id: target.id, untilAt: after.endetAt, indefinite: after.indefinite, otherOpenCount: open.length - 1 },
      diff: diffFields(before, after),
    } satisfies DryRunPreview;
  }

  const { notified } = unwrap(await updateSperrzeitEnde(target.id, endetAt));
  const what = args.indefinite ? "Lock period set to indefinite." : `Lock period end changed to ${iso(endetAt)}.`;
  return {
    ok: true,
    id: target.id,
    untouched,
    message: (notified
      ? `${what} The user was notified by e-mail + push.`
      : `${what} It is still SCHEDULED (not triggered yet), so the user was NOT notified — they will learn the new end when it triggers.`) + ambiguity,
  };
}

// ── Lock request: change an open Einschliess-Anforderung ─────────────────────

export interface EditLockRequestArgs {
  /** Die zu ändernde Anforderung explizit wählen. Ohne id gewinnt die AUSGELÖSTE (siehe pickEditTarget). */
  id?: string;
  deadlineAt?: string;
  deadlineHours?: number;
  minDurationHours?: number;
  lockUntilAt?: string;
  /** Sperr-Vorgabe ganz entfernen (weder Mindestdauer noch absolutes Ende). */
  clearLockPeriod?: boolean;
  cleaningAllowed?: boolean;
  deviceName?: string;
  clearDevice?: boolean;
  /** Neue Nachricht; "" löscht die bestehende. */
  message?: string;
  /** Neuer Auslöse-Zeitpunkt (ISO) für eine noch terminierte Anforderung. */
  scheduledAt?: string;
  /** Terminierte Anforderung sofort zustellen. */
  triggerNow?: boolean;
  dryRun?: boolean;
}

/**
 * Ändert EINE offene Einschliess-Anforderung (Frist, Nachricht, Gerät, Sperr-Vorgabe, Auslösezeit).
 *
 * Warum ein eigenes Tool statt „zurückziehen und neu stellen": für den Sub ist das nicht dasselbe —
 * er sähe eine Rücknahme plus eine zweite Anweisung, und bei einer terminierten wäre die
 * Verborgenheit dahin. Seit mehrere Anforderungen koexistieren dürfen, wäre es ausserdem kein
 * Ersatz mehr, sondern eine zusätzliche Frist.
 */
export async function mcpEditLockRequest(username: string, args: EditLockRequestArgs) {
  const userId = await resolveTargetUserId(username);
  const iso = await isoForUser(userId);
  if (args.clearLockPeriod && (args.minDurationHours != null || args.lockUntilAt != null)) {
    throw new Error("clearLockPeriod cannot be combined with minDurationHours/lockUntilAt.");
  }
  if (args.clearDevice && args.deviceName) throw new Error("clearDevice cannot be combined with deviceName.");
  if (args.triggerNow && args.scheduledAt) throw new Error("triggerNow cannot be combined with scheduledAt.");

  const open = await getKeyholderLockRequests(userId); // ausgelöste UND geplante, dringendste zuerst
  const { target, untouched, ambiguity } = pickEditTarget(open, args.id, iso, "lock request");

  // Auslösung zuerst auflösen — eine relative Frist (deadlineHours) zählt ab dem Zeitpunkt, ab dem
  // die Anforderung gilt, und der kann in diesem Aufruf gerade verschoben werden.
  const now = new Date();
  const wirksamAb = args.triggerNow ? null
    : args.scheduledAt ? parseIsoDate(args.scheduledAt, "scheduledAt")
    : target.wirksamAb;
  const deadlineFrom = isScheduledDirective(wirksamAb, now) ? wirksamAb! : now;
  const endetAt = args.deadlineAt ? parseIsoDate(args.deadlineAt, "deadlineAt")
    : args.deadlineHours != null ? new Date(deadlineFrom.getTime() + args.deadlineHours * 60 * 60 * 1000)
    : undefined;

  const deviceId = args.clearDevice ? null
    : args.deviceName ? await resolveDeviceId(userId, args.deviceName)
    : undefined;

  const patch: UpdateLockRequestParams = {
    ...(endetAt ? { endetAt } : {}),
    ...(args.message !== undefined ? { nachricht: args.message } : {}),
    ...(deviceId !== undefined ? { deviceId } : {}),
    ...(args.cleaningAllowed !== undefined ? { reinigungErlaubt: args.cleaningAllowed } : {}),
    ...(args.clearLockPeriod ? { dauerH: null, sperrEndetAt: null } : {}),
    ...(args.minDurationHours != null ? { dauerH: args.minDurationHours } : {}),
    ...(args.lockUntilAt ? { sperrEndetAt: parseIsoDate(args.lockUntilAt, "lockUntilAt") } : {}),
    ...(args.triggerNow || args.scheduledAt ? { wirksamAb } : {}),
  };

  if (args.dryRun) {
    // Die Ziel-Zeile rechnet der SERVICE aus (mergeLockRequestPatch) — die Vorschau formatiert sie nur.
    // Eine eigene Nachrechnung hier verspräche früher oder später etwas anderes, als der Commit tut.
    // Die Zustands-Regeln des Services (erfüllt/zurückgezogen, Gerätebesitz) laufen erst beim Commit.
    const next = mergeLockRequestPatch(target, patch);
    // Denselben Ausschluss wie der Commit (updateLockRequest → LOCK_DURATION_OR_END) und wie
    // request_lock: sonst meldete die Vorschau „wouldSucceed" für eine Eingabe, die der Commit
    // ablehnt — genau die Divergenz, die mergeLockRequestPatch zu verhindern beansprucht.
    const problem = (patch.dauerH != null && patch.sperrEndetAt != null)
      ? "LOCK_DURATION_OR_END"
      : checkLockEnd(next.sperrEndetAt, next.wirksamAb, now) ?? undefined;
    const fields = (row: MergedLockRequest, deviceName: string | null): Record<string, unknown> => ({
      deadlineAt: iso(row.endetAt),
      message: row.nachricht,
      device: deviceName,
      minDurationHours: row.dauerH,
      lockUntilAt: iso(row.sperrEndetAt),
      cleaningAllowed: row.reinigungErlaubt,
      scheduledFor: iso(row.wirksamAb),
    });
    const before = fields(target, target.device?.name ?? null);
    const after = fields(next, next.deviceId === target.deviceId ? (target.device?.name ?? null) : (args.deviceName ?? null));
    return dryRunPreview("edit_lock_request", problem, { id: target.id, otherOpenCount: open.length - 1, ...after }, diffFields(before, after));
  }

  const { notified, deliveredToPoller } = unwrap(await updateLockRequest(target.id, patch));
  const stillScheduled = isScheduledDirective(wirksamAb, now);
  const what = `Lock request updated (deadline ${iso(endetAt ?? target.endetAt)}).`;
  return {
    ok: true,
    id: target.id,
    untouched,
    message: (stillScheduled
      ? `${what} It is still SCHEDULED (not triggered yet), so the user was NOT notified — they will get the updated version when it triggers.`
      : notified
        ? `${what} The user was notified by e-mail + push.`
        : deliveredToPoller
          ? `${what} It is due now; the scheduler will deliver the updated version to the user within a minute.`
          : `${what} The user was not notified.`) + ambiguity,
  };
}

// ── Urteil über ein erkanntes Vergehen (Strafbuch-Loop) ─────────────────────

export interface JudgeOffenseArgs {
  /** Vergehens-ref aus get_offenses (das Feld `ref.id`). */
  ref: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: die Strafe (bei punish, erforderlich — z.B. „20 Schläge") bzw. ein Grund (bei dismiss). */
  text?: string;
  dryRun?: boolean;
}
export async function mcpJudgeOffense(username: string, args: JudgeOffenseArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.dryRun) {
    const iso = await isoForUser(userId);
    // Nur die eine hier prüfbare Regel (PENALTY_TEXT_REQUIRED) — ob `ref` überhaupt ein offenes
    // Vergehen ist und die Aktion zu dessen Status passt, entscheidet erst judgeOffense (Strafbuch-
    // Zustand), das hier bewusst NICHT dupliziert wird.
    const problem = checkPenaltyText(args.action, args.text);
    // StrafeRecord ist ein upsert-by-refId (siehe judgeOffense) — erstes Urteil = Create (before {}),
    // erneutes Urteil = Update (before = bestehende Zeile). `refId` ist global @unique (nicht userId-
    // skopiert) — userId hier explizit gegenprüfen, sonst könnte ein ref eines ANDEREN Users auf
    // dieser Multi-User-Instanz dessen Strafbuch-Zeile (status/reason/judgedBy) leaken. Dieselbe
    // Grenze, die judgeOffense beim echten complete/reopen explizit zieht (rec.userId !== p.userId /
    // deleteMany scoped by userId) — hier nur zusätzlich lesend statt schreibend. Übersprungen, wenn
    // `problem` schon feststeht (Preview wird ohnehin als wouldSucceed:false verworfen).
    const record = problem ? null : await prisma.strafeRecord.findUnique({
      where: { refId: args.ref },
      select: { userId: true, status: true, reason: true, judgedBy: true, erledigtAt: true, taskId: true },
    });
    const existing = record?.userId === userId ? record : null;
    // `penaltyTask` steht im diff, weil ein Urteil MEHR bewegt als seine eigene Zeile: hängt eine
    // Strafaufgabe daran, zieht `writeJudgment` sie zurück (reopen, dismiss, neues punish). Ohne
    // dieses Feld meldete die Vorschau ein blosses Verschwinden von Urteils-Feldern, während der
    // Commit dem Sub eine laufende Forderung nimmt — genau die Art Nebenwirkung, für die es die
    // Vorschau gibt.
    const before: Record<string, unknown> = existing
      ? { status: existing.status, reason: existing.reason, judgedBy: existing.judgedBy, erledigtAt: iso(existing.erledigtAt), penaltyTask: existing.taskId }
      : {};
    // reopen ohne bestehenden Record (JUDGMENT_NOT_FOUND), complete auf einem nicht-PUNISHED Record
    // (PENALTY_NOT_PUNISHED) und punish/dismiss auf einem ref, das kein aktuell erkanntes Vergehen
    // mehr ist (OFFENSE_NOT_FOUND), sind reale Ablehnungsgründe — statt in diesen Fällen eine
    // Transition vorzutäuschen, die der echte Commit ablehnen würde, bleibt der diff dann schlicht
    // weg. Für punish/dismiss heisst das: dieselbe Prüfung wie im echten Commit (buildStrafbuch +
    // collectDetectedOffenses), NUR für den diff — wouldSucceed bleibt bewusst der Best-Effort-Check
    // von oben (siehe `problem`-Kommentar), damit ein teurer Strafbuch-Aufbau nicht bei jedem dryRun
    // erzwungen wird, sondern nur dann, wenn er für den diff gebraucht wird.
    const offenseIsLive = !problem && (args.action === "punish" || args.action === "dismiss")
      ? !!(await requireDetectedOffense(userId, args.ref, new Date()))
      : false;
    const knownTransition =
      args.action === "punish" || args.action === "dismiss" ? offenseIsLive
      : args.action === "reopen" ? !!existing
      : existing?.status === "PUNISHED"; // action === "complete"
    // reopen löscht die Zeile (deleteMany) — jedes Feld → null, nicht undefined (konsistent mit
    // delete_training_goal: das Objekt verschwindet, das ist ein Wert, keine Abwesenheit).
    const after: Record<string, unknown> | undefined = !knownTransition ? undefined
      : args.action === "reopen" ? Object.fromEntries(Object.keys(before).map((key) => [key, null]))
      // `complete` schliesst nur den Loop und lässt die Aufgabe, wie sie ist.
      : args.action === "complete" ? { status: existing!.status, reason: existing!.reason, judgedBy: existing!.judgedBy, erledigtAt: iso(existing!.erledigtAt ?? new Date()), penaltyTask: existing!.taskId }
      // punish/dismiss über den FREITEXT-Weg löst eine bestehende Strafaufgabe und zieht sie zurück.
      : { status: judgmentStatus(args.action), reason: args.text?.trim() || null, judgedBy: "ai", erledigtAt: null, penaltyTask: null };
    return dryRunPreview("judge_offense", problem ?? undefined, { ref: args.ref, action: args.action, text: args.text ?? null }, after ? diffFields(before, after) : undefined);
  }
  const r = unwrap(await judgeOffense({
    userId,
    refId: args.ref,
    action: args.action,
    text: args.text,
    judgedBy: "ai",
  }));
  const message =
    args.action === "complete" ? "Penalty marked as completed."
    : r.status === "dismissed" ? "Offense dismissed (no penalty)."
    : r.status === "open" ? "Judgment reopened — the offense is open again."
    : "Offense punished — the penalty was recorded; the user was notified by e-mail + push.";
  return { ok: true, status: r.status, done: r.done, message };
}

// ── Aufgaben ────────────────────────────────────────────────────────────────────────────────────

export interface TaskRequirementArg {
  /** Kategoriename („Halsband"); „KG" ist hier NICHT zulässig — dafür `requireKgLocked`. */
  category: string;
  /** Optional ein bestimmtes Gerät dieser Kategorie. */
  device?: string;
}

export interface CreateTaskArgs {
  title: string;
  description?: string;
  holdUntilAt?: string;
  holdHours?: number;
  requireKgLocked?: boolean;
  requireWearing?: TaskRequirementArg[];
  /** Geforderte Nachweis-Fotos, in der Reihenfolge, in der sie ENTSTEHEN müssen. */
  requireProof?: { description: string; requireCode?: boolean }[];
  startGraceMinutes?: number;
  isPunishment?: boolean;
  penaltyReason?: string;
  /** `ref` eines erkannten Vergehens — macht die Aufgabe zu dessen Strafe (Details am Tool-Schema). */
  offenseRef?: string;
  dryRun?: boolean;
}

export interface EditTaskArgs {
  id: string;
  title?: string;
  description?: string;
  holdUntilAt?: string;
  holdHours?: number;
  isPunishment?: boolean;
  penaltyReason?: string;
  dryRun?: boolean;
}

/** Auflösung eines Gerätenamens über ALLE aktiven Geräte — `resolveDeviceId` sieht per
 *  `getUserDeviceOptions` nur KG-Geräte, und eine Aufgabe fordert gerade die anderen.
 *  `categoryId: null` sucht über alle Kategorien: `request_inspection` darf ein Gerät benennen,
 *  ohne die Kategorie zu kennen — sie ergibt sich daraus (siehe resolveInspectionTarget). */
async function resolveAnyDeviceId(userId: string, categoryId: string | null, name: string): Promise<string> {
  const devices = await prisma.device.findMany({
    where: { userId, archivedAt: null, ...(categoryId ? { categoryId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  const match = matchByNameCI(devices, name);
  if (!match) {
    const scope = categoryId ? " in this category" : "";
    throw new Error(`Device not found${scope}: "${name}". Available: ${devices.map((d) => d.name).join(", ") || "none"}`);
  }
  return match.id;
}

/** „Bis wann halten" aus den erlaubten Formen — `undefined`, wenn keine davon kam.
 *
 *  Getrennt von {@link resolveHoldUntil}, weil die beiden Aufrufer sich genau darin unterscheiden:
 *  `create_task` BRAUCHT eine Frist, `edit_task` lässt sie weg, wenn sie unverändert bleibt. Wer
 *  hier eine dritte Form ergänzt (`holdDays`), ändert eine Stelle — vorher stand die Bedingung
 *  „welche Form kam?" zusätzlich als Ausdruck am `edit_task`-Aufruf und wäre dort still veraltet. */
function parseHoldUntil(args: { holdUntilAt?: string; holdHours?: number }, now: Date): Date | undefined {
  if (args.holdUntilAt) {
    const d = new Date(args.holdUntilAt);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid holdUntilAt: "${args.holdUntilAt}"`);
    return d;
  }
  if (args.holdHours != null) return new Date(now.getTime() + args.holdHours * 3600_000);
  return undefined;
}

/** Dasselbe, aber Pflicht — für `create_task`, wo eine Aufgabe ohne Frist keinen Sinn ergibt. */
function resolveHoldUntil(args: { holdUntilAt?: string; holdHours?: number }, now: Date): Date {
  const d = parseHoldUntil(args, now);
  if (!d) throw new Error("Either holdUntilAt or holdHours is required.");
  return d;
}

/** Bedingungs-Namen → ids. Getrennt vom Commit, damit die dryRun-Vorschau dieselbe Auflösung (und
 *  dieselben Fehlermeldungen bei unbekannten Namen) durchläuft wie der echte Aufruf. */
async function resolveTaskRequirements(userId: string, args: CreateTaskArgs): Promise<TaskRequirementInput[]> {
  const out: TaskRequirementInput[] = [];
  if (args.requireKgLocked) out.push({ type: "KG_LOCKED" });
  for (const r of args.requireWearing ?? []) {
    const categoryId = await resolveCategoryId(userId, r.category);
    out.push({
      type: "WEAR",
      categoryId,
      deviceId: r.device ? await resolveAnyDeviceId(userId, categoryId, r.device) : null,
    });
  }
  return out;
}

export async function mcpCreateTask(username: string, args: CreateTaskArgs) {
  const now = new Date();
  const userId = await resolveTargetUserId(username);
  const holdUntil = resolveHoldUntil(args, now);
  const requirements = await resolveTaskRequirements(userId, args);
  const proofCount = args.requireProof?.length ?? 0;

  if (args.dryRun) {
    // Nur hier: der Commit-Pfad prüft dieselbe Schranke in `punishWithTask` noch einmal, und ein
    // Strafbuch-Aufbau kostet ein Dutzend Abfragen. Die Vorschau braucht sie trotzdem — sonst legt
    // der Agent eine Vorschau vor, die der Commit mit OFFENSE_NOT_FOUND ablehnt.
    const offenseIsLive = args.offenseRef ? !!(await requireDetectedOffense(userId, args.offenseRef, now)) : null;
    // Die tote ref gehört in den `problem`-Slot des Rahmens, nicht in ein Zusatzfeld: `wouldSucceed`
    // leitet sich daraus ab. Sonst meldete die Vorschau Erfolg für einen Commit, der mit
    // OFFENSE_NOT_FOUND endet — und der Agent legt sie seinem Nutzer genau so vor.
    return dryRunPreview("create_task", offenseIsLive === false ? "OFFENSE_NOT_FOUND" : undefined, {
      title: args.title,
      holdUntil: holdUntil.toISOString(),
      requirementCount: requirements.length,
      requiresKgLocked: requirements.some((r) => r.type === "KG_LOCKED"),
      proofCount,
      startGraceMinutes: args.startGraceMinutes ?? null,
      // Die ref ERZWINGT die Strafe — `punishWithTask` setzt `isPunishment: true`, unabhängig vom
      // Argument. Die Vorschau muss dasselbe sagen, sonst zeigt sie `false` und der Commit schreibt `true`.
      isPunishment: !!args.offenseRef || !!args.isPunishment,
      // Beide Angaben, nicht nur die ref: „das Vergehen gilt danach als bestraft" ist die Folge,
      // über die der Agent seinen Nutzer aufklären muss.
      penaltyForOffense: args.offenseRef ?? null,
    });
  }

  const params = {
    userId,
    title: args.title,
    description: args.description,
    holdUntil,
    startGraceMin: args.startGraceMinutes,
    isPunishment: args.isPunishment,
    penaltyReason: args.penaltyReason,
    requirements,
    proofs: args.requireProof,
  };
  const data = unwrap(args.offenseRef
    ? await punishWithTask({ ...params, refId: args.offenseRef, judgedBy: "ai" })
    : await createTask(params));
  const conditionPart = requirements.length === 0
    ? `Task set. No conditions attached — it counts as done when the user reports it done, by ${holdUntil.toISOString()}.`
    : `Task set with ${requirements.length} condition(s). All of them must hold CONTINUOUSLY until ${holdUntil.toISOString()}; taking one off earlier makes the task unfulfilled.`;
  // Der Nachweis-Teil sagt ausdrücklich, was die Automatik NICHT entscheidet: sonst wartet der Agent
  // auf ein Urteil, das ohne ihn nie kommt.
  const proofPart = proofCount === 0 ? "" :
    ` ${proofCount} photo proof(s) required, in the given order — the CAPTURE times must ascend. `
    + `Proofs without a code cannot be decided automatically: the task then waits in "awaitingReview" `
    + `for YOU to accept or reject them.`;
  // Der Strafteil zuerst: er ist das, was der Agent seinem Nutzer schuldet — die Aufgabe ist hier
  // nicht bloss gestellt, sondern ein Urteil über ein Vergehen.
  const penaltyPart = args.offenseRef
    ? `Offense ${args.offenseRef} is now judged as PUNISHED, with this task as the penalty. `
      + `It counts as served once the task is fulfilled; missing it leaves the penalty open AND becomes a new offense. `
    : "";
  return { ok: true, id: data.id, message: penaltyPart + conditionPart + proofPart };
}

export interface ReviewTaskProofArgs {
  taskId: string;
  /** Position des Nachweises (1-basiert, wie in `keyholder_dashboard`/der App gezählt). */
  index: number;
  accepted: boolean;
  note?: string;
  dryRun?: boolean;
}

/**
 * Sichtung eines eingereichten Nachweis-Fotos (Issue #39).
 *
 * Angesprochen über Aufgabe + POSITION, nicht über die Nachweis-id: die id steht nirgends in einer
 * Lese-Sicht, und die Position ist genau das, was der Agent sieht („der zweite Nachweis"). Eine id
 * zu verlangen, die er sich nicht beschaffen kann, wäre ein Werkzeug ohne Eingang.
 */
export async function mcpReviewTaskProof(username: string, args: ReviewTaskProofArgs) {
  const userId = await resolveTargetUserId(username);
  // Adressierung über `resolveTaskProof` — geteilt mit jedem anderen Werkzeug, das einen Nachweis
  // anspricht, damit die versprochene „gleiche Adresse" nicht aus zwei Kopien besteht.
  // Nur was Adressierung und Vorschau brauchen — `imageUrl`, `code` und die Verifikations-Felder
  // liest hier niemand (gleiche Regel wie `TASK_INCLUDE`).
  const { task, proof } = await resolveTaskProof(userId, args.taskId, args.index, {
    id: true, description: true, submittedAt: true, reviewedAt: true,
  });

  if (args.dryRun) {
    // Zustands-Regeln gehen als `problem` in die Vorschau, nicht als Wurf — wie bei jedem anderen
    // Werkzeug hier. Ein dryRun soll sagen, was passieren WÜRDE, auch wenn die Antwort „nichts" ist.
    // Beide Zustands-Regeln, die der Service durchsetzt — sonst verspräche die Vorschau Erfolg, wo
    // der echte Aufruf abweist. `mcpEditTask` prüft `withdrawnAt` aus demselben Grund.
    const problem = task.withdrawnAt ? "TASK_NOT_EDITABLE"
      : !proof.submittedAt ? "TASK_PROOF_NOT_SUBMITTED"
      : undefined;
    return dryRunPreview("review_task_proof", problem, {
      taskId: task.id,
      title: task.title,
      index: args.index,
      description: proof.description,
      accepted: args.accepted,
      previouslyReviewed: proof.reviewedAt !== null,
    });
  }

  // Die Zustands-Prüfung selbst liegt im Service — hier stünde sie ein zweites Mal, mit zweitem Text.

  unwrap(await reviewTaskProof(proof.id, userId, { accepted: args.accepted, note: args.note }));
  return {
    ok: true,
    taskId: task.id,
    message: args.accepted
      ? `Proof ${args.index} accepted. If that was the last open one, the task result was sent to both sides.`
      : `Proof ${args.index} rejected — the task counts as unfulfilled (offense unfulfilled_task). The user was told.`,
  };
}

export async function mcpEditTask(username: string, args: EditTaskArgs) {
  const userId = await resolveTargetUserId(username);
  const task = await prisma.task.findUnique({ where: { id: args.id } });
  if (!task || task.userId !== userId) throw new Error(`Task not found: ${args.id}`);

  const patch = {
    title: args.title,
    description: args.description,
    holdUntil: parseHoldUntil(args, new Date()),
    isPunishment: args.isPunishment,
    penaltyReason: args.penaltyReason,
  };

  if (args.dryRun) {
    // Über dieselbe pure Merge-Funktion wie der Commit — eine eigene Nachrechnung liefe auseinander.
    const before = { title: task.title, description: task.description, holdUntil: task.holdUntil, isPunishment: task.isPunishment, penaltyReason: task.penaltyReason };
    const after = mergeTaskPatch(before, patch);
    const problem = task.withdrawnAt ? "TASK_NOT_EDITABLE" : undefined;
    return dryRunPreview("edit_task", problem, { id: task.id, ...after, holdUntil: after.holdUntil.toISOString() }, diffFields({ ...before }, { ...after }));
  }

  unwrap(await updateTask(args.id, userId, patch));
  return { ok: true, id: args.id, message: "Task updated. The user was notified." };
}
