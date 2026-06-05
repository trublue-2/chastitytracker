import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";
import { requestKontrolle } from "@/lib/kontrolleService";

export async function POST(req: NextRequest) {
  try {
    const err = await requireAdminApi();
    if (err) return err;

    const result = await requestKontrolle(await req.json());
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, deadline: result.data.deadline });
  } catch (err) {
    console.error("[POST /api/admin/kontrolle]", err);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
