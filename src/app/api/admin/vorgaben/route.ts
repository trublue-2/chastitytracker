import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { createVorgabe } from "@/lib/vorgabeService";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const err = await requireKeyholderOrAdminApi(body.userId);
  if (err) return err;

  const result = await createVorgabe(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
