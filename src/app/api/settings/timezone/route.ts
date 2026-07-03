import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidTimezone } from "@/lib/timezones";

// Timezone is a USER-SELF field (governs the user's own display/input). Per CLAUDE.md only
// admin-set fields need requireAdminApi() — normal session auth is correct here.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { timezone } = await req.json();
  if (!isValidTimezone(timezone)) {
    return NextResponse.json({ error: "invalidTimezone" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { timezone },
  });

  return NextResponse.json({ ok: true });
}
