import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";
import {
  CATEGORY_SLUG_MAX_LENGTH, DEFAULT_USER_CATEGORY_COLOR, DEFAULT_USER_CATEGORY_ICON,
  slugifyCategoryName, validateCategoryInput,
} from "@/lib/categoryConstants";
import type { TxClient } from "@/lib/mcp/writeFramework";
import type { DeviceCategory } from "@prisma/client";

/** The category flags an owner-check caller may need. `null` = no category was supplied. */
export type OwnedCategory = { isBuiltIn: boolean; allowVorgaben: boolean } | null;

/**
 * Resolves `categoryId` against `userId`: the category must exist and belong to that user.
 *
 * Shared by the device routes and `validateVorgabeCategory` — all three previously carried their own
 * copy of the `findUnique` + `cat.userId !== userId` pair. What is deliberately NOT here is the
 * `allowVorgaben` rule: a category that forbids training goals is still a perfectly valid category to
 * file a *device* under. The goal service layers that check on top of this one.
 *
 * `undefined`/`null` mean "no category given" and succeed with `data: null`, so a PATCH that omits
 * the field is not treated as an invalid assignment — and no query is issued.
 *
 * `client` MUSS der Transaktions-Client sein, wenn dies innerhalb eines MCP-write-`apply` läuft —
 * derselbe Grund wie bei `tzOf`: der globale Client würde gegen die offene SQLite-Transaktion
 * deadlocken.
 *
 * Lives here and not in `deviceCategories.ts`: that module is client-reachable (its
 * `KG_BUILTIN_SLUG` is pulled in by `categoryConstants.ts`, which client components import), and
 * `serviceResult.ts` drags `next/server` along. Same rule that keeps `serviceErrorCodes.ts` and
 * `codedError.ts` import-free.
 */
export async function resolveOwnedCategory(
  categoryId: unknown,
  userId: string,
  client: TxClient = prisma,
): Promise<ServiceResult<OwnedCategory>> {
  if (categoryId === undefined || categoryId === null) return { ok: true, data: null };
  if (typeof categoryId !== "string") return serviceFail(400, "INVALID_CATEGORY");

  const cat = await client.deviceCategory.findUnique({
    where: { id: categoryId },
    select: { userId: true, allowVorgaben: true, isBuiltIn: true },
  });
  if (!cat || cat.userId !== userId) return serviceFail(400, "INVALID_CATEGORY");

  return { ok: true, data: { isBuiltIn: cat.isBuiltIn, allowVorgaben: cat.allowVorgaben } };
}

/**
 * Die drei Felder, die eine Kategorie zur REGEL machen statt zur Beschriftung.
 *
 * `trackingEnabled` entscheidet, ob überhaupt gemessen wird; `requirePhoto`, ob ein Trage-Beginn
 * belegt werden muss; `allowVorgaben`, ob die Keyholderin darauf ein Trainingsziel stellen darf.
 * Name, Farbe, Symbol und Sortierung bleiben Sache des Eigentümers.
 */
export const CATEGORY_RULE_FIELDS = ["trackingEnabled", "requirePhoto", "allowVorgaben"] as const;
export type CategoryRuleField = (typeof CATEGORY_RULE_FIELDS)[number];

/** Die Vorgaben einer frisch angelegten Kategorie — zugleich der Vergleichswert beim Anlegen. */
export const CATEGORY_RULE_DEFAULTS: Record<CategoryRuleField, boolean> = {
  trackingEnabled: true,
  requirePhoto: false,
  allowVorgaben: true,
};

/** Warum eine Regel-Änderung abgelehnt wurde. */
export type CategoryRuleCode = "CATEGORY_BUILTIN_RULE_IMMUTABLE" | "CATEGORY_RULE_FORBIDDEN";

/** Was von den drei Regeln übernommen wird — oder warum nicht. */
export type CategoryRuleOutcome =
  | { ok: true; data: Partial<Record<CategoryRuleField, boolean>> }
  | { ok: false; status: 400 | 403; code: CategoryRuleCode };

