import { prisma } from "@/lib/prisma";
import { iso, makeIso, buildEnvelope, tzOf, APP_TZ, parseIsoDate, type Envelope, type Iso } from "@/lib/mcp/common";
import { assertVersionRequiresId, diffFields, occEdit, type WriteDef } from "@/lib/mcp/writeFramework";
import { autoKontrolleSettingsFromUser } from "@/lib/autoKontrolleService";
import { reinigungVerbrauchtHeute, buildReinigungView, type ReinigungView } from "@/lib/reinigungService";
import { getActiveSperrzeit, cleaningWindowBindingStatus, type WindowsBindingReason } from "@/lib/queries";

/** Kontext & Kalender (explain_model §13) — wiederkehrender Wochen-Kontext, Einzeltermine,
 *  HealthHold. Damit der Keyholder Anker/Kontrollen ums echte Leben plant. MCP-only, additiv. */

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** null = jede Woche, 1..5 = "1./2./…​/5. <weekday> im Monat", -1 = "letzter <weekday> im Monat". */
function ordinalLabel(ordinal: number | null): string | null {
  if (ordinal == null) return null;
  return ordinal === -1 ? "letzter" : `${ordinal}.`;
}

export interface HealthHoldView {
  id: string;
  active: boolean;
  reason: string;
  since: string;
}

/** Aktiver HealthHold des Users (oder null) — auch vom Dashboard genutzt. `isoFn` formatiert in der
 *  Sub-Zeitzone; ohne Wert der APP_TZ-Default (byte-identisch zum bisherigen Verhalten). */
export async function loadActiveHealthHold(userId: string, isoFn: Iso = iso): Promise<HealthHoldView | null> {
  const h = await prisma.healthHold.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "desc" } });
  return h ? { id: h.id, active: true, reason: h.reason, since: isoFn(h.createdAt)! } : null;
}

/** MCP-Erweiterung der geteilten `ReinigungView` (auch von `src/app/dashboard/page.tsx` genutzt) um
 *  die drei A-02-Felder. Bewusst NICHT Teil von `ReinigungView` selbst: die binden nur im
 *  Sperrzeit-Kontext, den nur der MCP-Layer hier ohnehin schon lädt — dieselbe Erweiterungs-Technik
 *  wie `BoxReinigungView` in `src/lib/boxStatus.ts`. */
export type ContextReinigungView = ReinigungView & {
  windowsBinding: boolean;
  windowsBindingReason: WindowsBindingReason;
  openingAllowedNow: boolean;
};

export interface ContextResult extends Envelope {
  schemaVersion: 2;
  user: string;
  healthHold: HealthHoldView | null;
  /** Einstellungen der AUTOMATISCHEN Kontrollen (read-only; über den MCP nicht änderbar — Kontrollen
   *  werden manuell via request_inspection veranlasst). active=false → keine Auto-Kontrollen. Pro Tag
   *  wird eine ZUFÄLLIGE Anzahl aus [perDayMin, perDayMax] selbsttätig über den Tag verteilt
   *  (perDayMin==perDayMax ⇒ fixe Anzahl); sleepFrom–sleepUntil = Schlaf-Fenster (Frist nie darin);
   *  deadlineMinFrom–deadlineMinTo = zufällige Erfüllungsdauer-Spanne in Minuten. triggerWindowFrom/Until
   *  = optionales festes Auslöse-Fenster ("" = aus; dann verteilen sich die Auslösungen übers Wach-Fenster). */
  autoInspections: { active: boolean; perDayMin: number; perDayMax: number; sleepFrom: string; sleepUntil: string; deadlineMinFrom: number; deadlineMinTo: number; triggerWindowFrom: string; triggerWindowUntil: string };
  /** Reinigungs-(Cleaning-)Regeln (gleiche Sicht wie die frühere get_overview.reinigung), plus
   *  windowsBinding/windowsBindingReason/openingAllowedNow (A-02). */
  cleaning: ContextReinigungView;
  recurringContext: ReturnType<typeof recurringView>[];
  appointments: ReturnType<typeof apptView>[];
}

