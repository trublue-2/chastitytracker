import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live-Box-Status: Heimdall pusht bei jedem Sync den aktuellen Zustand. Quittiert ein
// erledigtes Kommando (lastAppliedCommand) und gibt das aktuell anstehende zurück, damit
// Heimdall es beim selben Sync anwenden kann.
const schema = z.object({
  username: z.string().min(1),
  boxId: z.string().min(1),
  name: z.string().min(1),
  locked: z.boolean(),
  lockUntil: z.string().datetime().nullable().optional(),
  simpleLock: z.boolean().optional(),
  keyholderLocked: z.boolean().optional(),
  battery: z.number().int().min(0).max(100).nullable().optional(),
  charging: z.boolean().nullable().optional(),
  boltPos: z.string().max(16).nullable().optional(),
  fwVersion: z.string().max(32).nullable().optional(),
  lastSyncAt: z.string().datetime().nullable().optional(),
  lastAppliedCommand: z.string().max(32).optional(), // was Heimdall gerade vollzogen hat
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

  const user = await prisma.user.findUnique({ where: { username: body.username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 404 });

  const key = { userId_boxId: { userId: user.id, boxId: body.boxId } };
  const existing = await prisma.boxStatus.findUnique({ where: key });
  // Erledigtes Kommando löschen, wenn Heimdall genau dieses gerade vollzogen hat.
  const clear = !!body.lastAppliedCommand && existing?.pendingCommand === body.lastAppliedCommand;

  const status = {
    name: body.name,
    locked: body.locked,
    lockUntil: body.lockUntil ? new Date(body.lockUntil) : null,
    simpleLock: body.simpleLock ?? false,
    keyholderLocked: body.keyholderLocked ?? false,
    battery: body.battery ?? null,
    charging: body.charging ?? null,
    boltPos: body.boltPos ?? null,
    fwVersion: body.fwVersion ?? null,
    lastSyncAt: body.lastSyncAt ? new Date(body.lastSyncAt) : null,
  };

  const row = await prisma.boxStatus.upsert({
    where: key,
    create: { userId: user.id, boxId: body.boxId, ...status },
    update: { ...status, ...(clear ? { pendingCommand: null, pendingCommandRelockBy: null, pendingCommandAt: null } : {}) },
  });

  return NextResponse.json({
    pendingCommand: row.pendingCommand,
    relockBy: row.pendingCommandRelockBy?.toISOString() ?? null,
  });
}
