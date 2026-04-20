#!/usr/bin/env node
/**
 * Seed-Script: Test-Daten für einen bestehenden User.
 *
 * Erzeugt ~300 Einträge verteilt auf 5 abgeschlossene Sessions (10–150 Tage)
 * plus eine aktive Session am Ende — ideal zum Testen der Timeline-Buckets,
 * der fresh-Session-Fallbacks und der Dashboard-Gruppierungen.
 *
 * Usage:
 *   node scripts/seed-testdata.mjs <username>
 *   node scripts/seed-testdata.mjs <username> --clear    # bestehende Entries des Users vorher löschen
 *
 * Sicherheit:
 *   - Läuft nur auf Usern mit role="user" (nicht auf Admins).
 *   - Warnt, falls der User bereits viele Einträge hat.
 *
 * Bild-Platzhalter: Mix aus null und /icon-512.png (bestehendes Asset in public/).
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const HOUR = 3_600_000;
const DAY = 86_400_000;

// Pick an existing upload so the auth-guarded /api/uploads/[...path] route can serve it.
// If no uploads exist, imageUrl stays null for every entry (images are optional).
function discoverPlaceholders() {
  const uploadsDir = path.resolve(process.cwd(), "public/uploads");
  try {
    const files = fs.readdirSync(uploadsDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    return files.slice(0, 8).map((f) => `/api/uploads/${f}`);
  } catch {
    return [];
  }
}
const PLACEHOLDERS = discoverPlaceholders();

// ── helpers ───────────────────────────────────────────────────────────
function cuid() {
  return "c" + Date.now().toString(36) + randomBytes(8).toString("hex");
}
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function maybeImage() {
  if (PLACEHOLDERS.length === 0) return null;
  return Math.random() < 0.5 ? pick(PLACEHOLDERS) : null;
}

const lockNotes = ["Verschlossen", "Siegel gesetzt", null, null, "Abendverschluss", null];
const unlockNotes = ["Freigabe", "Öffnung wie abgesprochen", null, null];
const pruefungNotes = [null, null, null, "Kurz kontrolliert", null];

// Session-Spezifikationen (Länge in Tagen, ungefähre Entry-Zahl)
const SESSION_SPECS = [
  { days: 150, entries: 150 },
  { days: 60, entries: 70 },
  { days: 30, entries: 40 },
  { days: 20, entries: 25 },
  { days: 10, entries: 15 },
];

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const username = args.find((a) => !a.startsWith("--"));
  const clearFirst = args.includes("--clear");

  if (!username) {
    console.error("Usage: node scripts/seed-testdata.mjs <username> [--clear]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`User "${username}" nicht gefunden.`);
    process.exit(1);
  }
  if (user.role === "admin") {
    console.error(`User "${username}" ist Admin — Script bricht aus Sicherheitsgründen ab.`);
    process.exit(1);
  }

  const existingCount = await prisma.entry.count({ where: { userId: user.id } });
  if (existingCount > 0 && !clearFirst) {
    console.warn(`⚠️  User "${username}" hat bereits ${existingCount} Einträge. Neue Daten werden angehängt.`);
    console.warn(`   Mit --clear würden bestehende Entries zuvor gelöscht.`);
  }
  if (clearFirst && existingCount > 0) {
    console.log(`🧹 Lösche ${existingCount} bestehende Einträge...`);
    await prisma.entry.deleteMany({ where: { userId: user.id } });
  }

  console.log(`🌱 Seed für "${username}" (userId=${user.id})`);

  const entries = [];
  const counts = { VERSCHLUSS: 0, OEFFNEN: 0, PRUEFUNG: 0, ORGASMUS: 0 };

  // Wir legen die Sessions rückwärts ab: die jüngste abgeschlossene Session endet vor ~5 Tagen,
  // dann eine aktive Session davor/danach.
  //
  // Reihenfolge (chronologisch ältestes → jüngstes): Session 0 (längste, 150d) … Session 4 (10d)
  // Pausen dazwischen: 1-3 Tage.

  const now = Date.now();
  // Gap am Ende: vor 5 Tagen endet die letzte abgeschlossene Session.
  const lastSessionEnd = now - 5 * DAY;

  // Berechne Start der ältesten Session nach hinten.
  let cursor = lastSessionEnd;
  const sessionRanges = [];
  // Traverse from last (shortest) backward
  const reversed = [...SESSION_SPECS].reverse();
  for (const spec of reversed) {
    const end = cursor;
    const start = end - spec.days * DAY;
    sessionRanges.unshift({ start, end, spec });
    const gapDays = randInt(1, 3);
    cursor = start - gapDays * DAY;
  }

  // Jetzt: für jede Session Einträge erzeugen.
  for (let idx = 0; idx < sessionRanges.length; idx++) {
    const { start, end, spec } = sessionRanges[idx];
    const durationMs = end - start;

    // 1) VERSCHLUSS am Start
    entries.push({
      id: cuid(), userId: user.id, type: "VERSCHLUSS",
      startTime: new Date(start + rand(0, 5 * 60_000)),
      imageUrl: maybeImage(), note: pick(lockNotes),
      kontrollCode: null, oeffnenGrund: null, orgasmusArt: null,
      verifikationStatus: null, imageExifTime: null,
    });
    counts.VERSCHLUSS++;

    // 2) Reinigungen (OEFFNEN+VERSCHLUSS-Paare) alle 10-14 Tage, jeweils 5-20 min Pause.
    const cleaningTimes = [];
    let cleanCursor = start + rand(10, 14) * DAY;
    while (cleanCursor < end - 2 * DAY) {
      const pauseMin = rand(5, 20);
      cleaningTimes.push({ open: cleanCursor, close: cleanCursor + pauseMin * 60_000 });
      cleanCursor += rand(10, 14) * DAY;
    }
    for (const { open, close } of cleaningTimes) {
      entries.push({
        id: cuid(), userId: user.id, type: "OEFFNEN",
        startTime: new Date(open),
        imageUrl: null, note: "Reinigung",
        oeffnenGrund: "REINIGUNG", kontrollCode: null, orgasmusArt: null,
        verifikationStatus: null, imageExifTime: null,
      });
      counts.OEFFNEN++;
      entries.push({
        id: cuid(), userId: user.id, type: "VERSCHLUSS",
        startTime: new Date(close),
        imageUrl: maybeImage(), note: "Nach Reinigung",
        oeffnenGrund: null, kontrollCode: null, orgasmusArt: null,
        verifikationStatus: null, imageExifTime: null,
      });
      counts.VERSCHLUSS++;
    }

    // 3) PRUEFUNG-Einträge — so viele, dass Total der Session ~spec.entries erreicht.
    const bisherigeSessionEntries = 1 + cleaningTimes.length * 2 + 1; // VS am Start, Reinigungen, OEFFNEN am Ende
    const orgasmenCount = randInt(1, 2);
    const pruefungZiel = Math.max(0, spec.entries - bisherigeSessionEntries - orgasmenCount);

    for (let p = 0; p < pruefungZiel; p++) {
      // Zeitpunkt: zufällig im Session-Bereich, mindestens 1h nach Start und 1h vor Ende.
      const t = start + rand(HOUR, durationMs - HOUR);
      entries.push({
        id: cuid(), userId: user.id, type: "PRUEFUNG",
        startTime: new Date(t),
        imageUrl: maybeImage(), note: pick(pruefungNotes),
        oeffnenGrund: null, kontrollCode: null, orgasmusArt: null,
        verifikationStatus: Math.random() < 0.7 ? "ai" : null,
        imageExifTime: null,
      });
      counts.PRUEFUNG++;
    }

    // 4) ORGASMUS-Einträge: während der Session (innerhalb Reinigungs-Öffnung? nein — einfach irgendwo drin)
    for (let o = 0; o < orgasmenCount; o++) {
      const t = start + rand(HOUR, durationMs - HOUR);
      entries.push({
        id: cuid(), userId: user.id, type: "ORGASMUS",
        startTime: new Date(t),
        imageUrl: null, note: null,
        oeffnenGrund: null, kontrollCode: null,
        orgasmusArt: pick(["Orgasmus", "Orgasmus", "ruinierter Orgasmus"]),
        verifikationStatus: null, imageExifTime: null,
      });
      counts.ORGASMUS++;
    }

    // 5) OEFFNEN am Ende der Session
    entries.push({
      id: cuid(), userId: user.id, type: "OEFFNEN",
      startTime: new Date(end),
      imageUrl: null, note: pick(unlockNotes),
      oeffnenGrund: "KEYHOLDER", kontrollCode: null, orgasmusArt: null,
      verifikationStatus: null, imageExifTime: null,
    });
    counts.OEFFNEN++;
  }

  // 6) Aktive Session am Ende: Start vor 3 Tagen, noch kein OEFFNEN.
  const activeStart = now - 3 * DAY;
  entries.push({
    id: cuid(), userId: user.id, type: "VERSCHLUSS",
    startTime: new Date(activeStart),
    imageUrl: maybeImage(), note: "Aktuelle Session",
    kontrollCode: null, oeffnenGrund: null, orgasmusArt: null,
    verifikationStatus: null, imageExifTime: null,
  });
  counts.VERSCHLUSS++;
  // 2-3 Prüfungen in der aktiven Session
  const activePruefungen = randInt(2, 3);
  for (let p = 0; p < activePruefungen; p++) {
    const t = activeStart + rand(HOUR, (now - activeStart) - HOUR);
    entries.push({
      id: cuid(), userId: user.id, type: "PRUEFUNG",
      startTime: new Date(t),
      imageUrl: maybeImage(), note: null,
      oeffnenGrund: null, kontrollCode: null, orgasmusArt: null,
      verifikationStatus: Math.random() < 0.7 ? "ai" : null,
      imageExifTime: null,
    });
    counts.PRUEFUNG++;
  }

  // sortieren + in Batches schreiben
  entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const BATCH = 50;
  for (let i = 0; i < entries.length; i += BATCH) {
    await prisma.entry.createMany({ data: entries.slice(i, i + BATCH) });
  }

  const firstTime = entries[0].startTime;
  const lastTime = entries[entries.length - 1].startTime;

  console.log("");
  console.log(`✅ Seed abgeschlossen für "${username}"`);
  console.log(`   Sessions: 5 abgeschlossen + 1 aktive`);
  console.log(`   Einträge gesamt: ${entries.length}`);
  console.log(`     VERSCHLUSS: ${counts.VERSCHLUSS}`);
  console.log(`     OEFFNEN:    ${counts.OEFFNEN}`);
  console.log(`     PRUEFUNG:   ${counts.PRUEFUNG}`);
  console.log(`     ORGASMUS:   ${counts.ORGASMUS}`);
  console.log(`   Zeitraum:   ${firstTime.toISOString()} – ${lastTime.toISOString()}`);
}

main()
  .catch((e) => { console.error("❌ Seed fehlgeschlagen:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
