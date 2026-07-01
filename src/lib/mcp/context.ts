import { prisma } from "@/lib/prisma";
import { resolveUserId, iso, parseIsoDate } from "@/lib/mcp/common";
import { diffFields, type WriteDef } from "@/lib/mcp/writeFramework";
import { autoKontrolleSettingsFromUser } from "@/lib/autoKontrolleService";
import { reinigungVerbrauchtHeute, buildReinigungView, type ReinigungView } from "@/lib/reinigungService";

/** Kontext & Kalender (§8) — wiederkehrender Wochen-Kontext, Einzeltermine, HealthHold. Damit der
 *  Keyholder Anker/Kontrollen ums echte Leben plant. MCP-only, additiv. */

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export interface HealthHoldView {
  id: string;
  active: boolean;
  reason: string;
  since: string;
}

/** Aktiver HealthHold des Users (oder null) — auch vom Dashboard genutzt. */
export async function loadActiveHealthHold(userId: string): Promise<HealthHoldView | null> {
  const h = await prisma.healthHold.findFirst({ where: { userId, active: true }, orderBy: { createdAt: "desc" } });
  return h ? { id: h.id, active: true, reason: h.reason, since: iso(h.createdAt)! } : null;
}

export interface ContextResult {
  schemaVersion: 2;
  user: string;
  healthHold: HealthHoldView | null;
  /** Einstellungen der AUTOMATISCHEN Kontrollen (read-only; über den MCP nicht änderbar — Kontrollen
   *  werden manuell via request_inspection veranlasst). active=false → keine Auto-Kontrollen. perDay =
   *  selbsttätig verteilte Kontrollen pro Tag; sleepFrom–sleepUntil = Schlaf-Fenster (Frist nie darin);
   *  deadlineMinFrom–deadlineMinTo = zufällige Erfüllungsdauer-Spanne in Minuten. */
  autoInspections: { active: boolean; perDay: number; sleepFrom: string; sleepUntil: string; deadlineMinFrom: number; deadlineMinTo: number };
  /** Reinigungs-(Cleaning-)Regeln (gleiche Sicht wie die frühere get_overview.reinigung). */
  cleaning: ReinigungView;
  recurringContext: { id: string; label: string; weekday: number; weekdayLabel: string; deviceFree: boolean; note: string | null }[];
  appointments: { id: string; when: string; typ: string | null; deviceFree: boolean; note: string | null }[];
}

const contextUserSelect = {
  id: true,
  reinigungErlaubt: true, reinigungMaxMinuten: true, reinigungMaxProTag: true, reinigungsFenster: true,
  autoKontrolleAktiv: true, autoKontrolleProTag: true, autoKontrolleRuheVon: true, autoKontrolleRuheBis: true,
  autoKontrolleFristVon: true, autoKontrolleFristBis: true,
} as const;

/** Liefert HealthHold + Auto-Kontroll-Einstellungen + Reinigungs-Regeln + Wochen-Kontext + anstehende
 *  Termine (ab jetzt). Throws bei unbekanntem User. */
export async function getContext(username: string): Promise<ContextResult> {
  const now = new Date();
  // id + Config-Felder in EINER Abfrage per username (wie loadUserContext in mcpOverview.ts) — keine
  // separate resolveUserId-Runde.
  const user = await prisma.user.findUnique({ where: { username }, select: contextUserSelect });
  if (!user) throw new Error(`User not found: ${username}`);
  const userId = user.id;

  const [healthHold, recurring, appts, cleaningUsedToday] = await Promise.all([
    loadActiveHealthHold(userId),
    prisma.recurringContext.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { label: "asc" }] }),
    prisma.appointment.findMany({ where: { userId, when: { gte: now } }, orderBy: { when: "asc" } }),
    reinigungVerbrauchtHeute(userId, now),
  ]);

  // Auto-Kontroll-Einstellungen + Reinigung über DIESELBEN Helfer wie get_overview/mcpOverview.ts.
  const auto = autoKontrolleSettingsFromUser(user);

  return {
    schemaVersion: 2,
    user: username,
    healthHold,
    autoInspections: {
      active: auto.aktiv,
      perDay: auto.proTag,
      sleepFrom: auto.ruheVon,
      sleepUntil: auto.ruheBis,
      deadlineMinFrom: auto.fristVon,
      deadlineMinTo: auto.fristBis,
    },
    cleaning: buildReinigungView(user, cleaningUsedToday, now),
    recurringContext: recurring.map((r) => ({ id: r.id, label: r.label, weekday: r.weekday, weekdayLabel: WEEKDAYS[r.weekday] ?? "?", deviceFree: r.deviceFree, note: r.note })),
    appointments: appts.map((a) => ({ id: a.id, when: iso(a.when)!, typ: a.typ, deviceFree: a.deviceFree, note: a.note })),
  };
}

// ── Write: set_health_hold ──────────────────────────────────────────────────

export interface SetHealthHoldArgs {
  active: boolean;
  reason?: string;
}

