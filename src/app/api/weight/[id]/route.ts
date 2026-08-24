import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { deleteWeightEntry, updateWeightEntry } from "@/lib/weightService";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";

/**
 * Wer die Zeile anfassen darf — für BEIDE Methoden dieselbe Frage, deshalb an einer Stelle.
 *
 * Die Berechtigung hängt am BESITZER der Zeile, nicht am Aufrufer: ein Guard gegen den Aufrufer
 * liesse jeden Keyholder die Messungen jedes fremden Trägers ändern, weil er für irgendeinen
 * berechtigt ist. Und eine unbekannte id ist 404, BEVOR geprüft wird — sonst verriete die Antwort,
 * welche ids existieren.
 */
async function guard(id: string): Promise<NextResponse | null> {
  const row = await prisma.weightEntry.findUnique({ where: { id }, select: { userId: true } });
  if (!row) return errorResponse(404, "NOT_FOUND");
  return requireKeyholderOrAdminApi(row.userId);
}

/**
 * Eine Messung KORRIGIEREN — nur Wert und Notiz, nur die Keyholderin.
 *
 * Nicht über den Erfassungsweg, obwohl der den Tageswert ohnehin ersetzt: der schreibt die ganze
 * Zeile neu und verlöre dabei Foto, EXIF-Zeit und den von der Waage gelesenen Wert. Ein
 * Zahlendreher darf den Beleg nicht mitnehmen.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const denied = await guard(id);
    if (denied) return denied;

    const body = await req.json();
    const result = await updateWeightEntry(id, {
      weightKg: body.weightKg === undefined ? undefined : Number(body.weightKg),
      note: body.note,
    });
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/weight/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}

/**
 * Eine Messung löschen — **nur die Keyholderin**.
 *
 * Dieselbe Trennung wie bei den Einträgen: der Träger korrigiert eigene Zeilen nicht selbst.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const denied = await guard(id);
    if (denied) return denied;

    const result = await deleteWeightEntry(id);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/weight/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
