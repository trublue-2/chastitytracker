import { prisma } from "@/lib/prisma";
import { getUserDeviceOptions, getKeyholderSperrzeiten } from "@/lib/queries";
import { isHiddenFromSub } from "@/lib/delayedTrigger";
import { createVerschlussAnforderung, updateSperrzeitEnde, withdrawVerschlussAnforderung } from "@/lib/verschlussAnforderungService";
import { requestKontrolle, resolveKontrolle } from "@/lib/kontrolleService";
import { createVorgabe, updateVorgabe, deleteVorgabe, listVorgaben } from "@/lib/vorgabeService";
import { setReinigungSettings } from "@/lib/reinigungService";
import { createOrgasmusAnforderung, withdrawOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";
import { judgeOffense } from "@/lib/strafurteilService";
import { matchByNameCI, parseIsoDate, tzOf, makeIso, buildEnvelope, type Envelope } from "@/lib/mcp/common";
import type { ServiceResult } from "@/lib/serviceResult";
import en from "../../messages/en.json";

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
  if (!r.ok) throw new Error(Object.hasOwn(EN_ERRORS, r.error) ? EN_ERRORS[r.error] : r.error);
  return r.data;
}

export interface RequestLockArgs {
  deadlineHours?: number;
  deadlineAt?: string;
  minDurationHours?: number;
  deviceName?: string;
  message?: string;
  /** Delay before the request reaches the user, in minutes (>0). Omit/0 = immediate. */
  delayMinutes?: number;
  /** Absolute send time (ISO 8601). Overrides delayMinutes. */
  scheduledAt?: string;
}
export async function mcpRequestLock(username: string, args: RequestLockArgs) {
  const userId = await resolveTargetUserId(username);
  const deviceId = args.deviceName ? await resolveDeviceId(userId, args.deviceName) : null;
  const data = unwrap(await createVerschlussAnforderung({
    userId,
    art: "ANFORDERUNG",
    nachricht: args.message,
    endetAt: args.deadlineAt,
    fristH: args.deadlineHours,
    dauerH: args.minDurationHours,
    deviceId,
    delayMinutes: args.delayMinutes,
    wirksamAbAt: args.scheduledAt,
  }));
  if (data.scheduledFor) {
    return {
      ok: true,
      id: data.id,
      scheduledFor: data.scheduledFor,
      message: `Lock request scheduled — it will reach the user at ${data.scheduledFor}. The user cannot see it until it triggers.`,
    };
  }
  return { ok: true, id: data.id, scheduledFor: null, message: "Lock request created; the user was notified by e-mail + push." };
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
}
export async function mcpSetLockPeriod(username: string, args: SetLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
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
}
export async function mcpRequestInspection(username: string, args: RequestInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  // Delay-Policy (nur MCP): kein Wert → zufällig 5–65; ≤0 → sofort; sonst auf 5–65 geklemmt.
  let delayMinutes: number;
  if (args.delayMinutes === undefined) {
    delayMinutes = 5 + Math.floor(Math.random() * 61); // 5..65 inkl.
  } else if (args.delayMinutes <= 0) {
    delayMinutes = 0;
  } else {
    delayMinutes = Math.min(65, Math.max(5, Math.round(args.delayMinutes)));
  }

  const data = unwrap(await requestKontrolle({ userId, kommentar: args.comment, deadlineH: args.deadlineHours, delayMinutes }));

  if (data.scheduledFor) {
    return {
      ok: true,
      scheduledFor: data.scheduledFor,
      deadline: data.deadline,
      message: `Inspection scheduled — the code will reach the user in ~${delayMinutes} min (at ${data.scheduledFor}); the deadline then runs to ${data.deadline}. The user cannot see it until it triggers.`,
    };
  }
  return { ok: true, deadline: data.deadline, message: `Inspection requested immediately; the code was e-mailed to the user. Deadline: ${data.deadline}.` };
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
}
export async function mcpRequestOrgasm(username: string, args: RequestOrgasmArgs) {
  const userId = await resolveTargetUserId(username);
  const beginnt = args.beginsAt ? parseIsoDate(args.beginsAt, "beginsAt") : new Date();
  let endet: Date;
  if (args.endsAt) {
    endet = parseIsoDate(args.endsAt, "endsAt");
  } else if (args.windowHours && args.windowHours > 0) {
    endet = new Date(beginnt.getTime() + args.windowHours * 60 * 60 * 1000);
  } else {
    throw new Error("Provide endsAt (ISO date) or windowHours (> 0).");
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
    message: `Orgasm ${kind} set (window ${beginnt.toISOString()} – ${endet.toISOString()}); the user was notified by e-mail + push.`,
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
}


export async function mcpSetTrainingGoal(username: string, args: SetTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  const categoryId = args.category ? await resolveCategoryId(userId, args.category) : null;

  // Default to now; validFrom may be a future date to schedule a goal in advance.
  const gueltigAb = args.validFrom ? parseIsoDate(args.validFrom, "validFrom") : new Date();
  const gueltigBis = args.validUntil ? parseIsoDate(args.validUntil, "validUntil") : null;
  if (gueltigBis && gueltigBis.getTime() <= gueltigAb.getTime()) {
    throw new Error("validUntil must be after validFrom.");
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
  const when = args.validFrom ? `scheduled from ${gueltigAb.toISOString().slice(0, 10)}` : "active now";
  return { ok: true, id: data.id, message: `Training goal set (${when}).` };
}

export interface WithdrawArgs {
  target: "lock_request" | "lock_period" | "inspection" | "orgasm_directive";
}
export async function mcpWithdraw(username: string, args: WithdrawArgs) {
  const userId = await resolveTargetUserId(username);
  let count = 0;
  // `hidden` (Teilmenge von `count`) = davon terminiert und noch nicht ausgelöst. Trifft ein Rückzug
  // sowohl eine laufende als auch eine geplante Direktive, sagt ein blosses `count: 2` nicht, WAS da
  // mitgegangen ist — die Keyholderin muss die geplante bewusst verloren haben können.
  let hidden = 0;
  // `notified` = wusste der Sub von der Direktive? Eine terminierte, noch nicht ausgeloeste ist fuer
  // ihn unsichtbar; sie zu stornieren meldet ihm nichts. Die Antwort darf das nicht anders behaupten.
  let notified = true;
  // Über die Shared-Services zurückziehen → der Nutzer wird konsistent benachrichtigt (wie in der Admin-UI).
  if (args.target === "orgasm_directive") {
    count = unwrap(await withdrawOrgasmusAnforderung(userId)).count;
  } else if (args.target === "lock_request") {
    ({ count, hidden, notified } = unwrap(await withdrawVerschlussAnforderung(userId, "ANFORDERUNG")));
  } else if (args.target === "lock_period") {
    ({ count, hidden, notified } = unwrap(await withdrawVerschlussAnforderung(userId, "SPERRZEIT")));
  } else if (args.target === "inspection") {
    // Jede offene (noch nicht eingereichte) Inspektion per id zurückziehen — auch TERMINIERTE (kein
    // wirksamAb-Gate). resolveKontrolle schweigt bei denen: eine noch nicht ausgelöste Kontrolle ist
    // für den Sub unsichtbar, und bei Auto-Kontrollen wäre die Meldung der Verrat des Zufallsplans.
    const open = await prisma.kontrollAnforderung.findMany({
      where: { userId, entryId: null, withdrawnAt: null },
      select: { id: true },
    });
    notified = false;
    for (const ka of open) {
      if (unwrap(await resolveKontrolle(ka.id, "withdraw")).notified) notified = true;
      else hidden++; // schweigend storniert = der Sub kannte sie nicht (terminiert, nicht ausgelöst)
    }
    count = open.length;
  } else {
    throw new Error(`Unknown withdraw target: ${args.target}`);
  }
  if (count === 0) return { ok: true, withdrawn: 0, hidden: 0, message: `Nothing open to withdraw for ${args.target}.` };
  // Gemischter Treffer (laufend + geplant): beides benennen. Der Rückzug per target ist bewusst ein
  // Rundumschlag — er darf nur nicht so klingen, als hätte er eine einzige Direktive erwischt.
  const mixed = hidden > 0 && hidden < count;
  if (mixed) {
    return {
      ok: true, withdrawn: count, hidden,
      message: `Withdrew ${count} ${args.target}: ${count - hidden} already triggered (the user was notified by e-mail + push) and ${hidden} still SCHEDULED — those they never learned about, and were withdrawn silently.`,
    };
  }
  return {
    ok: true,
    withdrawn: count,
    hidden,
    message: notified
      ? `Withdrew ${count} ${args.target}; the user was notified by e-mail + push.`
      : `Withdrew ${count} ${args.target}. It had not been triggered yet, so the user was NOT notified — they never learned it existed.`,
  };
}

// ── Training goals: list / edit / delete ────────────────────────────────────

/** Loads a training goal and asserts it belongs to `userId` (scopes id-based tools to the target).
 *  Returns the full row so partial-edit callers can backfill omitted fields without a second load. */
async function loadOwnedVorgabe(id: string, userId: string) {
  const v = await prisma.trainingVorgabe.findUnique({ where: { id } });
  if (!v || v.userId !== userId) throw new Error(`Training goal not found: ${id}`);
  return v;
}

export interface TrainingGoalRow {
  id: string;
  category: string;
  status: string;
  validFrom: string;
  validUntil: string | null;
  minPerDayHours: number | null;
  minPerWeekHours: number | null;
  minPerMonthHours: number | null;
  minPerYearHours: number | null;
  note: string | null;
}

export interface ListTrainingGoalsResult extends Envelope {
  ok: true;
  goals: TrainingGoalRow[];
}

export interface ListTrainingGoalsArgs {
  category?: string;
}
export async function mcpListTrainingGoals(username: string, args: ListTrainingGoalsArgs): Promise<ListTrainingGoalsResult> {
  const userId = await resolveTargetUserId(username);
  const filterCatId = args.category ? await resolveCategoryId(userId, args.category) : undefined;
  const timezone = await tzOf(userId);
  const now = new Date();
  const nowMs = now.getTime();
  const goals: TrainingGoalRow[] = (await listVorgaben(userId))
    .filter((g) => filterCatId === undefined || g.categoryId === filterCatId)
    .map((g) => {
      const ab = g.gueltigAb.getTime();
      const bis = g.gueltigBis ? g.gueltigBis.getTime() : null;
      const status = ab > nowMs ? "scheduled" : bis !== null && bis <= nowMs ? "expired" : "active";
      return {
        id: g.id,
        category: g.category?.name ?? "KG",
        status,
        validFrom: g.gueltigAb.toISOString(),
        validUntil: g.gueltigBis ? g.gueltigBis.toISOString() : null,
        minPerDayHours: g.minProTagH,
        minPerWeekHours: g.minProWocheH,
        minPerMonthHours: g.minProMonatH,
        minPerYearHours: g.minProJahrH,
        note: g.notiz,
      };
    });
  return { ok: true, ...buildEnvelope(now, makeIso(timezone), timezone), goals };
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

  unwrap(await updateVorgabe(args.id, {
    categoryId,
    gueltigAb,
    gueltigBis,
    validUntilManual,
    minProTagH: args.minPerDayHours ?? existing.minProTagH,
    minProWocheH: args.minPerWeekHours ?? existing.minProWocheH,
    minProMonatH: args.minPerMonthHours ?? existing.minProMonatH,
    minProJahrH: args.minPerYearHours ?? existing.minProJahrH,
    notiz: args.note ?? existing.notiz,
  }));
  return { ok: true, id: args.id, message: "Training goal updated." };
}

export interface DeleteTrainingGoalArgs {
  id: string;
}
export async function mcpDeleteTrainingGoal(username: string, args: DeleteTrainingGoalArgs) {
  const userId = await resolveTargetUserId(username);
  await loadOwnedVorgabe(args.id, userId);
  unwrap(await deleteVorgabe(args.id));
  return { ok: true, id: args.id, message: "Training goal deleted." };
}

// ── Cleaning (Reinigung) settings ───────────────────────────────────────────

export interface SetCleaningArgs {
  allowed?: boolean;
  maxMinutes?: number;
  maxPerDay?: number;
}
export async function mcpSetCleaning(username: string, args: SetCleaningArgs) {
  const userId = await resolveTargetUserId(username);
  if (args.allowed === undefined && args.maxMinutes === undefined && args.maxPerDay === undefined) {
    throw new Error("Provide at least one of: allowed, maxMinutes, maxPerDay.");
  }
  unwrap(await setReinigungSettings(userId, {
    erlaubt: args.allowed,
    maxMinuten: args.maxMinutes,
    maxProTag: args.maxPerDay,
  }));
  return { ok: true, message: "Cleaning settings updated." };
}

// Hinweis: Es gibt bewusst KEIN mcpSetAutoInspections mehr — die Einstellungen der automatischen
// Kontrollen dürfen über den MCP nicht geändert werden (nur manuelle Kontrollen via request_inspection).
// Die Admin-UI nutzt setAutoKontrolleSettings direkt.

// ── Inspections: verify / reject the latest submission ──────────────────────

export interface ResolveInspectionArgs {
  action: "verify" | "reject";
}
export async function mcpResolveInspection(username: string, args: ResolveInspectionArgs) {
  const userId = await resolveTargetUserId(username);
  const ka = await prisma.kontrollAnforderung.findFirst({
    where: { userId, entryId: { not: null }, withdrawnAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!ka) throw new Error("No submitted inspection to verify or reject.");
  unwrap(await resolveKontrolle(ka.id, args.action === "verify" ? "manuallyVerify" : "reject"));
  return { ok: true, message: `Latest inspection ${args.action === "verify" ? "verified" : "rejected"}; the user was notified by e-mail + push.` };
}

// ── Lock period: change the end of an active Sperrzeit ───────────────────────

export interface EditLockPeriodArgs {
  untilAt?: string;
  indefinite?: boolean;
  /** Die zu ändernde Sperrzeit explizit wählen (id aus `keyholder_dashboard.scheduledDirectives`).
   *  Ohne id gewinnt die AUSGELÖSTE — siehe {@link mcpEditLockPeriod}. */
  id?: string;
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
export async function mcpEditLockPeriod(username: string, args: EditLockPeriodArgs) {
  const userId = await resolveTargetUserId(username);
  if (!args.indefinite && !args.untilAt) throw new Error("Provide untilAt (ISO date) or indefinite=true.");
  const endetAt = args.indefinite ? null : parseIsoDate(args.untilAt!, "untilAt");

  const open = await getKeyholderSperrzeiten(userId); // aktive UND geplante, neueste zuerst
  if (open.length === 0) throw new Error("No open lock period to edit.");

  const target = args.id
    ? open.find((s) => s.id === args.id)
    : open.find((s) => !isHiddenFromSub(s)) ?? open[0];
  if (!target) throw new Error(`No open lock period with id ${args.id} (it may be withdrawn, ended, or belong to someone else).`);

  const { notified } = unwrap(await updateSperrzeitEnde(target.id, endetAt));
  const what = args.indefinite ? "Lock period set to indefinite." : `Lock period end changed to ${endetAt!.toISOString()}.`;
  const untouched = open.filter((s) => s.id !== target.id).map((s) => ({
    id: s.id,
    status: isHiddenFromSub(s) ? ("scheduled" as const) : ("triggered" as const),
    scheduledFor: s.wirksamAb?.toISOString() ?? null,
    endsAt: s.endetAt?.toISOString() ?? null,
  }));
  const ambiguity = untouched.length === 0 ? ""
    : ` NOTE: ${open.length} lock periods are open — edited the ${isHiddenFromSub(target) ? "SCHEDULED" : "triggered"} one; the others are listed under "untouched". Pass id=… to edit one of those instead.`;
  return {
    ok: true,
    id: target.id,
    untouched,
    message: (notified
      ? `${what} The user was notified by e-mail + push.`
      : `${what} It is still SCHEDULED (not triggered yet), so the user was NOT notified — they will learn the new end when it triggers.`) + ambiguity,
  };
}

// ── Urteil über ein erkanntes Vergehen (Strafbuch-Loop) ─────────────────────

export interface JudgeOffenseArgs {
  /** Vergehens-ref aus get_offenses (das Feld `ref.id`). */
  ref: string;
  action: "dismiss" | "punish" | "complete" | "reopen";
  /** Freitext: die Strafe (bei punish, erforderlich — z.B. „20 Schläge") bzw. ein Grund (bei dismiss). */
  text?: string;
}
export async function mcpJudgeOffense(username: string, args: JudgeOffenseArgs) {
  const userId = await resolveTargetUserId(username);
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
