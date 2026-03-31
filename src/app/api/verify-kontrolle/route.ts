import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verifyKontrolleCodeDetailed } from "@/lib/verifyCode";

// Per-user rate limiting: max 10 requests per 60 s
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(session.user.id)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { imageUrl, expectedCode } = await req.json();

  if (!imageUrl || !expectedCode) {
    return NextResponse.json({ error: "imageUrl and expectedCode required" }, { status: 400 });
  }

  const result = await verifyKontrolleCodeDetailed(imageUrl, expectedCode);
  if (result === null) {
    return NextResponse.json({ detected: null, match: false, error: true });
  }

  return NextResponse.json(result);
}
