import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/authGuards";

const VALID_EVENT_TYPES = [
  "VERSCHLUSS",
  "OEFFNUNG_IMMER",
  "OEFFNUNG_VERBOTEN",
  "ORGASMUS",
  "KONTROLLE_FREIWILLIG",
  "KONTROLLE_ANGEFORDERT",
] as const;

/** GET /api/admin/notifications?userId=xxx — get all preferences for a user */
export async function GET(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });

  const prefs = await prisma.notificationPreference.findMany({ where: { userId } });

  // Return a map: { VERSCHLUSS: { mail: false, push: true }, ... }
  const map: Record<string, { mail: boolean; push: boolean }> = {};
  for (const et of VALID_EVENT_TYPES) {
    const p = prefs.find((x) => x.eventType === et);
    map[et] = { mail: p?.mail ?? false, push: p?.push ?? false };
  }
  return NextResponse.json(map);
}

/** PATCH /api/admin/notifications — upsert a single preference */
export async function PATCH(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const { userId, eventType, channel, value } = await req.json();
  if (!userId || !eventType || !channel) {
    return NextResponse.json({ error: "userId, eventType, channel erforderlich" }, { status: 400 });
  }
  if (!VALID_EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: "Ungültiger eventType" }, { status: 400 });
  }
  if (channel !== "mail" && channel !== "push") {
    return NextResponse.json({ error: "channel muss 'mail' oder 'push' sein" }, { status: 400 });
  }

  await prisma.notificationPreference.upsert({
    where: { userId_eventType: { userId, eventType } },
    create: { userId, eventType, [channel]: Boolean(value) },
    update: { [channel]: Boolean(value) },
  });

  return NextResponse.json({ ok: true });
}
