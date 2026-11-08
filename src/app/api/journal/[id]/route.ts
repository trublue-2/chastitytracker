import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { deleteJournalEntry, updateJournalEntry } from "@/lib/journal/journalService";
import { errorResponse, serviceFailure } from "@/lib/shared/serviceResult";

/**
 * Einen eigenen Tagebuch-Eintrag ändern oder löschen. Die Dienste filtern mit dem Besitzer aus der
 * Session: eine fremde id — auch die eines eigenen Subs, auch für den Admin — ist hier 404, genau wie
 * eine unbekannte. Die Keyholderin kann Einträge also weder ändern noch löschen, und die Antwort
 * verrät nicht, ob es die id gibt.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse(400, "INVALID_REQUEST_BODY");

  try {
    const { id } = await params;
    const result = await updateJournalEntry(session.user.id, id, {
      entryAt: body.entryAt,
      text: body.text,
      mood: body.mood,
      visibility: body.visibility,
    });
    return result.ok ? NextResponse.json({ ok: true }) : serviceFailure(result);
  } catch (err) {
    console.error("[PATCH /api/journal/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const result = await deleteJournalEntry(session.user.id, id);
    return result.ok ? NextResponse.json({ ok: true }) : serviceFailure(result);
  } catch (err) {
    console.error("[DELETE /api/journal/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
