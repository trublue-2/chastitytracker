import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { journalPageQuery } from "@/lib/journal/journal";
import { createJournalEntry, listOwnJournal } from "@/lib/journal/journalService";
import { errorResponse, serviceFailure } from "@/lib/shared/serviceResult";
import { APP_TZ } from "@/lib/shared/time";

/**
 * Das eigene Tagebuch (Issue #114). Scope ist IMMER die Session — es gibt keinen `userId`-Parameter,
 * und ein `userId` im Body wird nicht gelesen: ein Tagebuch schreibt nur sein Besitzer, auch kein
 * Keyholder „für" ihn. Die Keyholderin liest über `/api/admin/users/[id]/journal`, nie hier.
 *
 * GET `?month=YYYY-MM` (Monat in der Zeitzone des Subs) und `?cursor=<id>` (nach diesem Eintrag
 * weiter) → `{ entries, hasMore }`.
 */
export async function GET(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const q = req.nextUrl.searchParams;
  const page = await listOwnJournal(session.user.id, journalPageQuery(q, session.user.timezone ?? APP_TZ));
  return NextResponse.json(page);
}

export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse(400, "INVALID_REQUEST_BODY");

  try {
    const result = await createJournalEntry(session.user.id, {
      entryAt: body.entryAt,
      text: body.text,
      mood: body.mood,
      prompt: body.prompt,
      visibility: body.visibility,
    });
    return result.ok ? NextResponse.json({ ok: true, ...result.data }) : serviceFailure(result);
  } catch (err) {
    console.error("[POST /api/journal]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
