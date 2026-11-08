import { NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { boxCouplingEnabled } from "@/lib/constants";
import { requestBoxReopen } from "@/lib/box/boxReopenService";
import { serviceFailure } from "@/lib/serviceResult";

export const dynamic = "force-dynamic";

// POST /api/box/reopen — den Box-Öffnen-Befehl NEU setzen. Der Reparaturweg für genau einen Zustand:
// der Tracker steht auf offen, die Box meldet den Riegel aber zu (`boxReopenService.ts`). Das
// Gegenstück zu `/api/box/relock`.
//
// Nur für den Träger selbst, wie `relock`: ausgeführt wird der Befehl ohnehin erst, wenn SEIN Handy
// sich an der LockMeBox verbindet. Eine Keyholder-Fassung
// hätte damit keinen eigenen Nutzen — und bräuchte nach den Regeln der Keyholder-Fähigkeiten einen
// MCP-Weg dazu.
export async function POST() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  if (!boxCouplingEnabled()) return NextResponse.json([]);

  const result = await requestBoxReopen(session.user.id);
  return result.ok ? NextResponse.json({ ok: true }) : serviceFailure(result);
}
