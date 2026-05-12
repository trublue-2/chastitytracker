#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function ensureKgCategory(userId) {
  const categoryId = `kgcat_${userId}`;
  await prisma.deviceCategory.upsert({
    where: { id: categoryId },
    update: {},
    create: {
      id: categoryId,
      userId,
      name: "KG",
      slug: "kg",
      color: "cat-steel",
      icon: "Lock",
      isBuiltIn: true,
      trackingEnabled: true,
      sortOrder: 0,
    },
  });
}

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const email = process.env.ADMIN_EMAIL || null;

  // Single query: find an existing admin OR a user that matches the configured credentials.
  // This handles first-start, re-deployments, and the case where a user exists but isn't admin.
  const matchedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { role: "admin" },
        { username },
        ...(email ? [{ email }] : []),
      ],
    },
  });

  let adminUser;

  if (matchedUser?.role === "admin") {
    adminUser = matchedUser;
    console.log("→ Benutzer bereits vorhanden.");
  } else if (matchedUser) {
    // User exists (matching username/email) but isn't admin — promote.
    adminUser = await prisma.user.update({
      where: { id: matchedUser.id },
      data: { role: "admin" },
    });
    console.log(`→ Benutzer '${matchedUser.username}' zum Admin befördert.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    adminUser = await prisma.user.create({
      data: { username, email, passwordHash, role: "admin" },
    });
    console.log("┌─────────────────────────────────────────────────────┐");
    console.log("│  ERSTER START – Zugangsdaten                        │");
    console.log(`│  Benutzername: ${username.padEnd(37)}│`);
    console.log(`│  Passwort:     ${password.padEnd(37)}│`);
    console.log("│  Bitte nach dem ersten Einloggen ändern!            │");
    console.log("└─────────────────────────────────────────────────────┘");
  }

  await ensureKgCategory(adminUser.id);

  // Assign orphaned entries (no userId) to the admin — raw SQL because userId is non-nullable in schema.
  const orphaned = await prisma.$executeRaw`UPDATE "Entry" SET "userId" = ${adminUser.id} WHERE "userId" IS NULL`;
  if (orphaned > 0) {
    console.log(`→ ${orphaned} verwaiste Einträge dem Admin zugewiesen.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
