import { NextRequest, NextResponse } from "next/server";
import { getBlockedUntil } from "@/lib/login-attempts";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username") ?? "";
  const until = username ? await getBlockedUntil(username) : null;
  return NextResponse.json({
    locked: until !== null,
    until: until?.toISOString() ?? null,
  });
}
