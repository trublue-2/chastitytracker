import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";
import bcrypt from "bcryptjs";

export const DEMO_USERNAME = "DemoUser";
export const DEMO_PASSWORD = "demo1234";

export async function POST() {
  if (process.env.ENABLE_DEMO !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  const err = await requireAdminApi();
  if (err) return err;

  const existing = await prisma.user.findUnique({ where: { username: DEMO_USERNAME } });
  if (existing) {
    return NextResponse.json({ error: "DemoUser already exists" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await prisma.user.create({
    data: { username: DEMO_USERNAME, passwordHash, role: "user" },
  });

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

  // 20 Verschluss/Öffnen pairs – progressive durations (5h → 20 days)
  // Format: [verschluss_days_ago, duration_hours | null (= aktiv)]
  const pairs: [number, number | null, string | null][] = [
    [119,    5,   null],
    [118,    8,   null],
    [117,   12,   "Kurz, aber gut durchgehalten!"],
    [116,   18,   null],
    [115,   24,   "Erster ganzer Tag"],
    [113.5, 36,   null],
    [111,   48,   "Zwei Tage – neuer Rekord"],
    [108.5, 60,   null],
    [105,   72,   "Drei Tage problemlos"],
    [101.5, 84,   null],
    [97,    96,   "Vier Tage"],
    [92,   120,   "Fünf Tage – sehr gut!"],
    [86,   144,   "Sechs Tage"],
    [79,   168,   "Eine ganze Woche! 💪"],
    [71,   192,   null],
    [62,   240,   "Zehn Tage"],
    [51,   288,   "Zwölf Tage"],
    [38,   336,   "Zwei Wochen gemeistert 🏆"],
    [23,   408,   "Fast drei Wochen"],
    [5,   null,   null],  // aktiv
  ];

  for (const [verschlussDays, durationH, note] of pairs) {
    const verschlussTime = days(verschlussDays);
    await prisma.entry.create({
      data: { userId: user.id, type: "VERSCHLUSS", startTime: verschlussTime, note },
    });
    if (durationH !== null) {
      await prisma.entry.create({
        data: {
          userId: user.id,
          type: "OEFFNEN",
          startTime: new Date(verschlussTime.getTime() + durationH * 3_600_000),
        },
      });
    }
  }

  // Kontrollen (within longer periods)
  for (const d of [76, 68, 58, 46, 33, 15, 10]) {
    await prisma.entry.create({
      data: { userId: user.id, type: "PRUEFUNG", startTime: days(d) },
    });
  }

  // Orgasmen
  const orgasmusData: [number, string, string | null][] = [
    [118.5, "Orgasmus",           null],
    [116.2, "ruinierter Orgasmus","Sehr intensiv"],
    [113.8, "Orgasmus",           null],
    [110,   "feuchter Traum",     null],
    [104,   "Orgasmus",           null],
    [96.5,  "ruinierter Orgasmus","Nach dem Öffnen"],
    [88,    "Orgasmus",           null],
    [78,    "feuchter Traum",     null],
    [60,    "Orgasmus",           "Besonders intensiv"],
    [40,    "ruinierter Orgasmus",null],
  ];
  for (const [d, art, note] of orgasmusData) {
    await prisma.entry.create({
      data: { userId: user.id, type: "ORGASMUS", startTime: days(d), orgasmusArt: art, note },
    });
  }

  // Trainingsvorgaben – progressiver Plan
  await prisma.trainingVorgabe.createMany({
    data: [
      {
        userId: user.id,
        gueltigAb: days(120),
        gueltigBis: days(80),
        minProTagH:    4,
        minProWocheH: 30,
        notiz: "Einstieg: leichte Ziele",
      },
      {
        userId: user.id,
        gueltigAb: days(80),
        gueltigBis: days(40),
        minProTagH:    8,
        minProWocheH:  56,
        notiz: "Aufbau: mittlere Intensität",
      },
      {
        userId: user.id,
        gueltigAb: days(40),
        gueltigBis: null,
        minProTagH:    12,
        minProWocheH:  84,
        minProMonatH: 360,
        notiz: "Fortgeschritten: hohes Niveau",
      },
    ],
  });

  return NextResponse.json({ ok: true, userId: user.id });
}
