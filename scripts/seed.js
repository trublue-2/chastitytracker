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

// Mirror of src/lib/reasonsService.ts (ART_SEP + DEFAULT_ORGASM_ARTEN sub-combos + backfill logic).
// seed.js is plain CJS and can't import from src — keep in sync. Tested there via
// backfillOrgasmusArtenConfig in reasonsService.test.ts.
const ART_SEP = " – ";
const ORGASM_MAIN_WITH_SUBS = {
  Orgasmus: [
    `Orgasmus${ART_SEP}Masturbation`,
    `Orgasmus${ART_SEP}Geschlechtsverkehr`,
    `Orgasmus${ART_SEP}durch andere Person`,
    `Orgasmus${ART_SEP}durch Technik`,
  ],
};

/** Expandiert blanke Built-in-Hauptart mit Unterarten → Kombis. Rückgabe: neuer JSON-String bei
 *  Änderung, sonst null (idempotent; null/schon-Kombis/custom → keine Änderung). */
function backfillOrgasmusArtenConfig(raw) {
  if (raw == null) return null;
  let arr;
  try { arr = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  let changed = false;
  for (const item of arr) {
    const code = item && item.code;
    const label = item && typeof item.label === "string" ? item.label.trim() : "";
    if (typeof code === "string" && !label && ORGASM_MAIN_WITH_SUBS[code]) {
      for (const combo of ORGASM_MAIN_WITH_SUBS[code]) {
        if (!seen.has(combo)) { seen.add(combo); out.push({ code: combo }); }
      }
      changed = true;
      continue;
    }
    if (typeof code === "string" && !seen.has(code)) {
      seen.add(code);
      out.push(label ? { code, label } : { code });
    }
  }
  return changed ? JSON.stringify(out) : null;
}

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

  // SECURITY: Existiert bereits IRGENDEIN Admin, wird hier NICHTS verändert. Die frühere
  // Ein-Query-Variante (findFirst mit OR über role/username/email, ohne orderBy) konnte statt
  // des Admins einen NORMALEN User zurückgeben, der zufällig auf ADMIN_USERNAME/ADMIN_EMAIL
  // matcht (z.B. gemeinsame E-Mail des Paars) — und beförderte ihn bei jedem Container-Start
  // zum Admin, obwohl längst ein Admin existierte ("nach dem Update sind beide Admin").
  // Promotion/Erstellung ist nur als Erststart-/Recovery-Pfad gedacht: wenn KEIN Admin existiert.
  // orderBy spiegelt src/app/api/portal-login/route.ts ("der" Admin = ältester Admin), damit
  // seed.js und Portal-Login bei mehreren Admins denselben User wählen.
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" } });

  let adminUser;

  if (existingAdmin) {
    adminUser = existingAdmin;
    console.log("→ Admin bereits vorhanden — keine Änderung.");
  } else {
    const matchedUser = await prisma.user.findFirst({
      where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
    });
    if (matchedUser) {
      // Kein Admin vorhanden, aber ein User matcht die konfigurierten Zugangsdaten — befördern
      // (Recovery-Pfad, z.B. wenn der einzige Admin versehentlich zurückgestuft wurde).
      adminUser = await prisma.user.update({
        where: { id: matchedUser.id },
        data: { role: "admin" },
      });
      console.log(`→ Kein Admin vorhanden — Benutzer '${matchedUser.username}' zum Admin befördert.`);
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
  }

  await ensureKgCategory(adminUser.id);

  // Backfill notification prefs for ALL users (existing instances + new admin).
  // createMany + skipDuplicates means existing explicit opt-outs are preserved.
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  await Promise.all(allUsers.map((u) => ensureNotificationPrefs(u.id)));

  // Backfill: Orgasmus-Configs, die vor der Unterarten-Version gespeichert wurden (nur Hauptarten),
  // auf volle Kombis migrieren — sonst fehlt im Formular das Unterart-Dropdown. Idempotent.
  const cfgUsers = await prisma.user.findMany({ select: { id: true, orgasmusArtenConfig: true } });
  let migratedConfigs = 0;
  for (const u of cfgUsers) {
    try {
      const next = backfillOrgasmusArtenConfig(u.orgasmusArtenConfig);
      if (next !== null) {
        await prisma.user.update({ where: { id: u.id }, data: { orgasmusArtenConfig: next } });
        migratedConfigs++;
      }
    } catch (e) {
      // Ein einzelner fehlgeschlagener Backfill (z.B. transientes SQLITE_BUSY) darf den ganzen
      // Container-Start NICHT fällen — loggen und mit der nächsten Instanz weitermachen.
      console.error(`⚠ Orgasmus-Config-Migration für User ${u.id} übersprungen:`, e);
    }
  }
  if (migratedConfigs > 0) {
    console.log(`→ ${migratedConfigs} Orgasmus-Config(s) auf Unterarten-Kombis migriert.`);
  }

  // Assign orphaned entries (no userId) to the admin — raw SQL because userId is non-nullable in schema.
  const orphaned = await prisma.$executeRaw`UPDATE "Entry" SET "userId" = ${adminUser.id} WHERE "userId" IS NULL`;
  if (orphaned > 0) {
    console.log(`→ ${orphaned} verwaiste Einträge dem Admin zugewiesen.`);
  }
}

// Beim direkten Ausführen (Container-Entrypoint) läuft main(); beim `require` (Unit-Test des Mirrors)
// nur die Exports, ohne DB-Verbindung/Seed.
if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { backfillOrgasmusArtenConfig, ORGASM_MAIN_WITH_SUBS, ART_SEP };
