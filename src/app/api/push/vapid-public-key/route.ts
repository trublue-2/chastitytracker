import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "Push not configured" }, { status: 503 });

  return NextResponse.json({ key });
}
