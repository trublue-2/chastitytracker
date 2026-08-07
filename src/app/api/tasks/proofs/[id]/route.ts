import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/authGuards";
import { submitTaskProof } from "@/lib/taskProofService";
import { isValidImageUrl } from "@/lib/constants";
import { serviceFailure, errorResponse } from "@/lib/serviceResult";

/**
 * Der Sub reicht ein gefordertes Nachweis-Foto ein.
 *
 * Eigene Route unter `/api/tasks/proofs/[id]` statt eines Zweigs an `/api/tasks/[id]`: die id ist
 * hier die des NACHWEISES, nicht die der Aufgabe. Beides über dieselbe Route zu führen hiesse, zwei
 * verschiedene Entitäten hinter demselben Pfad-Parameter zu verstecken.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireApi();
    if (session instanceof NextResponse) return session;

    const body = await req.json().catch(() => ({}));

    // Dieselbe Whitelist wie bei den Einträgen — ein Nachweis ist zwar kein Entry, aber die
    // Bild-URL kommt über denselben Upload und muss derselben Form genügen.
    if (typeof body.imageUrl !== "string" || !isValidImageUrl(body.imageUrl)) {
      return errorResponse(400, "INVALID_IMAGE_URL");
    }

    // Fehlende oder unlesbare EXIF-Zeit ist KEIN Fehler: das Bild trägt sie schlicht nicht. Der
    // Nachweis geht dann zur Sichtung, statt abgewiesen zu werden (siehe `evaluateProofs`).
    const exif = body.imageExifTime ? new Date(body.imageExifTime) : null;
    const imageExifTime = exif && !Number.isNaN(exif.getTime()) ? exif : null;

    const result = await submitTaskProof(id, session.user.id!, { imageUrl: body.imageUrl, imageExifTime });
    if (!result.ok) return serviceFailure(result);
    // Kein Prüf-Ergebnis in der Antwort: die Code-Prüfung läuft nach dem Commit weiter (siehe
    // `runTaskProofVerification`). Der Zustand ist ohnehin abgeleitet und aktualisiert sich von selbst.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/tasks/proofs/[id]]", err);
    return errorResponse(500, "INTERNAL_ERROR");
  }
}
