import { prisma } from "@/lib/prisma";
import { entryManageAccess } from "@/lib/keyholder";

/**
 * Returns the device's owner id if `actorId` (with `role`) may manage the device — owner, global
 * admin, or keyholder of the owner — else null. The access rule matches entries (entryManageAccess),
 * so device management and entry management never drift. Used by the device-reference routes, which
 * only need the owner id to scope their writes.
 */
export async function manageableDeviceOwner(
  deviceId: string,
  actorId: string,
  role: string | undefined,
): Promise<string | null> {
  const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { userId: true } });
  if (!device) return null;
  return (await entryManageAccess(actorId, role, device.userId)).allowed ? device.userId : null;
}
