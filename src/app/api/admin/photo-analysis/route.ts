import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/authGuards";
import {
  checkPhotoAnalysisInput,
  checkPhotoAnalysisTarget,
  mergePhotoAnalysis,
  parsePhotoAnalysisInput,
  readStoredPhotoAnalysis,
  savePhotoAnalysis,
} from "@/lib/vision/config";

/**
 * Die Foto-Prüfung der Instanz speichern — Anbieter, Adresse, Schlüssel, Modelle.
 *
 * **Nur Admin**, nicht Keyholderin: wohin intime Fotos gehen und auf wessen Kosten, ist eine
 * Entscheidung des Betreibers. Der Schlüssel verlässt die Instanz nie wieder — auch nicht zum
 * Admin, der ihn gerade eingetragen hat; die Oberfläche kennt nur seine letzten vier Zeichen.
 */
export async function PATCH(req: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const input = parsePhotoAnalysisInput(await req.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "photoAnalysisInvalid" }, { status: 400 });
  const invalid = checkPhotoAnalysisInput(input) ?? (await checkPhotoAnalysisTarget(input));
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  await savePhotoAnalysis(mergePhotoAnalysis(input, await readStoredPhotoAnalysis()));
  // Keine Ansicht zurück: die Seite lädt nach dem Speichern ohnehin neu (`useSettingsSave`).
  return NextResponse.json({ ok: true });
}
