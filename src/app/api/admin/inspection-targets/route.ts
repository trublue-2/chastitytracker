import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { listInspectionTargets } from "@/lib/inspectionTarget";
import { errorResponse } from "@/lib/serviceResult";

/**
 * GET /api/admin/inspection-targets?userId=<id>
 *
 * Die Ziele, auf die JETZT eine Kontrolle gestellt werden kann (siehe `listInspectionTargets`).
 * Bewusst eine eigene Route statt reiner Server-Props: das Kontroll-Formular steckt auch in einem
 * Modal der Admin-Übersicht (KontrolleButton), und die Ziele dort für JEDEN gelisteten Sub
 * vorzuladen wären N Abfragen für ein Formular, das meistens nicht geöffnet wird.
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return errorResponse(400, "USER_ID_REQUIRED");
  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;

  return NextResponse.json(await listInspectionTargets(userId));
}
