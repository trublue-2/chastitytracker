import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";
import { createVorgabe } from "@/lib/vorgabeService";

export async function POST(req: NextRequest) {
  const err = await requireAdminApi();
  if (err) return err;

  const result = await createVorgabe(await req.json());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
