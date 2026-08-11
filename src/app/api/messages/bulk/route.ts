import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { deleteMessages, setReadMany, unreadCountFor, MESSAGE_PAGE_SIZE } from "@/lib/messageService";
import { errorResponse } from "@/lib/serviceResult";

/** Wie viele Ids ein Aufruf höchstens trägt: eine Seite. Angekreuzt wird in der Liste, und die
 *  Auswahl fällt beim Blättern weg — mehr als eine Seite kann nur eine erfundene Anfrage sein.
 *  Aus der Seitengrösse abgeleitet statt danebengeschrieben. */
const MAX_IDS = MESSAGE_PAGE_SIZE;

const ACTIONS = ["delete", "read", "unread"] as const;

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
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => typeof id !== "string")) {
    return errorResponse(400, "MESSAGE_IDS_REQUIRED");
  }
  if (!(ACTIONS as readonly string[]).includes(action)) return errorResponse(400, "MESSAGE_ACTION_INVALID");

  const affected = action === "delete"
    ? await deleteMessages(userId, ids)
    : await setReadMany(userId, ids, action === "read");

  return NextResponse.json({ ok: true, affected, unread: await unreadCountFor(userId) });
}
