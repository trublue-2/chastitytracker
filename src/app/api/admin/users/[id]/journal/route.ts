import { NextRequest, NextResponse } from "next/server";
import { requireJournalReaderApi } from "@/lib/auth/authGuards";
import { journalPageQuery } from "@/lib/journal/journal";
import { listKeyholderJournal } from "@/lib/journal/journalService";
import { getUserTimezone } from "@/lib/entries/queries";

/**
 * Was die Keyholderin vom Tagebuch ihres Subs sieht (Issue #114) — nur Lesen, nur Freigegebenes.
 *
 * Der Guard ist bewusst STRENGER als bei allen anderen Routen unter `/api/admin/users/[id]`: er
 * verlangt die Zuordnung als Keyholder und lässt die Admin-Rolle allein nicht durch
 * (`requireJournalReaderApi`). Schreiben gibt es hier nicht — ein PATCH/DELETE beantwortet Next.js
 * mit 405.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: subId } = await params;
  const denied = await requireJournalReaderApi(subId);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const page = await listKeyholderJournal(subId, journalPageQuery(q, await getUserTimezone(subId)));
  return NextResponse.json(page);
}