export const setHealthHoldDef: WriteDef<SetHealthHoldArgs, HealthHoldView | null> = {
  tool: "set_health_hold",
  validate(args) {
    if (args.active && !args.reason?.trim()) throw new Error("Activating a health hold requires a reason.");
    return args;
  },
  async preview(ctx, args) {
    const current = await loadActiveHealthHold(ctx.targetUserId);
    return { current, willBe: args.active ? { active: true, reason: args.reason } : { active: false } };
  },
  async apply(tx, ctx, args) {
    // "Höchstens ein aktiver Hold pro User" — Invariante NUR hier im Code erzwungen (kein Partial-
    // Unique-Constraint im Schema). Da jede Mutation durch dieses def + die Framework-Transaktion
    // läuft, ist das resolve-all-then-create-one atomar und ausreichend.
    await tx.healthHold.updateMany({ where: { userId: ctx.targetUserId, active: true }, data: { active: false, resolvedAt: new Date() } });
    if (!args.active) {
      return { newState: null, diff: { active: [true, false] } };
    }
    const created = await tx.healthHold.create({ data: { userId: ctx.targetUserId, active: true, reason: args.reason! } });
    return { newState: { id: created.id, active: true, reason: created.reason, since: iso(created.createdAt)! }, resultRef: created.id, diff: { active: [false, true] } };
  },
};

// ── Write: upsert_appointment ────────────────────────────────────────────────

export interface UpsertAppointmentArgs {
  id?: string;
  when?: string;
  typ?: string | null;
  deviceFree?: boolean;
  note?: string | null;
}

const apptView = (a: { id: string; when: Date; typ: string | null; deviceFree: boolean; note: string | null }) =>
  ({ id: a.id, when: iso(a.when)!, typ: a.typ, deviceFree: a.deviceFree, note: a.note });

export const upsertAppointmentDef: WriteDef<UpsertAppointmentArgs, ReturnType<typeof apptView>> = {
  tool: "upsert_appointment",
  validate(args) {
    if (!args.id && !args.when) throw new Error("A new appointment requires `when` (ISO 8601).");
    return args;
  },
  async preview(ctx, args) {
    if (args.id) {
      const existing = await prisma.appointment.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`Appointment not found: ${args.id}`);
      return { action: "edit", before: apptView(existing) };
    }
    return { action: "create", when: args.when };
  },
  async apply(tx, ctx, args) {
    const when = parseIsoDate(args.when, "when");
    if (args.id) {
      const existing = await tx.appointment.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`Appointment not found: ${args.id}`);
      const updated = await tx.appointment.update({
        where: { id: args.id },
        data: {
          ...(when !== undefined ? { when } : {}),
          ...(args.typ !== undefined ? { typ: args.typ } : {}),
          ...(args.deviceFree !== undefined ? { deviceFree: args.deviceFree } : {}),
          ...(args.note !== undefined ? { note: args.note } : {}),
        },
      });
      return { newState: apptView(updated), resultRef: updated.id, diff: diffFields(apptView(existing), apptView(updated)) };
    }
    const created = await tx.appointment.create({
      data: { userId: ctx.targetUserId, when: when!, typ: args.typ ?? null, deviceFree: args.deviceFree ?? false, note: args.note ?? null },
    });
    return { newState: apptView(created), resultRef: created.id };
  },
};

// ── Write: upsert_recurring_context ──────────────────────────────────────────

export interface UpsertRecurringContextArgs {
  id?: string;
  label?: string;
  weekday?: number;
  deviceFree?: boolean;
  note?: string | null;
}

const recurringView = (r: { id: string; label: string; weekday: number; deviceFree: boolean; note: string | null }) =>
  ({ id: r.id, label: r.label, weekday: r.weekday, weekdayLabel: WEEKDAYS[r.weekday] ?? "?", deviceFree: r.deviceFree, note: r.note });

export const upsertRecurringContextDef: WriteDef<UpsertRecurringContextArgs, ReturnType<typeof recurringView>> = {
  tool: "upsert_recurring_context",
  validate(args) {
    if (args.weekday != null && (args.weekday < 0 || args.weekday > 6)) throw new Error("weekday must be 0 (So) .. 6 (Sa).");
    if (!args.id && (!args.label?.trim() || args.weekday == null)) throw new Error("A new recurring context requires label + weekday.");
    return args;
  },
  async preview(ctx, args) {
    if (args.id) {
      const existing = await prisma.recurringContext.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`RecurringContext not found: ${args.id}`);
      return { action: "edit", before: recurringView(existing) };
    }
    return { action: "create", label: args.label, weekday: args.weekday };
  },
  async apply(tx, ctx, args) {
    if (args.id) {
      const existing = await tx.recurringContext.findFirst({ where: { id: args.id, userId: ctx.targetUserId } });
      if (!existing) throw new Error(`RecurringContext not found: ${args.id}`);
      const updated = await tx.recurringContext.update({
        where: { id: args.id },
        data: {
          ...(args.label != null ? { label: args.label } : {}),
          ...(args.weekday != null ? { weekday: args.weekday } : {}),
          ...(args.deviceFree !== undefined ? { deviceFree: args.deviceFree } : {}),
          ...(args.note !== undefined ? { note: args.note } : {}),
        },
      });
      return { newState: recurringView(updated), resultRef: updated.id, diff: diffFields(recurringView(existing), recurringView(updated)) };
    }
    const created = await tx.recurringContext.create({
      data: { userId: ctx.targetUserId, label: args.label!, weekday: args.weekday!, deviceFree: args.deviceFree ?? false, note: args.note ?? null },
    });
    return { newState: recurringView(created), resultRef: created.id };
  },
};