/**
 * Prüft, welche der drei Regeln der Aufrufer setzen darf — die eine Stelle für Anlegen und Ändern.
 *
 * Geprüft wird die **Änderung**, nicht die Anwesenheit im Body. Der Unterschied ist load-bearing:
 * das Formular schickt seinen ganzen Zustand mit, auch die unveränderten Schalter, und die App auf
 * dem Gerät ist eine eigene, mitunter ältere Fassung, die sich nicht mit dem Server aktualisiert.
 * Eine Schranke auf `!== undefined` liesse einen Träger seine Kategorie nicht einmal mehr UMBENENNEN.
 * Verboten ist das Umlegen, nicht das Mitschicken.
 *
 * `current` ist beim Ändern der Bestand und beim Anlegen {@link CATEGORY_RULE_DEFAULTS}.
 * `isBuiltIn` schlägt `elevated`: bei der eingebauten Kategorie sind die Regeln für JEDEN
 * unveränderlich. Zwei der drei wären dort ohnehin wirkungslos — `allowVorgaben` überspringt der
 * Vorgaben-Service für sie, `requirePhoto` betrifft nur Trage-Einträge, die es dort nicht gibt. Eine
 * wirkungslose Einstellung anzunehmen wäre schlimmer als sie abzulehnen: sie sähe danach gesetzt aus.
 */
export function resolveCategoryRuleChanges(
  body: Record<string, unknown>,
  current: Record<CategoryRuleField, boolean>,
  opts: { isBuiltIn: boolean; elevated: boolean },
): CategoryRuleOutcome {
  const data: Partial<Record<CategoryRuleField, boolean>> = {};
  for (const field of CATEGORY_RULE_FIELDS) {
    const next = body[field];
    if (typeof next !== "boolean" || next === current[field]) continue;
    if (opts.isBuiltIn) return { ok: false, status: 400, code: "CATEGORY_BUILTIN_RULE_IMMUTABLE" };
    if (!opts.elevated) return { ok: false, status: 403, code: "CATEGORY_RULE_FORBIDDEN" };
    data[field] = next;
  }
  return { ok: true, data };
}

/** Wie viele `-2`, `-3`, … eine Slug-Kollision durchprobiert, bevor aufgegeben wird. */
const MAX_SLUG_SUFFIX = 99;

/**
 * Vergibt einen im Konto eindeutigen Slug zu einem Basis-Slug — eine Abfrage für alle Kollisionen.
 *
 * `null` heisst: {@link MAX_SLUG_SUFFIX} ist erschöpft (der Aufrufer meldet das als Konflikt).
 * Geteilt von `POST /api/categories` und dem MCP-Write; zwei Zähl-Schleifen für dieselbe Frage
 * wären zwei Gelegenheiten, unterschiedlich abzubrechen.
 */
