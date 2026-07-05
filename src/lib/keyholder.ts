import { prisma } from "@/lib/prisma";

/**
 * Keyholder relationships. A keyholder is any user with an AdminUserRelationship row
 * (adminId = keyholder, userId = sub) — the keyholder need NOT be a global admin.
 * This is read independently of USE_ADMIN_RELATIONSHIPS (that flag only scopes which users a
 * global admin sees). Self-control is impossible: actorId === subId is always rejected.
 */

/** True if `actorId` keyholds `subId` (relationship exists and it is not the same person). */
export async function isKeyholderOf(actorId: string, subId: string): Promise<boolean> {
  if (actorId === subId) return false;
  const rel = await prisma.adminUserRelationship.findUnique({
    where: { adminId_userId: { adminId: actorId, userId: subId } },
    select: { id: true },
  });
  return rel !== null;
}

/** Cheap existence check — does this user keyhold anyone? For the header nav (runs on every page). */
export async function controlsAnySub(keyholderId: string): Promise<boolean> {
  const rel = await prisma.adminUserRelationship.findFirst({
    where: { adminId: keyholderId, userId: { not: keyholderId } },
    select: { id: true },
  });
  return rel !== null;
}

/** The subs a user keyholds (never includes self). For the keyholder's own control area. */
export async function getControlledSubs(keyholderId: string): Promise<{ id: string; username: string }[]> {
  const rels = await prisma.adminUserRelationship.findMany({
    where: { adminId: keyholderId, userId: { not: keyholderId } },
    include: { user: { select: { id: true, username: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rels.map((r) => r.user);
}

/** Alle Subs, auf deren Detailseite ein Nutzer als Startseite landen darf: globaler Admin → jeder
 *  Nicht-Admin-Nutzer; Keyholder → seine zugewiesenen Subs. Niemals man selbst. Alphabetisch. */
export async function getControllableSubs(
  userId: string,
  role: string | undefined,
): Promise<{ id: string; username: string }[]> {
  if (role === "admin") {
    return prisma.user.findMany({
      where: { role: { not: "admin" }, id: { not: userId } },
      select: { id: true, username: true },
      orderBy: { username: "asc" },
    });
  }
  return getControlledSubs(userId);
}

/** Darf `userId` (mit `role`) den Sub `subId` kontrollieren / auf dessen Seite landen? Globaler Admin
 *  kontrolliert jeden Nicht-Admin-Nutzer; Keyholder nur seine zugewiesenen Subs. Nie sich selbst. */
export async function canControlSub(
  userId: string,
  role: string | undefined,
  subId: string,
): Promise<boolean> {
  if (!subId || subId === userId) return false;
  if (role === "admin") {
    const u = await prisma.user.findUnique({ where: { id: subId }, select: { role: true } });
    return !!u && u.role !== "admin";
  }
  return isKeyholderOf(userId, subId);
}

/** The keyholders assigned to a sub (for the admin provisioning UI). */
export async function getKeyholdersOfUser(subId: string): Promise<{ id: string; username: string; role: string }[]> {
  const rels = await prisma.adminUserRelationship.findMany({
    where: { userId: subId },
    include: { admin: { select: { id: true, username: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rels.map((r) => r.admin);
}

/**
 * Who should be notified about a sub's activity: all global admins PLUS the sub's keyholders
 * (controllers assigned via AdminUserRelationship — keyholders are role "user", so the global-admin
 * query alone would miss them). Deduped by id; returns id + email. Keyholders are inherently
 * scoped to their sub; global admins stay global so an instance owner keeps full visibility.
 */
export async function getControllersOfUser(subId: string): Promise<{ id: string; email: string | null }[]> {
  const [admins, rels] = await Promise.all([
    prisma.user.findMany({ where: { role: "admin" }, select: { id: true, email: true } }),
    prisma.adminUserRelationship.findMany({
      where: { userId: subId },
      select: { admin: { select: { id: true, email: true } } },
    }),
  ]);
  const byId = new Map<string, { id: string; email: string | null }>();
  for (const a of admins) byId.set(a.id, a);
  for (const r of rels) byId.set(r.admin.id, { id: r.admin.id, email: r.admin.email });
  return [...byId.values()];
}
