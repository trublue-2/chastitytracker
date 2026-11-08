import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/auth/authGuards";
import { setJournalSettings } from "@/lib/journal/journalService";
import { errorResponse, serviceFailure } from "@/lib/shared/serviceResult";

/**
 * PATCH /api/settings/journal — die eigenen Tagebuch-Einstellungen (Standard-Sichtbarkeit neuer
 * Einträge, Leitfragen an/aus). Scope ist immer die Session: die Einstellungen gehören allein dem Sub.
 * Nicht über `userSelfFieldRoute`, weil sie in einer eigenen Tabelle liegen (`JournalSettings`) statt
 * an `User`.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return errorResponse(400, "INVALID_REQUEST_BODY");

  const result = await setJournalSettings(session.user.id, {
    defaultVisibility: body.defaultVisibility,
    promptsEnabled: body.promptsEnabled,
  });
  return result.ok ? NextResponse.json({ ok: true, ...result.data }) : serviceFailure(result);
}
