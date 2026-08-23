import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireKeyholderOrAdminApi } from "@/lib/authGuards";
import { deleteWeightEntry } from "@/lib/weightService";
import { errorResponse, serviceFailure } from "@/lib/serviceResult";

/**
 * Eine Messung löschen — **nur die Keyholderin**.
 *
 * Dieselbe Trennung wie bei den Einträgen: der Träger korrigiert eigene Zeilen nicht selbst. Wer
 * die Zeile löschen darf, hängt an ihrem BESITZER, nicht am Aufrufer — deshalb wird sie zuerst
 * gelesen und der Guard dann gegen ihren `userId` gestellt. Ein Guard gegen den Aufrufer liesse
 * jeden Keyholder die Zeilen jedes fremden Trägers löschen.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await prisma.weightEntry.findUnique({ where: { id }, select: { userId: true } });
    // Kein Unterschied zwischen „gibt es nicht" und „gehört jemand anderem": sonst verrät die
    // Antwort, welche ids existieren.
    if (!row) return errorResponse(404, "NOT_FOUND");

    const denied = await requireKeyholderOrAdminApi(row.userId);
    if (denied) return denied;

    const result = await deleteWeightEntry(id);
    if (!result.ok) return serviceFailure(result);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/weight/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
