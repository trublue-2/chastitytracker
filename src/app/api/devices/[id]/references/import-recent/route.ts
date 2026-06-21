import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { importRecentVerschluss } from "@/lib/deviceReferenceService";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/devices/[id]/references/import-recent
 * Übernimmt die letzten N (Body.limit, Default 5, max 10) Verschluss-Fotos dieses Geräts als
 * Referenzen — Startbestand „Trainingsmaterial der letzten Wochen". Idempotent (per sourceEntryId).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const device = await prisma.device.findUnique({ where: { id }, select: { userId: true } });
  if (!device || (device.userId !== session.user.id && session.user.role !== "admin")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = typeof body.limit === "number" ? body.limit : 5;
  const result = await importRecentVerschluss(id, device.userId, limit);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
