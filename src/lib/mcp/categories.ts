import { prisma } from "@/lib/prisma";
import { makeIso, matchByNameCI, tzOf, type Iso } from "@/lib/mcp/common";
import { diffFields, type TxClient, type WriteDef } from "@/lib/mcp/writeFramework";
import {
  categoryDeleteBlock, categoryUsage, createCategory, currentCategoryRules, deriveCategorySlug,
  resolveCategoryRuleChanges,
  type CategoryRuleCode, type CategoryRuleField, type CategoryRuleOutcome, type CategorySlugOutcome,
  type CategoryUsage,
} from "@/lib/deviceCategoryService";
import { validateCategoryInput } from "@/lib/categoryConstants";
import { deviceCategoriesEnabled, DEVICE_NAME_MAX_LENGTH } from "@/lib/constants";
import { CATEGORY_LIST_ORDER, CATEGORY_LIST_SELECT } from "@/lib/queries";

/** Geräte-Kategorien über den MCP: lesen (als Teil von `get_devices`), anlegen/ändern, löschen.
 *
 *  Die Regeln kommen ausnahmslos aus `deviceCategoryService` — dieselbe Schicht, die die
 *  Admin-Oberfläche benutzt. Eine zweite Prüfkette hier hiesse, dass ein Keyholder über den MCP
 *  etwas darf, was ihm die Oberfläche verwehrt (oder umgekehrt).
 *
 *  KEINE Optimistic Concurrency, und das bleibt so: `DeviceCategory` führt — anders als
 *  Device/Note/Appointment — bewusst keine `version`-Spalte. Eine Kategorie trägt Beschriftung und
 *  drei Schalter; zwei Schreiber, die sich hier überholen, kosten eine Farbe, keine Entscheidung.
 *  Kategorie-Edits sind darum Last-Write-Wins. */

/** Der MCP handelt als KEYHOLDER (Admin-OAuth, siehe checkMcpKeyholder) — genau die Rolle, die in
 *  der Oberfläche die drei Kategorie-REGELN umlegen darf. `isBuiltIn` schlägt das weiterhin: an der
 *  eingebauten KG-Kategorie sind die Regeln auch für den Keyholder unveränderlich. */
const MCP_ELEVATED = true;

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  /** true = die eingebaute KG-Kategorie: Slug und die drei Regeln sind unveränderlich, löschbar ist sie nie. */
  isKg: boolean;
  /** false = Inventar-Kategorie: es werden gar keine Trage-Sessions gemessen. */
  trackingEnabled: boolean;
  requirePhoto: boolean;
  allowVorgaben: boolean;
  sortOrder: number;
  /** Nicht-archivierte Geräte — „lässt sich hier erfassen?", nicht „gab es hier je ein Gerät?". */
  deviceCount: number;
  /** Verknüpfte Trainingsziele (auch historische) — beide zählen als Löschsperre. */
  goalCount: number;
  createdAt: string;
}

/** Ohne die Zählungen — für Schreib-Rückgaben, die sie bereits kennen (ein Beschriftungs-Edit kann
 *  weder Geräte- noch Ziel-Anzahl ändern; ein frisch Angelegtes hat 0 Ziele und 0-oder-1 Gerät). */
const { _count: _countSelect, ...categoryScalarSelect } = CATEGORY_LIST_SELECT;

type CategoryViewRow = {
  id: string; name: string; slug: string; color: string; icon: string; isBuiltIn: boolean;
  trackingEnabled: boolean; requirePhoto: boolean; allowVorgaben: boolean; sortOrder: number;
  createdAt: Date; _count: { devices: number; vorgaben: number };
};

function toCategoryView(c: CategoryViewRow, iso: Iso): CategoryView {
  return {
    id: c.id, name: c.name, slug: c.slug, color: c.color, icon: c.icon,
    isKg: c.isBuiltIn,
    trackingEnabled: c.trackingEnabled, requirePhoto: c.requirePhoto, allowVorgaben: c.allowVorgaben,
    sortOrder: c.sortOrder,
    deviceCount: c._count.devices,
    goalCount: c._count.vorgaben,
    createdAt: iso(c.createdAt)!,
  };
}

/** Die Kategorien eines Subs in derselben Reihenfolge wie die Verwaltungsseite (KG zuerst).
 *  Von `get_devices` mitgeliefert: ohne die ids liesse sich kein Gerät einer Kategorie zuordnen. */
