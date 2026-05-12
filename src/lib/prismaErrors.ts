/** Known unique-constrained columns we currently catch P2002 on. The literal union
 *  enables IDE autocomplete and prevents typos like `"emaill"` from silently returning
 *  false. Add new fields here when extending the helper to new routes. */
type KnownUniqueField = "username" | "email" | "refId";

/** True if `err` is a Prisma `P2002` unique-constraint violation on the given field.
 *
 *  We don't import `Prisma.PrismaClientKnownRequestError` because that pulls the
 *  full Prisma client typing into every consumer; the runtime error shape is stable
 *  enough to duck-type:
 *    { code: "P2002", meta: { target: string[] | string } }
 *
 *  The `(string & {})` widening keeps the function open for fields not yet added to
 *  `KnownUniqueField` while still surfacing autocomplete on the known ones.
 */
export function isUniqueConstraintOn(err: unknown, field: KnownUniqueField | (string & {})): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target === field || target.split(",").map((s) => s.trim()).includes(field);
  return false;
}