export async function pickUniqueCategorySlug(
  userId: string,
  baseSlug: string,
  client: TxClient = prisma,
): Promise<string | null> {
  const taken = new Set(
    (await client.deviceCategory.findMany({
      where: { userId, slug: { startsWith: baseSlug } },
      select: { slug: true },
    })).map((c) => c.slug),
  );
  if (!taken.has(baseSlug)) return baseSlug;
  for (let i = 2; i <= MAX_SLUG_SUFFIX; i++) {
    const candidate = `${baseSlug}-${i}`.slice(0, CATEGORY_SLUG_MAX_LENGTH);
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

/** Der IST-Stand der drei Regeln einer Kategorie, in der Form, die {@link resolveCategoryRuleChanges}
 *  als `current` erwartet. Hier, damit der ungeprüfte `as`-Cast einmal existiert statt an jeder
 *  Aufrufstelle. */
export function currentCategoryRules(c: Record<CategoryRuleField, boolean>): Record<CategoryRuleField, boolean> {
  return Object.fromEntries(CATEGORY_RULE_FIELDS.map((f) => [f, c[f]])) as Record<CategoryRuleField, boolean>;
}

/** Was an einer Kategorie hängt — die Zahlen, die über ihre Löschbarkeit entscheiden. */
export interface CategoryUsage {
  /** ALLE Geräte, auch archivierte: ein archiviertes Gerät verlöre sonst still seine Zuordnung. */
  deviceCount: number;
  /** ALLE Trainingsziele, auch soft-gelöschte (B-04): `TrainingVorgabe.categoryId` hat ON DELETE
   *  SET NULL — wäre eine Kategorie mit nur noch gelöschten Zielen löschbar, fiele deren Historie
   *  stillschweigend auf „KG" zurück. Historische Ziele blockieren daher wie aktive. */
  goalCount: number;
}

export async function categoryUsage(client: TxClient, categoryId: string): Promise<CategoryUsage> {
  const [deviceCount, goalCount] = await Promise.all([
    client.device.count({ where: { categoryId } }),
    client.trainingVorgabe.count({ where: { categoryId } }),
  ]);
  return { deviceCount, goalCount };
}

/** Warum diese Kategorie nicht löschbar ist — oder `null`. Rein, damit Oberfläche und MCP dieselbe
 *  Entscheidung treffen und nur die Formulierung des Fehlers bei ihnen liegt. */
export function categoryDeleteBlock(
  category: { isBuiltIn: boolean },
  usage: CategoryUsage,
): "builtin" | "in-use" | null {
  if (category.isBuiltIn) return "builtin";
  if (usage.deviceCount > 0 || usage.goalCount > 0) return "in-use";
  return null;
}

/** Eingabe von {@link createCategory} — Name ist Pflicht, der Rest hat Vorgaben. */
export interface CreateCategoryInput {
  name: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  /** Der Name des ERSTEN Geräts. Eine Kategorie ohne Gerät ist eine Sackgasse: erfassen lässt sich
   *  darin nichts (Issue #49). Beide Schritte laufen deshalb als EIN verschachtelter Write. */
  firstDeviceName?: string;
}

/** Der aus dem Namen abgeleitete Slug — oder warum keiner zu haben ist. */
export type CategorySlugOutcome =
  | { ok: true; slug: string }
  | { ok: false; reason: "slug-exhausted"; baseSlug: string }
  | { ok: false; reason: "slug-invalid"; slug: string; error: string };

/**
 * Leitet den Slug aus dem Namen ab, macht ihn im Konto eindeutig und prüft das Ergebnis gegen die
 * reservierten Slugs.
 *
 * Eigenständig, damit eine VORSCHAU dieselbe Frage stellen kann wie der Commit, ohne zu schreiben:
 * ein dryRun, der die Slug-Vergabe überspringt, verspricht sonst Erfolg für ein Anlegen, das gleich
 * darauf am erschöpften Namensraum scheitert.
 */
export async function deriveCategorySlug(
  client: TxClient,
  userId: string,
  name: string,
): Promise<CategorySlugOutcome> {
  const baseSlug = slugifyCategoryName(name.trim()) || "category";
  const slug = await pickUniqueCategorySlug(userId, baseSlug, client);
  if (!slug) return { ok: false, reason: "slug-exhausted", baseSlug };
  const slugError = validateCategoryInput({ slug });
  if (slugError) return { ok: false, reason: "slug-invalid", slug, error: slugError.error };
  return { ok: true, slug };
}

export type CreateCategoryOutcome =
  | { ok: true; category: DeviceCategory }
  | { ok: false; reason: "rules"; status: 400 | 403; code: CategoryRuleCode }
  | Exclude<CategorySlugOutcome, { ok: true }>;

/**
 * Legt eine benutzerdefinierte Kategorie an — die EINE Stelle für `POST /api/categories` und den
 * MCP-Write.
 *
 * Zusammengefasst ist hier die REIHENFOLGE, nicht nur ihre Teile: Regeln gegen die Vorgaben prüfen,
 * Slug ableiten und eindeutig machen, den abgeleiteten Slug gegen die reservierten prüfen, anlegen —
 * samt erstem Gerät im selben Write. Vorher lag diese Kette zweimal da und war bereits auseinander:
 * die Route prüfte den ABGELEITETEN Slug, der MCP-Pfad nicht.
 *
 * Name, Farbe und Symbol prüft der Aufrufer vorher (`validateCategoryInput`) — er kennt die Form,
 * in der er den Fehler ausgeben muss.
 */
export async function createCategory(
  client: TxClient,
  userId: string,
  input: CreateCategoryInput,
  opts: { elevated: boolean },
  rulesBody: Record<string, unknown>,
): Promise<CreateCategoryOutcome> {
  const rules = resolveCategoryRuleChanges(rulesBody, CATEGORY_RULE_DEFAULTS, { isBuiltIn: false, elevated: opts.elevated });
  if (!rules.ok) return { ok: false, reason: "rules", status: rules.status, code: rules.code };

  const name = input.name.trim();
  const derived = await deriveCategorySlug(client, userId, name);
  if (!derived.ok) return derived;

  const firstDeviceName = input.firstDeviceName?.trim();
  const category = await client.deviceCategory.create({
    data: {
      userId,
      name,
      slug: derived.slug,
      color: input.color ?? DEFAULT_USER_CATEGORY_COLOR,
      icon: input.icon ?? DEFAULT_USER_CATEGORY_ICON,
      isBuiltIn: false,
      ...CATEGORY_RULE_DEFAULTS,
      ...rules.data,
      sortOrder: input.sortOrder ?? 0,
      // Verschachtelt statt in einer eigenen Transaktion: Prisma schreibt beides atomar, und eine
      // Kategorie, deren Gerät nicht entstand, wäre genau die Sackgasse, gegen die das Feld gebaut ist.
      ...(firstDeviceName ? { devices: { create: { userId, name: firstDeviceName } } } : {}),
    },
  });
  return { ok: true, category };
}
