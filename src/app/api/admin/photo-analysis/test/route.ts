import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  checkPhotoAnalysisInput,
  checkPhotoAnalysisTarget,
  mergePhotoAnalysis,
  parsePhotoAnalysisInput,
  readStoredPhotoAnalysis,
  resolveVisionFrom,
} from "@/lib/vision/config";
import { runVisionSelfTest } from "@/lib/vision/selfTest";

/**
 * „Einstellung testen" — mit dem ENTWURF aus dem Formular, bevor gespeichert ist. Wer einen
 * Schlüssel erst ausprobieren will, soll dafür nicht die laufende Einstellung überschreiben müssen.
 *
 * Ohne neuen Schlüssel im Entwurf nimmt der Test den in der App hinterlegten (beim selben Anbieter) —
 * sonst könnte der Admin eine gespeicherte Einstellung nie prüfen, ohne den Schlüssel neu einzugeben.
 *
 * **Nie über den Schlüssel der `.env`.** Der Entwurf wird OHNE Umgebung aufgelöst: auf einer
 * Portal-Instanz ist das der Schlüssel des Portal-Betreibers, und ein Test damit kostete ihn Geld,
 * um etwas zu bestätigen, das der Admin gar nicht eingerichtet hat.
 *
 * Gedrosselt je INSTANZ, nicht je Nutzer: jeder Durchgang kostet beim Anbieter echtes Geld, und
 * ein Admin kann weitere Admin-Konten anlegen.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const rl = await checkRateLimit("photo-analysis-test", 6, 10 * 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const input = parsePhotoAnalysisInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "photoAnalysisInvalid" }, { status: 400 });
  const invalid = checkPhotoAnalysisInput(input) ?? (await checkPhotoAnalysisTarget(input));
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const draft = mergePhotoAnalysis(input, await readStoredPhotoAnalysis());
  const result = await runVisionSelfTest(resolveVisionFrom(draft, {}, new Date()));
  return NextResponse.json(result);
}
