/** True if `err` is a Prisma `P2002` unique-constraint violation on the given field.
 *
 *  We don't import `Prisma.PrismaClientKnownRequestError` because that pulls the
 *  full Prisma client typing into every consumer; the runtime error shape is stable
 *  enough to duck-type:
 *    { code: "P2002", meta: { target: string[] | string } }
 */
export function isUniqueConstraintOn(err: unknown, field: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; meta?: { target?: unknown } };
  if (e.code !== "P2002") return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target === field || target.split(",").map((s) => s.trim()).includes(field);
  return false;
}
