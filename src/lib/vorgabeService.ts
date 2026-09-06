import { prisma } from "@/lib/prisma";
import { midnightOfLocalDate, APP_TZ } from "@/lib/utils";
import { getUserTimezone } from "@/lib/queries";
import { reorderVorgabenDates } from "@/lib/vorgaben";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { resolveOwnedCategory } from "@/lib/deviceCategoryService";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import {
  parseWeekdayGoalRules, weekdayGoalRulesProblem, weekdayGoalRuleTooHigh, weekdayGoalRulesHaveTarget,
  type WeekdayGoalRule,
} from "@/lib/weekdayGoal";

export interface CreateVorgabeParams {
  userId: string;
  categoryId?: string | null;
  gueltigAb: string | Date;
  gueltigBis?: string | Date | null;
  // Optional: ob `gueltigBis` bewusst gesetzt ist (schützt vor Auto-Verkettung). Fehlt der Wert,
  // gilt jedes gesetzte Enddatum als manuell (`!!gueltigBis`) — korrekt für Create und MCP. Nur
  // das Admin-Edit-Formular übergibt ihn explizit, um vorbefüllte (abgeleitete) Enden nicht
  // versehentlich als manuell einzufrieren.
  validUntilManual?: boolean;
  minProTagH?: number | null;
  minProWocheH?: number | null;
  minProMonatH?: number | null;
  minProJahrH?: number | null;
  /** Wochentag-Ausnahmen des Tages-Solls, roh von aussen (Formular-Array oder MCP-Argumente): wird
   *  geprüft/normalisiert und als JSON-String abgelegt — dieselbe „roh herein, String heraus"-
   *  Aufteilung wie `SetAutoKontrolleParams.dayRules`. `undefined`/`null`/`[]` = keine Ausnahme. */
  minProTagWochentage?: unknown;
  notiz?: string | null;
}

/**
 * Ein Datum aus einem Formular- oder MCP-Feld zu einem Instant — ein reines Kalenderdatum
 * (`YYYY-MM-DD`) als Mitternacht in der Zeitzone DES SUBS, alles andere unverändert.
 *
 * **Warum das hier steht und nicht beim Aufrufer:** `<input type="date">` liefert `"2026-08-23"`,
 * und `new Date("2026-08-23")` liest das nach ISO-8601 als UTC-Mitternacht — in Zürich also
 * 02:00 Ortszeit. Ein über die Oberfläche auf „heute" gesetztes Ziel begann damit MITTEN im Tag und
 * löste die Regeln für geteilte Perioden aus (`goalFulfillment.ts`), obwohl niemand einen Start
 * mitten am Tag gemeint hatte. Ein Parsing-Artefakt, kein Wunsch.
 *
 * Ein Wert MIT Uhrzeit bleibt unangetastet: der ausdrückliche Start mitten in der Periode ist
 * erlaubt, und genau für ihn gibt es die Regeln 2 und 3.
 *
 * Exportiert, weil der MCP seine Datums-Argumente selbst zu `Date` parst, bevor der Service sie
 * sieht (`parseIsoDate` prüft dort das ISO-Format aller Werkzeuge). Ohne dieselbe Regel auf beiden
 * Wegen läge `2026-06-12` je nach Schreibweg zwei Stunden auseinander.
 */
export function goalDateFromInput(value: string | Date, tz: string): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!dateOnly) return new Date(value);
  return midnightOfLocalDate(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3], tz);
}

/** Die Zeitzone des Subs — aber nur, wenn ein Datum als STRING kommt und die Kalenderdatum-Regel
 *  überhaupt greifen kann. Fertige `Date`-Werte (der MCP parst selbst) brauchen sie nicht, und ein
 *  Ziel-Write soll dafür keine Abfrage ausgeben. */
async function tzForDates(userId: string, ...values: (string | Date | null | undefined)[]): Promise<string> {
  return values.some((v) => typeof v === "string") ? getUserTimezone(userId) : APP_TZ;
}

/** Validates that a category exists, belongs to `userId`, and allows Vorgaben.
 *  Returns an error ServiceResult on failure, or null when valid / no category given.
 *  Existenz + Besitz kommen aus `resolveOwnedCategory` (geteilt mit den Geräte-Routen); nur die
 *  `allowVorgaben`-Regel unten ist eine Vorgaben-Regel und bleibt hier. */
