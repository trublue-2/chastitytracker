#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

// Mirror of src/lib/constants.ts NOTIFICATION_EVENT_TYPES — seed.js is plain CJS
// and can't import from src. Keep both lists in sync.
const NOTIFICATION_EVENT_TYPES = [
  "VERSCHLUSS",
  "OEFFNUNG_IMMER",
  "OEFFNUNG_VERBOTEN",
  "ORGASMUS",
  "KONTROLLE_FREIWILLIG",
  "KONTROLLE_ANGEFORDERT",
  "WEAR_BEGIN_ANY",
  "WEAR_END_ANY",
];

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

async function ensureNotificationPrefs(userId) {
  await Promise.all(
    NOTIFICATION_EVENT_TYPES.map((eventType) =>
      prisma.notificationPreference.upsert({
        where: { userId_eventType: { userId, eventType } },
        update: {},
        create: { userId, eventType, mail: true, push: true },
      })
    )
  );
}

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const email = process.env.ADMIN_EMAIL || null;
  // C1: KEIN ratebarer Default ("admin123"). Ohne ADMIN_PASSWORD wird ein starkes Zufalls-
  // passwort erzeugt und (nur beim Erststart, s.u.) genau einmal ins Log geschrieben.
  const passwordFromEnv = !!process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString("base64url");

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
    if (passwordFromEnv) {
      console.log("│  Passwort:     (aus ADMIN_PASSWORD)                 │");
      console.log("│  Bitte nach dem ersten Einloggen ändern!            │");
    } else {
      // Einmaliges Anzeigen des generierten Passworts — JETZT notieren, es wird nie wieder geloggt.
      console.log(`│  Passwort:     ${password.padEnd(37)}│`);
      console.log("│  ⚠ Generiert (kein ADMIN_PASSWORD gesetzt) — JETZT  │");
      console.log("│    notieren und nach dem Login ändern!              │");
    }
    console.log("└─────────────────────────────────────────────────────┘");
  }

  await ensureKgCategory(adminUser.id);

  // Backfill notification prefs for ALL users (existing instances + new admin).
  // createMany + skipDuplicates means existing explicit opt-outs are preserved.
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(allUsers.map((u) => ensureNotificationPrefs(u.id)));

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
