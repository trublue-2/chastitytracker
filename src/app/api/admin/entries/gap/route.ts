import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminActor } from "@/lib/auth/authGuards";
import { isDevBypassEnabled } from "@/lib/devMode";
import { createEntryGapForUser, entryGapEnabled, ENTRY_GAP_KINDS } from "@/lib/entryGapService";

/**
 * Eine vergessene Pause (`kind: "break"`, Vorgabe) oder Tragezeit (`kind: "session"`) nachtragen:
 * ein Paar in einem Zug, innerhalb einer bestehenden Tragephase bzw. offenen Phase. Die Regeln
 * stehen in `entryGapService.ts` (geteilt mit dem MCP).
 */
export async function POST(req: NextRequest) {
  if (!entryGapEnabled()) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json();
  const { userId, openAt, lockAt, oeffnenGrund, note } = body;
  // Fehlt `kind`, gilt die Pause: der Bestand vor der Tragezeit kannte nur sie.
  const kind = ENTRY_GAP_KINDS.find((k) => k === (body.kind ?? "break"));
  if (!kind) return NextResponse.json({ error: "INVALID_TYPE" }, { status: 400 });

  if (!userId) return NextResponse.json({ error: "USER_ID_REQUIRED" }, { status: 400 });

  const session = await requireKeyholderOrAdminActor(userId);
  if (session instanceof NextResponse) return session;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });

  const open = new Date(openAt);
  const lock = new Date(lockAt);
  if (!openAt || !lockAt || Number.isNaN(open.getTime()) || Number.isNaN(lock.getTime())) {
    return NextResponse.json({ error: "START_TIME_REQUIRED" }, { status: 400 });
  }

  const result = await createEntryGapForUser(
    user,
    { kind, openAt: open, lockAt: lock, oeffnenGrund, note: typeof note === "string" ? note : "" },
    { allowFuture: isDevBypassEnabled(req.headers.get("host")) },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ opened: result.opened, locked: result.locked }, { status: 201 });
}