export async function listCategoryViews(userId: string, iso: Iso, client: TxClient = prisma): Promise<CategoryView[]> {
  const rows = await client.deviceCategory.findMany({
    where: { userId },
    orderBy: [...CATEGORY_LIST_ORDER],
    select: CATEGORY_LIST_SELECT,
  });
  return rows.map((c) => toCategoryView(c, iso));
}

// ── Gemeinsames ──────────────────────────────────────────────────────────────

/** Wirft, wenn die Instanz ohne Kategorien läuft (`ENABLE_DEVICE_CATEGORIES=false`). Dieselbe
 *  Schranke wie `deviceCategoriesGate()` vor den HTTP-Routen — nur als Fehler statt als 404. */
function assertCategoriesEnabled(): void {
  if (!deviceCategoriesEnabled()) {
    throw new Error("Device categories are disabled on this instance (ENABLE_DEVICE_CATEGORIES=false).");
  }
}

/** Übersetzt die Absage der Regel-Schicht in eine Fehlermeldung. Die Codes sind für die HTTP-Routen
 *  gedacht (der Client löst sie via i18n auf); über den MCP liest sie ein Agent, der einen Satz braucht. */
function assertRulesAllowed(outcome: CategoryRuleOutcome): Partial<Record<CategoryRuleField, boolean>> {
  if (outcome.ok) return outcome.data;
  throw new Error(assertRulesFailure(outcome.code));
}

function assertRulesFailure(code: CategoryRuleCode): string {
  return code === "CATEGORY_BUILTIN_RULE_IMMUTABLE"
    ? "The rules of the built-in KG category are immutable (trackingEnabled/requirePhoto/allowVorgaben)."
    : "Changing category rules requires keyholder authorization.";
}

/** Warum kein Slug zu haben war, als Satz für den Agenten. */
function slugFailureMessage(f: Exclude<CategorySlugOutcome, { ok: true }>): string {
  return f.reason === "slug-exhausted"
    ? `Too many categories with a similar name — no free slug for "${f.baseSlug}".`
    : `Derived slug "${f.slug}" is not usable: ${f.error}`;
}

/** Warum das Anlegen im Service scheiterte, als Satz für den Agenten. */
function createFailureMessage(f: Exclude<Awaited<ReturnType<typeof createCategory>>, { ok: true }>): string {
  return f.reason === "rules" ? assertRulesFailure(f.code) : slugFailureMessage(f);
}

/** Wirft die erste Verletzung von name/color/icon als Fehler (die Route gibt sie als 400 zurück). */
function assertCategoryInput(input: { name?: unknown; color?: unknown; icon?: unknown }): void {
  const err = validateCategoryInput(input);
  if (err) throw new Error(`Invalid ${err.field}: ${err.error}`);
}

/** Die Kategorie mit allem, was der View braucht — nur per id (upsert_category zielt nie per Name,
 *  dort ist `name` ein zu schreibendes Feld). */
async function loadCategoryView(client: TxClient, userId: string, id: string): Promise<CategoryViewRow> {
  const c = await client.deviceCategory.findFirst({ where: { id, userId }, select: CATEGORY_LIST_SELECT });
  if (!c) throw new Error(`Category not found: ${id}`);
  return c;
}

/** Kategorie per id ODER Name (case-insensitiv), schlanker Select: das Löschen braucht drei Skalare,
 *  nicht zwei Zähl-Aggregate über den ganzen Bestand. */
const categoryRefSelect = { id: true, name: true, isBuiltIn: true } as const;
type CategoryRefRow = { id: string; name: string; isBuiltIn: boolean };

async function resolveCategoryRef(client: TxClient, userId: string, args: DeleteCategoryArgs): Promise<CategoryRefRow> {
  if (args.id) {
    const c = await client.deviceCategory.findFirst({ where: { id: args.id, userId }, select: categoryRefSelect });
    if (!c) throw new Error(`Category not found: ${args.id}`);
    return c;
  }
  if (args.categoryName) {
    const all = await client.deviceCategory.findMany({ where: { userId }, select: categoryRefSelect });
    const match = matchByNameCI(all, args.categoryName);
    if (!match) throw new Error(`Category not found: "${args.categoryName}". Available: ${all.map((c) => c.name).join(", ") || "none"}`);
    return match;
  }
  throw new Error("Category reference required: pass `id` or `categoryName`.");
}

// ── Write: upsert_category ───────────────────────────────────────────────────

