import { NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { markAllRead } from "@/lib/messageService";

/** POST /api/messages/read-all — bewusste Handlung des Nutzers (die Oberfläche fragt vorher nach),
 *  nie ein Nebeneffekt des Listen-Aufrufs. */
export async function POST() {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  // markAllRead quittiert NUR die sichtbaren Nachrichten und liefert den daraus folgenden Stand —
  // eine hart gesetzte 0 hätte behauptet, auch das Verborgene sei gesehen.
  return NextResponse.json({ ok: true, unread: await markAllRead(session.user.id) });
}
