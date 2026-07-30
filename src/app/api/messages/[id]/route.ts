import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { deleteMessage, unreadCountFor } from "@/lib/messageService";
import { errorResponse } from "@/lib/serviceResult";

/**
 * DELETE /api/messages/[id] — der Nutzer räumt eine Zeile aus seinem eigenen Posteingang.
 *
 * Gelöscht wird NUR die Nachricht. Der Vorgang, auf den sie zeigt (Strafe, Kontrolle, Sperrzeit),
 * bleibt unberührt — eine Nachricht ist die Zustellung, nicht der Vorgang.
 *
 * Antwortet mit dem neuen Ungelesen-Stand (ungecacht, weil nach einem Schreibvorgang), damit Glocke
 * und App-Badge ohne zweiten Abruf nachziehen.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;
  const { id } = await params;

  if (!(await deleteMessage(userId, id))) return errorResponse(404, "NOT_FOUND");
  return NextResponse.json({ ok: true, unread: await unreadCountFor(userId) });
}