const contextUserSelect = {
  id: true, timezone: true,
  reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true,
  autoKontrolleAktiv: true, autoKontrollePerDayMin: true, autoKontrollePerDayMax: true, autoKontrolleRuheVon: true, autoKontrolleRuheBis: true,
  autoKontrolleFristVon: true, autoKontrolleFristBis: true, autoKontrolleFensterVon: true, autoKontrolleFensterBis: true,
} as const;

/** Liefert HealthHold + Auto-Kontroll-Einstellungen + Reinigungs-Regeln + Wochen-Kontext + anstehende
 *  Termine (ab jetzt). Throws bei unbekanntem User. */
export async function getContext(username: string): Promise<ContextResult> {
  const now = new Date();
  // id + Config-Felder in EINER Abfrage per username — keine
  // separate resolveUserId-Runde.
  const user = await prisma.user.findUnique({ where: { username }, select: contextUserSelect });
  if (!user) throw new Error(`User not found: ${username}`);
  const userId = user.id;
  const iso = makeIso(user.timezone ?? APP_TZ);

  const [healthHold, recurring, appts, cleaningUsedToday, sperre] = await Promise.all([
    loadActiveHealthHold(userId, iso),
    prisma.recurringContext.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { label: "asc" }] }),
    prisma.appointment.findMany({ where: { userId, when: { gte: now } }, orderBy: { when: "asc" } }),
    reinigungVerbrauchtHeute(userId, now, user.timezone ?? APP_TZ),
    getActiveSperrzeit(userId),
  ]);

  // Auto-Kontroll-Einstellungen + Reinigung über die geteilten Helfer der jeweiligen Services.
  const auto = autoKontrolleSettingsFromUser(user);
  const binding = cleaningWindowBindingStatus(
    { reinigungErlaubt: user.reinigungErlaubt ?? false, reinigungsFenster: user.reinigungsFenster, timezone: user.timezone ?? APP_TZ },
    sperre,
    now,
  );

  return {
    schemaVersion: 2,
    user: username,
    ...buildEnvelope(now, iso, user.timezone ?? APP_TZ),
    healthHold,
    autoInspections: {
      active: auto.aktiv,
      perDayMin: auto.perDayMin,
      perDayMax: auto.perDayMax,
      sleepFrom: auto.ruheVon,
      sleepUntil: auto.ruheBis,
      deadlineMinFrom: auto.fristVon,
      deadlineMinTo: auto.fristBis,
      triggerWindowFrom: auto.fensterVon,
      triggerWindowUntil: auto.fensterBis,
    },
    cleaning: { ...buildReinigungView(user, cleaningUsedToday, now, user.timezone ?? APP_TZ), ...binding },
    recurringContext: recurring.map(recurringView),
    appointments: appts.map((a) => apptView(a, iso)),
  };
}

// ── Write: set_health_hold ──────────────────────────────────────────────────

export interface SetHealthHoldArgs {
  active: boolean;
  // NICHT `reason` nennen: runV2Write destrukturiert `reason` bereits als PFLICHT-Audit-Feld aus den
  // rohen Tool-Args (siehe route.ts runV2Write) — ein gleichnamiges Domain-Feld würde dort verschluckt
  // und käme hier immer als undefined an ("requires a reason" trotz Angabe). Daher healthReason.
  healthReason?: string;
}

/** Nachher-Zustand eines HealthHold-Writes ({active, reason}) — geteilt von preview + apply für
 *  denselben Diff (N-15). */
const healthHoldAfter = (args: SetHealthHoldArgs): { active: boolean; reason: string | null } =>
  args.active ? { active: true, reason: args.healthReason ?? null } : { active: false, reason: null };

