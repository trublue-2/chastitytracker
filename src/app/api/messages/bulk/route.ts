import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { deleteMessages, setReadMany, unreadCountFor } from "@/lib/messageService";
import { errorResponse } from "@/lib/serviceResult";

/** Wie viele Ids ein Aufruf höchstens trägt. Die Auswahl entsteht durch Ankreuzen in einer Liste mit
 *  fester Seitengrösse — deutlich mehr als eine Seite kann nur eine erfundene Anfrage sein. */
const MAX_IDS = 100;

const ACTIONS = ["delete", "read", "unread"] as const;
type BulkAction = (typeof ACTIONS)[number];

/**
 * POST /api/messages/bulk — mehrere Nachrichten des EIGENEN Posteingangs auf einmal behandeln.
 *
 * Der Scope kommt wie überall aus der Session, nie aus dem Body: die Ids sagen nur, WELCHE Zeilen
 * gemeint sind, und der Service grenzt sie zusätzlich auf die eigenen ein.
 *
 * Antwortet mit dem neuen Ungelesen-Stand, damit Glocke und App-Badge ohne zweiten Abruf nachziehen
 * — dieselbe Konvention wie DELETE /api/messages/[id].
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;

  const { ids, action } = await req.json();
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return errorResponse(400, "MESSAGE_IDS_REQUIRED");
  }
  if (ids.length === 0 || ids.length > MAX_IDS) return errorResponse(400, "MESSAGE_IDS_REQUIRED");
  if (!ACTIONS.includes(action as BulkAction)) return errorResponse(400, "MESSAGE_ACTION_INVALID");

  const affected = action === "delete"
    ? await deleteMessages(userId, ids)
    : await setReadMany(userId, ids, action === "read");

  return NextResponse.json({ ok: true, affected, unread: await unreadCountFor(userId) });
}
