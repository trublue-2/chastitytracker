/**
 * Seed-Script: Realistische Demo-Daten für KeyHolder + Keuschling
 *
 * Ausführung:  npx tsx scripts/seed-demo.ts
 *
 * - Löscht vorhandene KeyHolder/Keuschling-Daten (idempotent)
 * - Erzeugt ~1 Jahr Historie (Apr 2025 – Apr 2026)
 * - ~60 % Verschlussrate, Sessions 12 h – 45 d
 * - Kontrollen ca. alle 2 Tage, ~10 % zu spät → Strafbuch
 * - 5 Verschlussanforderungen, alle zu spät erfüllt
 * - Placeholder-Bilder (blurred) für Verschluss + Prüfung
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";

const prisma = new PrismaClient();
const UPLOADS = path.resolve(__dirname, "../data/uploads");
const HOUR = 3_600_000;
const DAY = 86_400_000;

// ── helpers ───────────────────────────────────────────────────────────
function cuid(): string {
  return (
    "c" +
    Date.now().toString(36) +
    randomBytes(8).toString("hex")
  );
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function code5(): string {
  return String(10000 + Math.floor(Math.random() * 90000));
}

// weighted random session duration (hours) — mostly short, some very long
function sessionHours(): number {
  const r = Math.random();
  if (r < 0.30) return rand(12, 48);       // 30 % short (12h–2d)
  if (r < 0.55) return rand(48, 168);       // 25 % medium (2d–7d)
  if (r < 0.80) return rand(168, 504);      // 25 % long (7d–21d)
  if (r < 0.95) return rand(504, 720);      // 15 % very long (21d–30d)
  return rand(720, 1080);                   // 5 % extreme (30d–45d)
}

// ── placeholder images ───────────────────────────────────────────────
const COLORS = [
  { r: 40, g: 40, b: 50 },
  { r: 30, g: 35, b: 55 },
  { r: 50, g: 35, b: 55 },
  { r: 35, g: 45, b: 40 },
  { r: 45, g: 40, b: 35 },
  { r: 55, g: 30, b: 45 },
  { r: 30, g: 30, b: 40 },
  { r: 40, g: 50, b: 55 },
  { r: 50, g: 45, b: 50 },
  { r: 35, g: 40, b: 50 },
  { r: 45, g: 35, b: 40 },
  { r: 30, g: 45, b: 55 },
];

const placeholderPaths: string[] = [];

async function generatePlaceholders() {
  fs.mkdirSync(UPLOADS, { recursive: true });

  for (let i = 0; i < COLORS.length; i++) {
    const c = COLORS[i];
    const fname = `seed-placeholder-${i}.jpg`;
    const fpath = path.join(UPLOADS, fname);

    // create noisy color block, then blur heavily
    const width = 800;
    const height = 1200;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);
    for (let p = 0; p < width * height; p++) {
      const noise = () => Math.floor(rand(-20, 20));
      raw[p * 3] = Math.max(0, Math.min(255, c.r + noise()));
      raw[p * 3 + 1] = Math.max(0, Math.min(255, c.g + noise()));
      raw[p * 3 + 2] = Math.max(0, Math.min(255, c.b + noise()));
    }

    await sharp(raw, { raw: { width, height, channels } })
      .blur(40)
      .jpeg({ quality: 60 })
      .toFile(fpath);

    placeholderPaths.push(`/api/uploads/${fname}`);
  }

  console.log(`  ✓ ${placeholderPaths.length} placeholder images`);
}

// ── main ──────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding demo data...\n");

  // 0. generate placeholder images
  await generatePlaceholders();

  // 1. clean up existing KeyHolder/Keuschling data
  const existing = await prisma.user.findMany({
    where: { username: { in: ["KeyHolder", "Keuschling"] } },
  });
  for (const u of existing) {
    await prisma.strafeRecord.deleteMany({ where: { userId: u.id } });
    await prisma.kontrollAnforderung.deleteMany({ where: { userId: u.id } });
    await prisma.verschlussAnforderung.deleteMany({ where: { userId: u.id } });
    await prisma.trainingVorgabe.deleteMany({ where: { userId: u.id } });
    await prisma.notificationPreference.deleteMany({ where: { userId: u.id } });
    await prisma.pushSubscription.deleteMany({ where: { userId: u.id } });
    await prisma.entry.deleteMany({ where: { userId: u.id } });
    await prisma.adminUserRelationship.deleteMany({
      where: { OR: [{ adminId: u.id }, { userId: u.id }] },
    });
  }
  await prisma.user.deleteMany({
    where: { username: { in: ["KeyHolder", "Keuschling"] } },
  });
  console.log("  ✓ cleaned up existing data");

  // 2. create users
  const adminHash = await bcrypt.hash("keyholder123", 12);
  const userHash = await bcrypt.hash("keuschling123", 12);

  const admin = await prisma.user.create({
    data: {
      id: cuid(),
      username: "KeyHolder",
      passwordHash: adminHash,
      role: "admin",
      email: "keyholder@example.com",
      reinigungErlaubt: true,
      reinigungMaxMinuten: 15,
    },
  });

  const user = await prisma.user.create({
    data: {
      id: cuid(),
      username: "Keuschling",
      passwordHash: userHash,
      role: "user",
      email: "keuschling@example.com",
    },
  });

  await prisma.adminUserRelationship.create({
    data: { id: cuid(), adminId: admin.id, userId: user.id },
  });

  console.log("  ✓ users: KeyHolder (admin), Keuschling (user)");

  // 3. generate entries over ~1 year
  const START = new Date("2025-04-01T08:00:00+02:00").getTime();
  const NOW = Date.now();

  const entries: {
    id: string;
    userId: string;
    type: string;
    startTime: Date;
    imageUrl: string | null;
    note: string | null;
    oeffnenGrund: string | null;
    orgasmusArt: string | null;
    kontrollCode: string | null;
    verifikationStatus: string | null;
    imageExifTime: Date | null;
  }[] = [];

  const kontrollen: {
    id: string;
    userId: string;
    code: string;
    kommentar: string | null;
    deadline: Date;
    createdAt: Date;
    fulfilledAt: Date | null;
    withdrawnAt: Date | null;
    entryId: string | null;
  }[] = [];

  const strafen: {
    id: string;
    userId: string;
    offenseType: string;
    refId: string;
    bestraftDatum: Date;
    notiz: string | null;
  }[] = [];

  let cursor = START;
  let totalLocked = 0;
  let totalTime = 0;
  let sessionCount = 0;

  // notes for variety
  const lockNotes = [
    "Verschlossen wie vereinbart",
    "Neues Siegel angelegt",
    "Siegel Nr. kontrolliert",
    null,
    null,
    null,
    "Abendverschluss",
    null,
  ];

  const unlockNotes = [
    "Freigabe durch KeyHolder",
    "Planmässige Öffnung",
    null,
    null,
    "Kurze Pause vereinbart",
    null,
  ];

  while (cursor < NOW - 7 * DAY) {
    // ── lock session ──
    const durationH = sessionHours();
    const durationMs = durationH * HOUR;
    const lockTime = cursor + rand(0, 2 * HOUR); // small random offset

    if (lockTime + durationMs > NOW - DAY) break; // leave room for current session

    const lockId = cuid();
    entries.push({
      id: lockId,
      userId: user.id,
      type: "VERSCHLUSS",
      startTime: new Date(lockTime),
      imageUrl: pick(placeholderPaths),
      note: pick(lockNotes),
      oeffnenGrund: null,
      orgasmusArt: null,
      kontrollCode: null,
      verifikationStatus: null,
      imageExifTime: new Date(lockTime - rand(0, 60000)),
    });

    // occasional cleaning interruptions (for sessions > 3 days)
    if (durationH > 72 && Math.random() < 0.3) {
      const cleanTime = lockTime + rand(24 * HOUR, Math.min(durationMs * 0.5, 72 * HOUR));
      entries.push({
        id: cuid(),
        userId: user.id,
        type: "OEFFNEN",
        startTime: new Date(cleanTime),
        imageUrl: null,
        note: "Reinigung",
        oeffnenGrund: "REINIGUNG",
        orgasmusArt: null,
        kontrollCode: null,
        verifikationStatus: null,
        imageExifTime: null,
      });
      entries.push({
        id: cuid(),
        userId: user.id,
        type: "VERSCHLUSS",
        startTime: new Date(cleanTime + rand(5, 12) * 60000), // 5-12 min
        imageUrl: pick(placeholderPaths),
        note: "Nach Reinigung wieder verschlossen",
        oeffnenGrund: null,
        orgasmusArt: null,
        kontrollCode: null,
        verifikationStatus: null,
        imageExifTime: null,
      });
    }

    // ── controls during this session ──
    let controlCursor = lockTime + rand(6 * HOUR, 12 * HOUR);
    let controlCount = 0;
    while (controlCursor < lockTime + durationMs - 2 * HOUR) {
      const kontrolleId = cuid();
      const kontrolleCode = code5();
      const kontrolleCreated = new Date(controlCursor);
      const kontrolleDeadline = new Date(controlCursor + 4 * HOUR);

      const isLate = Math.random() < 0.10;

      if (isLate) {
        // late or missed
        const missed = Math.random() < 0.3; // 30% of late ones = completely missed
        const pruefungId = missed ? null : cuid();
        const fulfilledTime = missed
          ? null
          : new Date(controlCursor + 4 * HOUR + rand(30, 180) * 60000); // 30min-3h late

        if (pruefungId && fulfilledTime) {
          entries.push({
            id: pruefungId,
            userId: user.id,
            type: "PRUEFUNG",
            startTime: fulfilledTime,
            imageUrl: pick(placeholderPaths),
            note: "Verspätete Kontrolle",
            oeffnenGrund: null,
            orgasmusArt: null,
            kontrollCode: kontrolleCode,
            verifikationStatus: "ai",
            imageExifTime: new Date(fulfilledTime.getTime() - rand(0, 30000)),
          });
        }

        kontrollen.push({
          id: kontrolleId,
          userId: user.id,
          code: kontrolleCode,
          kommentar: missed ? null : "Zu spät eingereicht",
          deadline: kontrolleDeadline,
          createdAt: kontrolleCreated,
          fulfilledAt: fulfilledTime,
          withdrawnAt: null,
          entryId: pruefungId,
        });

        strafen.push({
          id: cuid(),
          userId: user.id,
          offenseType: "KONTROLLANFORDERUNG",
          refId: kontrolleId,
          bestraftDatum: kontrolleDeadline,
          notiz: missed ? "Kontrolle komplett verpasst" : "Kontrolle zu spät eingereicht",
        });
      } else {
        // on time
        const pruefungId = cuid();
        const responseTime = new Date(controlCursor + rand(15, 180) * 60000); // 15min-3h

        entries.push({
          id: pruefungId,
          userId: user.id,
          type: "PRUEFUNG",
          startTime: responseTime,
          imageUrl: pick(placeholderPaths),
          note: null,
          oeffnenGrund: null,
          orgasmusArt: null,
          kontrollCode: kontrolleCode,
          verifikationStatus: pick(["ai", "ai", "ai", "manual"]),
          imageExifTime: new Date(responseTime.getTime() - rand(0, 30000)),
        });

        kontrollen.push({
          id: kontrolleId,
          userId: user.id,
          code: kontrolleCode,
          kommentar: null,
          deadline: kontrolleDeadline,
          createdAt: kontrolleCreated,
          fulfilledAt: responseTime,
          withdrawnAt: null,
          entryId: pruefungId,
        });
      }

      controlCount++;
      // interval: more frequent at start, then taper off
      const interval =
        controlCount <= 3
          ? rand(8 * HOUR, 16 * HOUR)    // first 3: every 8-16h
          : rand(36 * HOUR, 60 * HOUR);  // after: every 1.5-2.5 days
      controlCursor += interval;
    }

    // ── unlock ──
    const unlockTime = lockTime + durationMs;
    entries.push({
      id: cuid(),
      userId: user.id,
      type: "OEFFNEN",
      startTime: new Date(unlockTime),
      imageUrl: null,
      note: pick(unlockNotes),
      oeffnenGrund: "KEYHOLDER",
      orgasmusArt: null,
      kontrollCode: null,
      verifikationStatus: null,
      imageExifTime: null,
    });

    totalLocked += durationMs;
    sessionCount++;

    // ── open phase ──
    // target ~60% lock rate: openPhase ≈ durationMs * (40/60)
    const targetOpenRatio = 0.4 / 0.6;
    const openDuration = durationMs * targetOpenRatio * rand(0.6, 1.4);
    const openEnd = unlockTime + openDuration;

    // orgasms during open phase (1-3 per open phase, sometimes none)
    if (Math.random() < 0.6) {
      const orgCount = Math.random() < 0.7 ? 1 : (Math.random() < 0.7 ? 2 : 3);
      for (let o = 0; o < orgCount; o++) {
        const orgTime = unlockTime + rand(2 * HOUR, openDuration - HOUR);
        if (orgTime < openEnd && orgTime < NOW) {
          entries.push({
            id: cuid(),
            userId: user.id,
            type: "ORGASMUS",
            startTime: new Date(orgTime),
            imageUrl: null,
            note: null,
            oeffnenGrund: null,
            orgasmusArt: pick(["Orgasmus", "Orgasmus", "Orgasmus", "ruinierter Orgasmus"]),
            kontrollCode: null,
            verifikationStatus: null,
            imageExifTime: null,
          });
        }
      }
    }

    totalTime += durationMs + openDuration;
    cursor = openEnd;
  }

  // ── current open session (locked right now) ──
  const currentLockTime = cursor + rand(HOUR, 4 * HOUR);
  if (currentLockTime < NOW) {
    entries.push({
      id: cuid(),
      userId: user.id,
      type: "VERSCHLUSS",
      startTime: new Date(currentLockTime),
      imageUrl: pick(placeholderPaths),
      note: "Aktuelle Session",
      oeffnenGrund: null,
      orgasmusArt: null,
      kontrollCode: null,
      verifikationStatus: null,
      imageExifTime: new Date(currentLockTime - rand(0, 30000)),
    });

    // one pending control for current session
    const pendingControlTime = Math.max(currentLockTime + 12 * HOUR, NOW - 3 * HOUR);
    if (pendingControlTime < NOW) {
      const kId = cuid();
      kontrollen.push({
        id: kId,
        userId: user.id,
        code: code5(),
        kommentar: "Routine-Kontrolle",
        deadline: new Date(pendingControlTime + 4 * HOUR),
        createdAt: new Date(pendingControlTime),
        fulfilledAt: null,
        withdrawnAt: null,
        entryId: null,
      });
    }
  }

  // sort entries by startTime
  entries.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  console.log(`  ✓ ${entries.length} entries generated`);
  console.log(`  ✓ ${kontrollen.length} controls (${strafen.length} penalties)`);
  console.log(`  ✓ ${sessionCount} lock sessions`);
  console.log(`  ✓ approx lock rate: ${Math.round((totalLocked / totalTime) * 100)}%`);

  // 4. write entries in batches
  const BATCH = 50;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await prisma.entry.createMany({
      data: batch.map((e) => ({
        id: e.id,
        userId: e.userId,
        type: e.type,
        startTime: e.startTime,
        imageUrl: e.imageUrl,
        note: e.note,
        oeffnenGrund: e.oeffnenGrund,
        orgasmusArt: e.orgasmusArt,
        kontrollCode: e.kontrollCode,
        verifikationStatus: e.verifikationStatus,
        imageExifTime: e.imageExifTime,
      })),
    });
  }
  console.log("  ✓ entries written");

  // 5. write kontrollen
  for (const k of kontrollen) {
    await prisma.kontrollAnforderung.create({ data: k });
  }
  console.log("  ✓ controls written");

  // 6. write strafen
  for (const s of strafen) {
    await prisma.strafeRecord.create({ data: s });
  }
  console.log("  ✓ penalties written");

  // 7. Verschlussanforderungen (5x, all fulfilled late)
  const anforderungTimes = [
    new Date("2025-05-15T09:00:00+02:00"),
    new Date("2025-07-20T10:00:00+02:00"),
    new Date("2025-09-10T08:00:00+02:00"),
    new Date("2025-11-25T11:00:00+01:00"),
    new Date("2026-02-05T09:00:00+01:00"),
  ];

  for (const created of anforderungTimes) {
    const deadline = new Date(created.getTime() + 6 * HOUR); // 6h deadline
    const fulfilled = new Date(deadline.getTime() + rand(1, 8) * HOUR); // 1-8h late

    await prisma.verschlussAnforderung.create({
      data: {
        id: cuid(),
        userId: user.id,
        art: "ANFORDERUNG",
        nachricht: "Bitte umgehend verschliessen",
        endetAt: deadline,
        dauerH: rand(24, 72),
        fulfilledAt: fulfilled,
        createdAt: created,
      },
    });
  }
  console.log("  ✓ 5 lock requirements (all late)");

  // 8. Trainingsvorgaben (3 phases)
  const vorgaben = [
    {
      gueltigAb: new Date("2025-04-01"),
      gueltigBis: new Date("2025-07-31"),
      minProTagH: 8,
      minProWocheH: 50,
      minProMonatH: null,
      notiz: "Eingewöhnungsphase",
    },
    {
      gueltigAb: new Date("2025-08-01"),
      gueltigBis: new Date("2025-11-30"),
      minProTagH: 12,
      minProWocheH: 70,
      minProMonatH: null,
      notiz: "Aufbauphase",
    },
    {
      gueltigAb: new Date("2025-12-01"),
      gueltigBis: null,
      minProTagH: 16,
      minProWocheH: 100,
      minProMonatH: null,
      notiz: "Zielphase",
    },
  ];

  for (const v of vorgaben) {
    await prisma.trainingVorgabe.create({
      data: { id: cuid(), userId: user.id, ...v },
    });
  }
  console.log("  ✓ 3 training goal phases");

  console.log("\n✅ Seed complete!");
  console.log("   KeyHolder: keyholder123");
  console.log("   Keuschling: keuschling123");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
