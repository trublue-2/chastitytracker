#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  let adminUser = await prisma.user.findFirst({ where: { role: "admin" } });

  if (!adminUser) {
    const username = process.env.ADMIN_USERNAME || "admin";
    const password = process.env.ADMIN_PASSWORD || "admin123";
    const email = process.env.ADMIN_EMAIL || null;
    const passwordHash = await bcrypt.hash(password, 12);

    adminUser = await prisma.user.create({
      data: { username, email, passwordHash, role: "admin" },
    });

    console.log(`→ Admin-Benutzer '${username}' angelegt.`);
  } else {
    console.log("→ Benutzer bereits vorhanden.");
  }

  // Verwaiste Entries (ohne userId) dem Admin zuweisen (via Raw-SQL da userId non-nullable im Schema)
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
