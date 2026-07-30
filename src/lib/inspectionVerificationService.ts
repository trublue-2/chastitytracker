import { prisma } from "@/lib/prisma";
import { verifyKontrolleCodeDeduped } from "@/lib/verifyCache";
import { detectSealNumber } from "@/lib/verifyCode";
import type { InspectionVerification } from "@/lib/kontrolleService";
import type { Rotation } from "@/lib/constants";
import type { VerifyReason } from "@/lib/verifyReason";

/**
 * Die Foto-Verifikation einer Kontrolle als EIN Vorgang — Gegenstück zu `deviceCheckService`, und aus
 * demselben Grund ein Service: sie läuft NACH dem Commit (fire-and-forget, das Vision-Backend braucht
 * Sekunden), und der Eintrag steht bis dahin auf `verifikationStatus: "pending"`.
 *
 * Daraus folgt dieselbe Invariante: **wer `pending` setzt, MUSS es ersetzen** — auch wenn nichts
 * gelesen werden konnte und auch im Fehlerfall. Was zu prüfen ist, entscheidet nicht diese Funktion,
 * sondern {@link InspectionVerification} (aus `plannedVerification`): derselbe Wert hat oben den
 * Startwert bestimmt, also können Start und Ergebnis nicht auseinanderlaufen.
 */

/** Ergebnis einer Prüfung, wie es in den Eintrag geschrieben wird. */
interface VerificationOutcome {
  status: "ai" | null;
  reason: VerifyReason | null;
  /** Was im Bild GELESEN wurde — nur bei den `*Wrong`-Gründen, sonst null (siehe formatVerifyReason). */
  detected: string | null;
}

const NO_MATCH: VerificationOutcome = { status: null, reason: null, detected: null };

/**
 * Prüft das eingereichte Kontroll-Foto und schreibt das Ergebnis — auf einem Pfad, den jeder Ausgang
 * nimmt. `kind: "none"` schreibt NICHT: dort ist der Startwert schon endgültig (`null` =
 * unverifiziert bei einer freiwilligen Selbstkontrolle, `not_required` bei einem Gerät ohne
 * Code-Pflicht). Ein Schreiben würde diesen Unterschied gerade einplanieren.
 *
 * Wirft nie — der Aufrufer ist ein fire-and-forget-Kontext ohne jemanden, der einen Fehler behandeln
 * könnte. Scheitert das Schreiben, bleibt die Zeile auf `pending`; dann sagt es die Logzeile.
 */
export async function runInspectionVerification(opts: {
  entryId: string;
  userId: string;
  photoUrl: string;
  rotation: Rotation;
  verification: InspectionVerification;
}): Promise<void> {
  const { entryId, userId, photoUrl, rotation, verification } = opts;
  if (verification.kind === "none") return;

  let outcome: VerificationOutcome = NO_MATCH;
  try {
    outcome = verification.kind === "code"
      ? await verifyCode(userId, photoUrl, rotation, verification.code, verification.sealCode)
      : await verifySealOnly(photoUrl, rotation, verification.sealCode);
  } catch (err) {
    console.error("[inspectionVerification] check failed for entry", entryId, err);
  }
  try {
    await prisma.entry.update({
      where: { id: entryId },
      data: {
        verifikationStatus: outcome.status,
        verifikationReason: outcome.reason,
        verifikationReasonDetected: outcome.detected,
      },
    });
  } catch (err) {
    console.error("[inspectionVerification] status write failed for entry", entryId, err);
  }
}

/** Der Normalfall: Kontroll-Code im Foto, bei aktivem Siegel zusätzlich dessen Nummer (Dual-Prüfung). */
async function verifyCode(
  userId: string,
  photoUrl: string,
  rotation: Rotation,
  code: string,
  sealCode: string | null,
): Promise<VerificationOutcome> {
  const result = await verifyKontrolleCodeDeduped(userId, photoUrl, code, rotation, sealCode);
  if (result?.match) return { status: "ai", reason: null, detected: null };
  if (!result) return NO_MATCH; // kein Vision-Provider / Bild unlesbar → unverifiziert, kein Grund
  const reason = (result.reason ?? null) as VerifyReason | null;
  return {
    status: null,
    reason,
    // Nur *Wrong-Gründe tragen einen gelesenen Wert; bei *Missing wurde nichts gelesen, und ein
    // Wert stünde irreführend in der Zeile.
    detected:
      reason === "codeWrong" ? result.detected
      : reason === "sealWrong" ? (result.sealDetected ?? null)
      : null,
  };
}

/**
 * Das Gerät verlangt keinen Code, die Schlüsselbox ist aber versiegelt: dann ist die Siegel-Nummer
 * das Einzige, was im Foto stehen muss. Sie beweist etwas anderes als der Code — dass die Box
 * unberührt ist — und fällt mit ihm nicht weg.
 *
 * Bewusst über `detectSealNumber` statt über den Code-Prompt mit leerem Code: die Funktion existiert
 * für genau diese Frage (sie speist auch `/api/detect-seal`), und ein Prompt, der einen Code sucht,
 * den es nicht gibt, würde nur Nicht-Befunde erzeugen.
 */
async function verifySealOnly(
  photoUrl: string,
  rotation: Rotation,
  sealCode: string,
): Promise<VerificationOutcome> {
  const detected = await detectSealNumber(photoUrl, rotation);
  if (detected === sealCode) return { status: "ai", reason: null, detected: null };
  return detected
    ? { status: null, reason: "sealWrong", detected }
    : { status: null, reason: "sealMissing", detected: null };
}