export const setHealthHoldDef: WriteDef<SetHealthHoldArgs, HealthHoldView | null> = {
  tool: "set_health_hold",
  validate(args) {
    if (args.active && !args.healthReason?.trim()) throw new Error("Activating a health hold requires a reason.");
    return args;
  },
  async preview(ctx, args) {
    const current = await loadActiveHealthHold(ctx.targetUserId, makeIso(await tzOf(ctx.targetUserId)));
    const before = { active: current != null, reason: current?.reason ?? null };
    const after = healthHoldAfter(args);
    return { preview: { current, willBe: after }, before, after };
  },
  async apply(tx, ctx, args) {
    // "Höchstens ein aktiver Hold pro User" — Invariante NUR hier im Code erzwungen (kein Partial-
    // Unique-Constraint im Schema). Da jede Mutation durch dieses def + die Framework-Transaktion
    // läuft, ist das resolve-all-then-create-one atomar und ausreichend.
    // Vorher-Zustand VOR dem Deaktivieren lesen — für denselben Diff wie die Vorschau (N-15).
    const activeBefore = await tx.healthHold.findFirst({ where: { userId: ctx.targetUserId, active: true }, select: { reason: true } });
    const before = { active: activeBefore != null, reason: activeBefore?.reason ?? null };
    const after = healthHoldAfter(args);
    const diff = diffFields(before, after);
    await tx.healthHold.updateMany({ where: { userId: ctx.targetUserId, active: true }, data: { active: false, resolvedAt: new Date() } });
    if (!args.active) {
      return { newState: null, diff };
    }
    const created = await tx.healthHold.create({ data: { userId: ctx.targetUserId, active: true, reason: args.healthReason! } });
    const iso = makeIso(await tzOf(ctx.targetUserId, tx));
    return { newState: { id: created.id, active: true, reason: created.reason, since: iso(created.createdAt)! }, resultRef: created.id, diff };
  },
};

// ── Write: upsert_appointment ────────────────────────────────────────────────

export interface UpsertAppointmentArgs {
  id?: string;
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
  when?: string;
  typ?: string | null;
  deviceFree?: boolean;
  note?: string | null;
}

const apptView = (a: { id: string; when: Date; typ: string | null; deviceFree: boolean; note: string | null; version: number }, isoFn: Iso) =>
  ({ id: a.id, when: isoFn(a.when)!, typ: a.typ, deviceFree: a.deviceFree, note: a.note, version: a.version });

/** Feld-Merge eines Termin-Edits — geteilt von preview (after) und apply (DB-Update), damit die
 *  Vorschau strukturell denselben Diff zeigt wie der Commit (N-15). */
const apptData = (args: UpsertAppointmentArgs, when: Date | undefined) => ({
  ...(when !== undefined ? { when } : {}),
  ...(args.typ !== undefined ? { typ: args.typ } : {}),
  ...(args.deviceFree !== undefined ? { deviceFree: args.deviceFree } : {}),
  ...(args.note !== undefined ? { note: args.note } : {}),
});

export const upsertAppointmentDef: WriteDef<UpsertAppointmentArgs, ReturnType<typeof apptView>> = {
  tool: "upsert_appointment",
  validate(args) {
    if (!args.id && !args.when) throw new Error("A new appointment requires `when` (ISO 8601).");
    assertVersionRequiresId(args);
    return args;
  },
  async preview(ctx, args) {
    if (args.id) {
      const [existing, tz] = await Promise.all([
        prisma.appointment.findFirst({ where: { id: args.id, userId: ctx.targetUserId } }),
        tzOf(ctx.targetUserId),
      ]);
      if (!existing) throw new Error(`Appointment not found: ${args.id}`);
      // Check-only: Versions-Konflikt schon im dryRun sichtbar machen.
      occEdit(args.expectedVersion, existing.version, `appointment ${args.id}`);
      const iso = makeIso(tz);
      const before = apptView(existing, iso);
      const after = apptView({ ...existing, ...apptData(args, parseIsoDate(args.when, "when")) }, iso);
      return { preview: { action: "edit", before }, before, after };
    }
    return { preview: { action: "create", when: args.when } };
  },
  async apply(tx, ctx, args) {
    const when = parseIsoDate(args.when, "when");
    const iso = makeIso(await tzOf(ctx.targetUserId, tx));
    if (args.id) {
      const existing = await tx.appointment.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`Appointment not found: ${args.id}`);
      const bump = occEdit(args.expectedVersion, existing.version, `appointment ${args.id}`);
      const data = apptData(args, when);
      // No-op-Edit: nicht schreiben, Version nicht bumpen (würde fremde expectedVersion invalidieren).
      const updated = Object.keys(data).length
        ? await tx.appointment.update({ where: { id: args.id }, data: { ...bump, ...data } })
        : existing;
      return { newState: apptView(updated, iso), resultRef: updated.id, diff: diffFields(apptView(existing, iso), apptView(updated, iso)) };
    }
    const created = await tx.appointment.create({
      data: { userId: ctx.targetUserId, when: when!, typ: args.typ ?? null, deviceFree: args.deviceFree ?? false, note: args.note ?? null },
    });
    return { newState: apptView(created, iso), resultRef: created.id };
  },
};