async function validateVorgabeCategory(
  categoryId: string | null | undefined,
  userId: string,
): Promise<ServiceResult<never> | null> {
  const owned = await resolveOwnedCategory(categoryId, userId);
  if (!owned.ok) return owned;
  // Built-in (KG) always allows vorgaben; user-defined respects the toggle.
  if (owned.data && !owned.data.isBuiltIn && !owned.data.allowVorgaben) {
    return serviceFail(400, "CATEGORY_DISALLOWS_GOALS");
  }
  return null;
}

/** Loads a live (non soft-deleted) TrainingVorgabe row by id, or null. THE shared existence
 *  definition (B-04, MCP-Befundliste 2026-07-17): used by updateVorgabe/deleteVorgabe below and by
 *  loadOwnedVorgabe in mcpWrite.ts — a soft-deleted goal counts as "not found" everywhere, not just
 *  by convention across separately-written queries. */
export async function findActiveVorgabe(id: string) {
  return prisma.trainingVorgabe.findFirst({ where: { id, deletedAt: null } });
}

/** At least one of the four period targets must be set. Exported for MCP dryRun previews
 *  (mcpWrite.ts) — the same check the real create/update path runs, not restated there.
 *  Eine Wochentag-Ausnahme > 0 zählt ebenfalls als Ziel: ein „nur am Wochenende"-Ziel ohne
 *  Basis-Tageswert ist gültig. Ein reiner Ruhetag (`hours: 0`) zählt nicht. */
export function hasPeriodTarget(p: {
  minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null;
  minProTagWochentage?: readonly WeekdayGoalRule[] | null;
}): boolean {
  return !!(p.minProTagH || p.minProWocheH || p.minProMonatH || p.minProJahrH)
    || weekdayGoalRulesHaveTarget(p.minProTagWochentage ?? []);
}

/** Physikalische Obergrenze je Periode (Stunden der längsten Periodeninstanz — 31-Tage-Monat,
 *  366-Tage-Schaltjahr). */
const PERIOD_HOUR_CAP = { tag: 24, woche: 168, monat: 744, jahr: 8784 } as const;

/**
 * Plausibilitätsschranken für Trainingsziel-Stundenwerte (B-02, MCP-Befundliste 2026-07-17): ohne
 * sie akzeptierte der Tracker z.B. 25 Std/Tag oder 500 Std/Woche unkommentiert — beides schlägt
 * direkt in `goals.*.todayPct` durch und damit in die Adhärenz-Argumentation gegenüber dem Sub.
 *
 * Geprüft wird NUR die absolute Obergrenze jeder Periode (eine Woche hat nie mehr als 168 Stunden).
 * Eine Quer-Konsistenz „Wochenziel ≤ 7×Tagesziel" gibt es bewusst NICHT: das Tagesziel ist ein
 * MINDESTwert (Boden), kein Deckel — an einzelnen Tagen (etwa am Wochenende) darf und soll mehr als
 * das Tagesminimum getragen werden, sodass ein höheres Wochen-/Monatsziel legitim und über die
 * längere Frist erreichbar ist. Die frühere Quer-Sperre lehnte genau solche Konfigurationen
 * (werktags wenig, am Wochenende viel) fälschlich als „unerreichbar" ab.
 */
export function checkGoalPlausibility(p: {
  minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null;
  minProTagWochentage?: readonly WeekdayGoalRule[] | null;
}): ServiceErrorCode | null {
  const { minProTagH: tag, minProWocheH: woche, minProMonatH: monat, minProJahrH: jahr } = p;
  if (tag != null && tag > PERIOD_HOUR_CAP.tag) return "GOAL_DAY_TARGET_TOO_HIGH";
  if (woche != null && woche > PERIOD_HOUR_CAP.woche) return "GOAL_WEEK_TARGET_TOO_HIGH";
  if (monat != null && monat > PERIOD_HOUR_CAP.monat) return "GOAL_MONTH_TARGET_TOO_HIGH";
  if (jahr != null && jahr > PERIOD_HOUR_CAP.jahr) return "GOAL_YEAR_TARGET_TOO_HIGH";
  // Jede Wochentag-Ausnahme gegen dieselbe Tages-Obergrenze — ein Ausnahme-Wert ist genauso ein
  // Tages-Soll wie `minProTagH`. Geteilt mit dem MCP-dryRun (der ruft dieselbe Funktion).
  if (weekdayGoalRuleTooHigh(p.minProTagWochentage ?? [])) return "GOAL_DAY_TARGET_TOO_HIGH";
  return null;
}