export interface UpsertCategoryArgs {
  /** Bestehende Kategorie bearbeiten; weglassen = neue anlegen. */
  id?: string;
  name?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  trackingEnabled?: boolean;
  requirePhoto?: boolean;
  allowVorgaben?: boolean;
  /** Nur beim Anlegen: der Name des ERSTEN Geräts. Eine Kategorie ohne Gerät ist eine Sackgasse —
   *  erfassen lässt sich darin nichts (Issue #49). Beide Schritte in EINEM Vorgang, wie im Formular. */
  firstDeviceName?: string;
}

/** Beschriftungs-Felder eines Edits (die Regeln laufen getrennt über die Service-Schicht). */
const categoryLabelData = (args: UpsertCategoryArgs) => ({
  ...(args.name !== undefined ? { name: args.name.trim() } : {}),
  ...(args.color !== undefined ? { color: args.color } : {}),
  ...(args.icon !== undefined ? { icon: args.icon } : {}),
  ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
});

/** Prüft die drei Regeln gegen den IST-Stand der Kategorie und liefert die zu schreibenden Werte.
 *  Eine Stelle für Vorschau und Commit — zwei Aufrufketten wären zwei Gelegenheiten, den Diff der
 *  Vorschau vom tatsächlichen Write abweichen zu lassen (N-15). */
const resolveRules = (view: CategoryView, args: UpsertCategoryArgs) =>
  assertRulesAllowed(resolveCategoryRuleChanges(
    args as Record<string, unknown>,
    currentCategoryRules(view),
    { isBuiltIn: view.isKg, elevated: MCP_ELEVATED },
  ));

/** Skalar-Schnappschuss fürs Diffen — die Zählungen bleiben draussen, sie sind nicht Teil des Edits. */
const categorySnapshot = (c: CategoryView) => ({
  name: c.name, color: c.color, icon: c.icon, sortOrder: c.sortOrder,
  trackingEnabled: c.trackingEnabled, requirePhoto: c.requirePhoto, allowVorgaben: c.allowVorgaben,
});

export const upsertCategoryDef: WriteDef<UpsertCategoryArgs, CategoryView> = {
  tool: "upsert_category",
  validate(args) {
    assertCategoriesEnabled();
    if (!args.id && !args.name?.trim()) throw new Error("A new category requires `name`.");
    // Auf den WERT prüfen, nicht auf die Anwesenheit: ein Agent, der seine Argumente aus einem
    // festen Gerüst baut, schickt das Feld sonst leer mit und könnte keine Kategorie mehr umbenennen.
    if (args.id && args.firstDeviceName?.trim()) {
      throw new Error("`firstDeviceName` only applies when creating a category.");
    }
    if (args.sortOrder !== undefined && !Number.isInteger(args.sortOrder)) {
      throw new Error("sortOrder must be an integer.");
    }
    assertCategoryInput({ name: args.name, color: args.color, icon: args.icon });
    if ((args.firstDeviceName?.trim().length ?? 0) > DEVICE_NAME_MAX_LENGTH) {
      throw new Error(`firstDeviceName too long (max. ${DEVICE_NAME_MAX_LENGTH} characters).`);
    }
    return args;
  },
  async preview(ctx, args) {
    if (!args.id) {
      // Den Slug schon in der Vorschau ableiten (rein lesend): sonst meldete der dryRun Erfolg für
      // ein Anlegen, das gleich darauf am erschöpften Namensraum scheitert.
      const name = args.name!.trim();
      const derived = await deriveCategorySlug(prisma, ctx.targetUserId, name);
      return {
        preview: {
          action: "create",
          name,
          slug: derived.ok ? derived.slug : null,
          firstDeviceName: args.firstDeviceName?.trim() || null,
        },
        ...(derived.ok ? {} : { problem: slugFailureMessage(derived) }),
      };
    }
    const [existing, tz] = await Promise.all([
      loadCategoryView(prisma, ctx.targetUserId, args.id),
      tzOf(ctx.targetUserId),
    ]);
    const view = toCategoryView(existing, makeIso(tz));
    const before = categorySnapshot(view);
    // Die Regel-Schicht wirft hier schon (eingebaute Kategorie), damit der dryRun die Absage zeigt
    // statt Erfolg zu versprechen und erst der Commit zu scheitern.
    const rules = resolveRules(view, args);
    return {
      preview: { action: "edit", category: view.name, isKg: view.isKg, before },
      before,
      after: { ...before, ...categoryLabelData(args), ...rules },
    };
  },
  async apply(tx, ctx, args) {
    const iso = makeIso(await tzOf(ctx.targetUserId, tx));

    if (args.id) {
      const existing = await loadCategoryView(tx, ctx.targetUserId, args.id);
      const beforeView = toCategoryView(existing, iso);
      const data = { ...categoryLabelData(args), ...resolveRules(beforeView, args) };
      // No-op-Edit: nicht schreiben. Anders als beim Gerät gibt es hier zwar keine Version zu
      // schonen, aber ein leeres `update` ist ein Schreibzugriff ohne Wirkung.
      // Die Zählungen kommen aus dem Vorher-Stand statt aus einem zweiten Aggregat: eine
      // Beschriftung oder Regel ändert weder Geräte- noch Ziel-Anzahl.
      const updated = Object.keys(data).length
        ? { ...await tx.deviceCategory.update({ where: { id: existing.id }, data, select: categoryScalarSelect }), _count: existing._count }
        : existing;
      const afterView = toCategoryView(updated, iso);
      return {
        newState: afterView,
        resultRef: afterView.id,
        diff: diffFields(categorySnapshot(beforeView), categorySnapshot(afterView)),
      };
    }

    // Regel-Prüfung, Slug-Vergabe und Anlegen kommen aus dem Service — dieselbe Kette bedient
    // `POST /api/categories`.
    const firstDeviceName = args.firstDeviceName?.trim();
    const created = await createCategory(
      tx,
      ctx.targetUserId,
      { name: args.name!, color: args.color, icon: args.icon, sortOrder: args.sortOrder, firstDeviceName },
      { elevated: MCP_ELEVATED },
      args as Record<string, unknown>,
    );
    if (!created.ok) throw new Error(createFailureMessage(created));
    // Die Zählungen einer frisch angelegten Kategorie stehen fest — kein Re-Read nötig.
    const view = toCategoryView(
      { ...created.category, _count: { devices: firstDeviceName ? 1 : 0, vorgaben: 0 } },
      iso,
    );
    return { newState: view, resultRef: view.id };
  },
};

