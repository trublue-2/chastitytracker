#!/usr/bin/env node
"use strict";

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const prisma = new PrismaClient();

// Das frühere Raster der Keyholder-Meldungen. Seit dem Stufen-Modell wird es NICHT mehr angelegt —
// diese Liste ist nur noch der Lese-Schlüssel der einmaligen Übernahme in die Kanal-Stufen
// (`backfillNotifyLevels`) und beschreibt damit Bestand, nicht geltendes Verhalten.
// Frühere Spiegelung von src/lib/constants.ts — seed.js is plain CJS
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
  "TASK_PROOF_LATE",
  "OFFENSE_STATEMENT",
  "PENALTY_REPORTED_DONE",
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
      // Muss `KG_BUILTIN_NAME` aus `src/lib/deviceCategories.ts` spiegeln — `appName.test.ts`
      // hält die beiden zusammen. Wichtig, weil `docker-entrypoint.sh` erst `migrate deploy`
      // und DANN den Seed fährt: auf einer neuen Instanz läuft die Umbenennungs-Migration über
      // eine leere Tabelle, und was der Seed danach schreibt, korrigiert sie nie mehr.
      name: "Chastity Device",
      slug: "kg",
      color: "cat-steel",
      icon: "Lock",
      isBuiltIn: true,
      trackingEnabled: true,
      sortOrder: 0,
    },
  });
}

// Merker der einmaligen Übernahme in die Kanal-Stufen. In `AppMeta`, nicht am User: die Übernahme
// betrifft die ganze Instanz, und ein zweiter Lauf würde eine inzwischen von Hand gesetzte Stufe
// wieder überschreiben.
const NOTIFY_LEVELS_BACKFILL_KEY = "notifyLevelsBackfilledAt";

/**
 * Übernimmt die alten Schalter EINMALIG in die drei Kanal-Stufen (`User.notifyMail` …).
 *
 * Je Kanal: war der eigene Schalter für Meldungen an mich an, gilt `all`. War er aus, bekam der
 * Empfänger als Keyholder über das Raster seiner Subs aber trotzdem Meldungen (das Raster hing am
 * Sub und ignorierte seinen eigenen Schalter), gilt `important` — so verliert niemand still etwas,
 * das er bisher bekam. Sonst `off`.
 *
 * Eine fehlende Zeile hiess „an" (siehe notificationPrefs.ts) und wird deshalb überall wie „an"
 * gelesen — beim eigenen Schalter (`MESSAGE_RECEIVED`) wie im Raster (`matrixAllows`).
 */
async function backfillNotifyLevels() {
  if (await prisma.appMeta.findUnique({ where: { key: NOTIFY_LEVELS_BACKFILL_KEY } })) return 0;

  const [users, prefs, rels] = await Promise.all([
    prisma.user.findMany({ select: { id: true, role: true } }),
    prisma.notificationPreference.findMany({ select: { userId: true, eventType: true, mail: true, push: true, telegram: true } }),
    prisma.adminUserRelationship.findMany({ select: { adminId: true, userId: true } }),
  ]);

  // EIN Durchgang über die Zeilen, zwei Nachschlagewerke daraus: der eigene Schalter je Empfänger,
  // und je TRÄGER, ob sein Raster einen Kanal überhaupt noch erlaubte. Vorher rechnete das jede
  // Kombination aus Empfänger und Träger neu — bei 25 Konten die Zeilen-Tabelle 625-mal.
  const ownSwitch = new Map();
  const matrixAny = new Map();
  for (const p of prefs) {
    if (p.eventType === "MESSAGE_RECEIVED") { ownSwitch.set(p.userId, p); continue; }
    if (!NOTIFICATION_EVENT_TYPES.includes(p.eventType)) continue;
    const acc = matrixAny.get(p.userId) || { mail: false, push: false, telegram: false, rows: 0 };
    acc.rows++;
    acc.mail = acc.mail || p.mail;
    acc.push = acc.push || p.push;
    acc.telegram = acc.telegram || p.telegram;
    matrixAny.set(p.userId, acc);
  }
  const allIds = users.map((u) => u.id);

  /**
   * Liess das Raster dieses TRÄGERS den Kanal noch zu?
   *
   * Eine FEHLENDE Zeile hiess „an" (`notificationPrefs.ts`) — deshalb reicht es nicht, über die
   * vorhandenen Zeilen zu odern: ein Träger, der nach dem letzten Containerstart angelegt wurde, hat
   * gar keine, und seine Meldungen gingen trotzdem hinaus. Als „aus" gelesen nähme die Übernahme
   * einem Keyholder mit eigenem Schalter „aus" auch noch das Wichtige — also genau die Zustellung,
   * die das Stufen-Modell ihm erhalten will.
   */
  const matrixAllows = (subId, channel) => {
    const m = matrixAny.get(subId);
    if (!m || m.rows < NOTIFICATION_EVENT_TYPES.length) return true;
    return m[channel];
  };

  let migrated = 0;
  for (const u of users) {
    const own = ownSwitch.get(u.id);
    // Über wen bekam dieser Empfänger Keyholder-Meldungen? Globale Admins über alle, sonst über die
    // ihm zugewiesenen Träger.
    const subIds = u.role === "admin" ? allIds : rels.filter((r) => r.adminId === u.id).map((r) => r.userId);
    const level = (channel) => {
      if (own ? own[channel] : true) return "all";
      return subIds.some((id) => matrixAllows(id, channel)) ? "important" : "off";
    };

    try {
      await prisma.user.update({
        where: { id: u.id },
        data: { notifyMail: level("mail"), notifyPush: level("push"), notifyTelegram: level("telegram") },
      });
      migrated++;
    } catch (e) {
      // Wie bei der Orgasmus-Config: ein einzelner Fehlschlag darf den Containerstart nicht fällen.
      console.error(`⚠ Kanal-Stufen für User ${u.id} übersprungen:`, e);
    }
  }

  await prisma.appMeta.create({ data: { key: NOTIFY_LEVELS_BACKFILL_KEY, value: new Date().toISOString() } });
  return migrated;
}