/** Prüft die rohen Wochentag-Ausnahmen (Struktur) und gibt die normalisierten Regeln zurück — oder
 *  einen Fehler-`ServiceResult`. Geteilt von create/update, damit beide Wege dieselbe Wache und
 *  dieselbe Speicherform (normalisiertes JSON, `null` bei leer) nutzen. */
function resolveWeekdayGoalRules(raw: unknown): ServiceResult<WeekdayGoalRule[]> {
  if (raw !== undefined && raw !== null) {
    const problem = weekdayGoalRulesProblem(raw);
    if (problem) return serviceFail(400, problem.code);
  }
  return { ok: true, data: parseWeekdayGoalRules(raw ?? null) };
}

/** Regeln → Spaltenwert: normalisiertes JSON, oder `null` wenn leer (rückwärtskompatibel = keine
 *  Ausnahme). Normalisiert wie bei den Auto-Kontroll-Tagesregeln, damit ein Änderungs-Vergleich
 *  Zeichenkette gegen Zeichenkette läuft. */
function weekdayGoalRulesColumn(rules: WeekdayGoalRule[]): string | null {
  return rules.length ? JSON.stringify(rules) : null;
}

/**
 * Die EINE Ziel-Wache: Wochentag-Regel-STRUKTUR (Anzahl, Masken), Perioden-Pflicht und die
 * Plausibilitäts-Obergrenzen in einem Schritt — gibt die normalisierten Regeln zurück oder einen
 * Fehler-`ServiceResult`. Geteilt von `createVorgabe`/`updateVorgabe` UND der MCP-dryRun-Vorschau
 * (`set_training_goal`), damit Vorschau und Commit nie auseinanderlaufen (checkTask/dryRun-Muster).
 */
export function validateGoalTargets(params: {
  minProTagH?: number | null; minProWocheH?: number | null; minProMonatH?: number | null; minProJahrH?: number | null;
  minProTagWochentage?: unknown;
}): ServiceResult<WeekdayGoalRule[]> {
  const rulesRes = resolveWeekdayGoalRules(params.minProTagWochentage);
  if (!rulesRes.ok) return rulesRes;
  const checkable = { ...params, minProTagWochentage: rulesRes.data };
  if (!hasPeriodTarget(checkable)) return serviceFail(400, "GOAL_PERIOD_TARGET_REQUIRED");
  const plausibilityErr = checkGoalPlausibility(checkable);
  if (plausibilityErr) return serviceFail(400, plausibilityErr);
  return { ok: true, data: rulesRes.data };
}

/**
 * Creates a TrainingVorgabe (wear goal) for a user / category.
 * Shared by POST /api/admin/vorgaben and the MCP write tool. At least one period target required.
 */
export async function createVorgabe(params: CreateVorgabeParams): Promise<ServiceResult<{ id: string }>> {
  const { userId, categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, minProJahrH, notiz } = params;

  if (!userId || !gueltigAb) return serviceFail(400, "GOAL_USER_AND_START_REQUIRED");
  const rulesRes = validateGoalTargets(params);
  if (!rulesRes.ok) return rulesRes;
  const catErr = await validateVorgabeCategory(categoryId, userId);
  if (catErr) return catErr;

  const tz = await tzForDates(userId, gueltigAb, gueltigBis);
  const vorgabe = await prisma.trainingVorgabe.create({
    data: {
      userId,
      categoryId: categoryId || null,
      gueltigAb: goalDateFromInput(gueltigAb, tz),
      gueltigBis: gueltigBis ? goalDateFromInput(gueltigBis, tz) : null,
      validUntilManual: params.validUntilManual ?? !!gueltigBis, // explizit gesetztes Ende gegen Auto-Verkettung schützen
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      minProJahrH: minProJahrH ?? null,
      minProTagWochentage: weekdayGoalRulesColumn(rulesRes.data),
      notiz: notiz || null,
    },
  });

  await reorderVorgabenDates(userId);

  return { ok: true, data: { id: vorgabe.id } };
}

export type UpdateVorgabeParams = Omit<CreateVorgabeParams, "userId">;

