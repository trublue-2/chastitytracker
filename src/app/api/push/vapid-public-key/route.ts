import { NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";

export async function GET() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "Push not configured" }, { status: 503 });

  return NextResponse.json({ key });
}
