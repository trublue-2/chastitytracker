import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spur-2-Ingest: der Heimdall-Server meldet reale Box-Übergänge. P1 speichert sie
// nur (Hardware-Wahrheit). Strafbuch-Surfacing/Abgleich Entry↔BoxEvent kommt in P3.
const schema = z.object({
  userId: z.string().min(1),
  deviceId: z.string().min(1).optional(),
  type: z.enum(["LOCKED", "UNLOCKED", "EARLY_OPEN", "UNAUTHORIZED_OPEN"]),
  wakeReason: z.string().max(64).optional(),
  battery: z.number().int().min(0).max(100).optional(),
  fwVersion: z.string().max(32).optional(),
  at: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const denied = requireBoxSync(req);
  if (denied) return denied;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 404 });

  // Gerät muss dem User gehören (kein Fremd-Mapping einschleusen).
  if (body.deviceId) {
    const dev = await prisma.device.findFirst({
      where: { id: body.deviceId, userId: body.userId },
      select: { id: true },
    });
    if (!dev) return NextResponse.json({ error: "Unknown device" }, { status: 404 });
  }

  const ev = await prisma.boxEvent.create({
    data: {
      userId: body.userId,
      deviceId: body.deviceId ?? null,
      type: body.type,
      wakeReason: body.wakeReason ?? null,
      battery: body.battery ?? null,
      fwVersion: body.fwVersion ?? null,
      at: body.at ? new Date(body.at) : new Date(),
    },
  });

  return NextResponse.json({ ok: true, id: ev.id });
}