/**
 * Replaces a TrainingVorgabe's values by id (overwrite semantics, like the admin form).
 * Shared by PATCH /api/admin/vorgaben/[id] and the MCP edit_training_goal tool.
 */
export async function updateVorgabe(id: string, params: UpdateVorgabeParams): Promise<ServiceResult<{ id: string; userId: string }>> {
  const existing = await findActiveVorgabe(id);
  if (!existing) return serviceFail(404, "GOAL_NOT_FOUND");

  const { categoryId, gueltigAb, gueltigBis, minProTagH, minProWocheH, minProMonatH, minProJahrH, notiz } = params;
  if (!gueltigAb) return serviceFail(400, "GOAL_START_REQUIRED");
  const rulesRes = validateGoalTargets(params);
  if (!rulesRes.ok) return rulesRes;
  const catErr = await validateVorgabeCategory(categoryId, existing.userId);
  if (catErr) return catErr;

  const tz = await tzForDates(existing.userId, gueltigAb, gueltigBis);
  await prisma.trainingVorgabe.update({
    where: { id },
    data: {
      ...(categoryId !== undefined ? { categoryId: categoryId || null } : {}),
      gueltigAb: goalDateFromInput(gueltigAb, tz),
      gueltigBis: gueltigBis ? goalDateFromInput(gueltigBis, tz) : null,
      validUntilManual: params.validUntilManual ?? !!gueltigBis, // explizit gesetztes Ende gegen Auto-Verkettung schützen
      minProTagH: minProTagH ?? null,
      minProWocheH: minProWocheH ?? null,
      minProMonatH: minProMonatH ?? null,
      minProJahrH: minProJahrH ?? null,
      minProTagWochentage: weekdayGoalRulesColumn(rulesRes.data),
      notiz: notiz ?? null,
    },
  });
  await reorderVorgabenDates(existing.userId);
  return { ok: true, data: { id, userId: existing.userId } };
}

/**
 * Soft-deletes a TrainingVorgabe by id (setzt `deletedAt`, löscht die Zeile NICHT physisch).
 * Shared by DELETE /api/admin/vorgaben/[id] and the MCP tool.
 *
 * B-04 (MCP-Befundliste 2026-07-17): explain_model §13 macht „Supersession statt Delete" zum
 * Prinzip — für Trainingsziele galt bisher das Gegenteil (harter Delete, keine Spur, keine
 * autoritative Historie trotz gegenteiligem Versprechen bei `get_action_log`). Ein zweiter
 * Delete-Aufruf auf ein bereits gelöschtes Ziel trifft dieselbe `deletedAt: null`-Existenzprüfung
 * wie `updateVorgabe` und liefert `GOAL_NOT_FOUND` — identisches Verhalten zum alten Hard-Delete.
 */
export async function deleteVorgabe(id: string): Promise<ServiceResult<{ userId: string }>> {
  const existing = await findActiveVorgabe(id);
  if (!existing) return serviceFail(404, "GOAL_NOT_FOUND");
  await prisma.trainingVorgabe.update({ where: { id }, data: { deletedAt: new Date() } });
  // Verbleibende (aktive) Ziele derselben Kategorie neu verketten — die gelöschte Zeile fällt aus
  // reorderVorgabenDates' eigener Query (jetzt ebenfalls deletedAt:null) automatisch heraus.
  await reorderVorgabenDates(existing.userId);
  return { ok: true, data: { userId: existing.userId } };
}

/** Lists a user's training goals (chained per category), newest category-block first, with category
 *  names. `includeDeleted` (B-04): auch soft-gelöschte Ziele mitliefern — Default false, damit
 *  bestehende Aufrufer (Adhärenz-/Zielberechnung, Admin-Seiten) gelöschte Ziele automatisch NICHT
 *  mehr sehen, ohne selbst filtern zu müssen. */
export async function listVorgaben(userId: string, opts: { includeDeleted?: boolean } = {}) {
  const where = opts.includeDeleted ? { userId } : { userId, deletedAt: null };
  return prisma.trainingVorgabe.findMany({
    where,
    orderBy: [{ categoryId: "asc" }, { gueltigAb: "asc" }],
    // `isBuiltIn` mit: die Aufrufer filtern über `goalCategoryKey`, das es braucht.
    include: { category: { select: { name: true, isBuiltIn: true } } },
  });
}