// Mirror of AI_AUTHOR in src/lib/constants.ts — seed.js is plain CJS and can't import from src.
// Kanonische Begründung der Namensgrenze steht dort; hier nur die Durchsetzung.
const AI_AUTHOR = "ai";
const DEFAULT_ADMIN_USERNAME = "admin";

/**
 * Der Admin-Name, der wirklich vergeben wird.
 *
 * `ai` ist keine freie Wahl, sondern die Kennung „von der KI erledigt" in den Autoren-Feldern
 * (`StrafeRecord.judgedBy`, `ManualOffense.createdBy`, `KontrollAnforderung.createdBy`, …). Ein
 * Admin mit diesem Namen bekäme jede seiner Meldungen beim Träger als KI-Zeile zugestellt und jedes
 * seiner Urteile im Strafbuch mit KI-Hinweis — eine Falschaussage, die niemand mehr korrigieren
 * kann, weil sie in den Zeilen steht. Die Benutzer-API verlangt mindestens drei Zeichen; dieser Weg
 * hier war der einzige, der daran vorbeiführte.
 *
 * AUSWEICHEN statt Abbruch: eine Instanz, die nicht startet, ist der schlechtere Ausgang als eine
 * mit umbenanntem Admin — das Portal legt Instanzen unbeaufsichtigt an, und ein harter Abbruch
 * hinterliesse einen Container, der beim Erststart in einer Neustart-Schleife hängt, ohne dass
 * jemand an die Ursache käme. Der Name ist zudem nachträglich änderbar, ein toter Erststart nicht.
 * Dafür ist es NICHT still: die Zeile unten steht im Container-Log über den Zugangsdaten, damit der
 * Betreiber nicht mit dem falschen Benutzernamen vor dem Login-Formular sitzt.
 *
 * Gross/klein egal: `AI` bräche zwar die Abbildung nicht (verglichen wird exakt), wäre aber genau
 * die Sorte Beinahe-Kollision, die beim nächsten Vergleich mit `toLowerCase()` zuschlägt.
 */
function safeAdminUsername(raw) {
  const username = raw || DEFAULT_ADMIN_USERNAME;
  if (username.toLowerCase() !== AI_AUTHOR) return username;
  console.warn(
    `⚠ ADMIN_USERNAME='${username}' ist für die KI-Kennung reserviert — es wird '${DEFAULT_ADMIN_USERNAME}' verwendet.`,
  );
  return DEFAULT_ADMIN_USERNAME;
}

async function main() {
  const username = safeAdminUsername(process.env.ADMIN_USERNAME);
  const email = process.env.ADMIN_EMAIL || null;
  // Sprache des Admin-Accounts beim ERSTEN Anlegen. Das Portal gibt hier die Sprache mit, in der
  // sich der Nutzer registriert hat; ohne sie startete jede Instanz auf Deutsch, und das Portal
  // las diesen Default später als vermeintliche Nutzerwahl zurück und schrieb seine Anschreiben
  // danach. Wirkt nur bei der Neuanlage — die Wahl eines bestehenden Users wird nie überschrieben.
  // Mirror of toLocale() in src/lib/constants.ts — seed.js is plain CJS and can't import from src.
  const locale = process.env.ADMIN_LOCALE === "en" ? "en" : "de";
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
        data: { username, email, passwordHash, role: "admin", locale },
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

  // Einmalige Übernahme der alten Schalter in die Kanal-Stufen. Die Raster-Zeilen werden nicht mehr
  // angelegt: seit dem Stufen-Modell entscheidet der Empfänger, und die Übernahme liest den Bestand
  // nur noch.
  const migratedLevels = await backfillNotifyLevels();
  if (migratedLevels > 0) {
    console.log(`→ Kanal-Stufen für ${migratedLevels} Konten aus den alten Schaltern übernommen.`);
  }

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

module.exports = { backfillOrgasmusArtenConfig, ORGASM_MAIN_WITH_SUBS, ART_SEP, safeAdminUsername, AI_AUTHOR, NOTIFICATION_EVENT_TYPES };
