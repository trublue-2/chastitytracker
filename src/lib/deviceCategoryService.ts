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
