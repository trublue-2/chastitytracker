import { prisma } from "@/lib/prisma";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

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
 * Lives here and not in `deviceCategories.ts`: that module is client-reachable (its
 * `KG_BUILTIN_SLUG` is pulled in by `categoryConstants.ts`, which client components import), and
 * `serviceResult.ts` drags `next/server` along. Same rule that keeps `serviceErrorCodes.ts` and
 * `codedError.ts` import-free.
 */
export async function resolveOwnedCategory(
  categoryId: unknown,
  userId: string,
): Promise<ServiceResult<OwnedCategory>> {
  if (categoryId === undefined || categoryId === null) return { ok: true, data: null };
  if (typeof categoryId !== "string") return serviceFail(400, "INVALID_CATEGORY");

  const cat = await prisma.deviceCategory.findUnique({
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

/** Was von den drei Regeln übernommen wird — oder warum nicht. */
export type CategoryRuleOutcome =
  | { ok: true; data: Partial<Record<CategoryRuleField, boolean>> }
  | { ok: false; status: 400 | 403; code: "CATEGORY_BUILTIN_RULE_IMMUTABLE" | "CATEGORY_RULE_FORBIDDEN" };

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