// ── Write: upsert_recurring_context ──────────────────────────────────────────

const ORDINAL_VALUES: readonly number[] = [-1, 1, 2, 3, 4, 5];

export interface UpsertRecurringContextArgs {
  id?: string;
  /** OCC-Token — siehe occEdit (writeFramework). */
  expectedVersion?: number;
  label?: string;
  weekday?: number;
  /** null = jede Woche, 1..5 = n-ter <weekday> im Monat, -1 = letzter <weekday> im Monat. */
  ordinal?: number | null;
  deviceFree?: boolean;
  note?: string | null;
}

const recurringView = (r: { id: string; label: string; weekday: number; ordinal: number | null; deviceFree: boolean; note: string | null; version: number }) =>
  ({ id: r.id, label: r.label, weekday: r.weekday, weekdayLabel: WEEKDAYS[r.weekday] ?? "?", ordinal: r.ordinal, ordinalLabel: ordinalLabel(r.ordinal), deviceFree: r.deviceFree, note: r.note, version: r.version });

/** Feld-Merge eines Recurring-Context-Edits — geteilt von preview + apply (N-15). */
const recurringData = (args: UpsertRecurringContextArgs) => ({
  ...(args.label != null ? { label: args.label } : {}),
  ...(args.weekday != null ? { weekday: args.weekday } : {}),
  ...(args.ordinal !== undefined ? { ordinal: args.ordinal } : {}),
  ...(args.deviceFree !== undefined ? { deviceFree: args.deviceFree } : {}),
  ...(args.note !== undefined ? { note: args.note } : {}),
});

export const upsertRecurringContextDef: WriteDef<UpsertRecurringContextArgs, ReturnType<typeof recurringView>> = {
  tool: "upsert_recurring_context",
  validate(args) {
    if (args.weekday != null && (args.weekday < 0 || args.weekday > 6)) throw new Error("weekday must be 0 (So) .. 6 (Sa).");
    if (args.ordinal != null && !ORDINAL_VALUES.includes(args.ordinal)) {
      throw new Error("ordinal must be -1 (letzter) or 1..5 (n-ter).");
    }
    if (!args.id && (!args.label?.trim() || args.weekday == null)) throw new Error("A new recurring context requires label + weekday.");
    assertVersionRequiresId(args);
    return args;
  },
  async preview(ctx, args) {
    if (args.id) {
      const existing = await prisma.recurringContext.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`RecurringContext not found: ${args.id}`);
      // Check-only: Versions-Konflikt schon im dryRun sichtbar machen.
      occEdit(args.expectedVersion, existing.version, `recurringContext ${args.id}`);
      const before = recurringView(existing);
      const after = recurringView({ ...existing, ...recurringData(args) });
      return { preview: { action: "edit", before }, before, after };
    }
    return { preview: { action: "create", label: args.label, weekday: args.weekday } };
  },
  async apply(tx, ctx, args) {
    if (args.id) {
      const existing = await tx.recurringContext.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`RecurringContext not found: ${args.id}`);
      const bump = occEdit(args.expectedVersion, existing.version, `recurringContext ${args.id}`);
      const data = recurringData(args);
      // No-op-Edit: nicht schreiben, Version nicht bumpen (würde fremde expectedVersion invalidieren).
      const updated = Object.keys(data).length
        ? await tx.recurringContext.update({ where: { id: args.id }, data: { ...bump, ...data } })
        : existing;
      return { newState: recurringView(updated), resultRef: updated.id, diff: diffFields(recurringView(existing), recurringView(updated)) };
    }
    const created = await tx.recurringContext.create({
      data: { userId: ctx.targetUserId, label: args.label!, weekday: args.weekday!, ordinal: args.ordinal ?? null, deviceFree: args.deviceFree ?? false, note: args.note ?? null },
    });
    return { newState: recurringView(created), resultRef: created.id };
  },
};