// ── Write: delete_category ───────────────────────────────────────────────────

export interface DeleteCategoryArgs {
  id?: string;
  categoryName?: string;
}

export interface DeleteCategoryResult {
  id: string;
  name: string;
  deleted: true;
}

/** Warum diese Kategorie (noch) nicht löschbar ist — oder `null`, wenn sie es ist. Die ENTSCHEIDUNG
 *  trifft der Service (dieselbe wie DELETE /api/categories/[id]), hier steht nur ihre Formulierung
 *  für den Agenten. */
function deleteBlockMessage(c: CategoryRefRow, usage: CategoryUsage): string | null {
  switch (categoryDeleteBlock({ isBuiltIn: c.isBuiltIn }, usage)) {
    case "builtin":
      return "The built-in KG category cannot be deleted.";
    case "in-use":
      return `Category "${c.name}" is still in use: ${usage.deviceCount} device(s), ${usage.goalCount} training goal(s). ` +
        "Reassign or delete them first (archived devices and historical goals count too).";
    default:
      return null;
  }
}

export const deleteCategoryDef: WriteDef<DeleteCategoryArgs, DeleteCategoryResult> = {
  tool: "delete_category",
  validate(args) {
    assertCategoriesEnabled();
    return args;
  },
  async preview(ctx, args) {
    const row = await resolveCategoryRef(prisma, ctx.targetUserId, args);
    // Die Zahlen der Vorschau sind DIESELBEN, die über die Absage entscheiden — eine zweite Zählung
    // daneben (etwa die archivierten-freie aus der Geräteliste) widerspräche der eigenen Begründung.
    const usage = await categoryUsage(prisma, row.id);
    const problem = deleteBlockMessage(row, usage);
    return {
      preview: { action: "delete", category: row.name, ...usage },
      ...(problem ? { problem } : {}),
    };
  },
  async apply(tx, ctx, args) {
    const row = await resolveCategoryRef(tx, ctx.targetUserId, args);
    const problem = deleteBlockMessage(row, await categoryUsage(tx, row.id));
    if (problem) throw new Error(problem);
    await tx.deviceCategory.delete({ where: { id: row.id } });
    return { newState: { id: row.id, name: row.name, deleted: true }, resultRef: row.id };
  },
};
