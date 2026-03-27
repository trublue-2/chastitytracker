/**
 * Seed script: AdminUserRelationship
 *
 * Creates relationships between all existing admins and all existing users.
 * Safe to run multiple times (uses upsert with @@unique([adminId, userId])).
 *
 * Usage:
 *   DATABASE_URL="file:./dev.db" npx tsx prisma/seed-admin-relationships.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admins = await prisma.user.findMany({ where: { role: "admin" } });
  const users  = await prisma.user.findMany({ where: { role: "user"  } });

  if (admins.length === 0) {
    console.log("No admins found — nothing to seed.");
    return;
  }
  if (users.length === 0) {
    console.log("No users found — nothing to seed.");
    return;
  }

  let created = 0;
  for (const admin of admins) {
    for (const user of users) {
      const existing = await prisma.adminUserRelationship.findUnique({
        where: { adminId_userId: { adminId: admin.id, userId: user.id } },
      });
      if (!existing) {
        await prisma.adminUserRelationship.create({
          data: { adminId: admin.id, userId: user.id },
        });
        created++;
      }
    }
  }

  console.log(`Seeded ${created} AdminUserRelationship(s) (${admins.length} admin(s) × ${users.length} user(s)).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
