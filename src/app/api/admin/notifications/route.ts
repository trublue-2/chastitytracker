import { NextRequest, NextResponse } from "next/server";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/constants";
import { getNotificationMatrix, setNotificationPreference } from "@/lib/notificationPrefs";

/** GET /api/admin/notifications?userId=xxx — get all preferences for a user */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId fehlt" }, { status: 400 });

  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;

  // Die Matrix baut `notificationPrefs.ts` — dieselbe Ableitung, die auch die KI über den MCP liest.
  return NextResponse.json(await getNotificationMatrix(userId));
}

/** PATCH /api/admin/notifications — upsert a single preference */
export async function PATCH(req: NextRequest) {
  const { userId, eventType, channel, value } = await req.json();
  if (!userId || !eventType || !channel) {
    return NextResponse.json({ error: "userId, eventType, channel erforderlich" }, { status: 400 });
  }

  const err = await requireKeyholderOrAdminApi(userId);
  if (err) return err;
  if (!NOTIFICATION_EVENT_TYPES.includes(eventType)) {
    return NextResponse.json({ error: "Ungültiger eventType" }, { status: 400 });
  }
  if (channel !== "mail" && channel !== "push") {
    return NextResponse.json({ error: "channel muss 'mail' oder 'push' sein" }, { status: 400 });
  }

  await setNotificationPreference(userId, eventType, channel, Boolean(value));
  return NextResponse.json({ ok: true });
}
