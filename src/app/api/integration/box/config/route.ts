import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBoxSync } from "@/lib/boxSync";
import { getActiveSperrzeit } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Absicht (Tracker → Heimdall): die aktive Keyholder-Sperrzeit. Heimdall faltet
// endetAt per Hybrid-Regel in seine lockUntil (gekappt durch hardCap). Read-only
// auf bestehende Modelle — P1 liefert nur die Zeit, keine Reinigungs-/Range-Regeln.
export async function GET(req: NextRequest) {
  const denied = requireBoxSync(req);
  if (denied) return denied;

  // Heimdall mappt per Username (kein cuid-Lookup nötig).
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Unknown user" }, { status: 404 });

  const sperre = await getActiveSperrzeit(user.id);

  return NextResponse.json({
    sperrzeit: sperre
      ? {
          endetAt: sperre.endetAt?.toISOString() ?? null,
          indefinite: sperre.endetAt === null,
          reinigungErlaubt: sperre.reinigungErlaubt,
        }
      : null,
  });
}
