/**
 * Client-safe reason-code formatting for AI photo-verification failures. Deliberately split out of
 * verifyCode.ts (which pulls in sharp/fs/next-headers for the vision pipeline) so client components
 * like PruefungFormCore can import it without bundling that server-only code into the browser.
 */

/** Stable, language-agnostic reason code for a failed check. The UI maps it to a localized string
 *  (inspectionForm.reason*) — the model is NOT asked for free German text, so the reason follows
 *  the user's language like the rest of the app. `*Wrong` carries the detected number. */
export type VerifyReason = "codeMissing" | "codeWrong" | "sealMissing" | "sealWrong";

/** Reason code → i18n key in the `inspectionForm` namespace. Single source shared by the wearer's
 *  live check (PruefungFormCore) and the admin/keyholder inspection list (kontrollen.ts), so both
 *  surfaces render the same wording for the same reason. */
export const VERIFY_REASON_KEYS: Record<VerifyReason, string> = {
  codeMissing: "reasonCodeMissing",
  codeWrong: "reasonCodeWrong",
  sealMissing: "reasonSealMissing",
  sealWrong: "reasonSealWrong",
};

/** Der Nicht-Match-Grund, wie ihn die MCP-Sichten führen: der stabile Code plus, bei den
 *  `*Wrong`-Gründen, das im Bild GELESENE. */
export interface VerifyFailure {
  reason: VerifyReason;
  /** Was im Bild stand (nur `*Wrong`; bei `*Missing` wurde nichts gelesen → null). */
  detected: string | null;
}

/**
 * Baut den Nicht-Match-Grund für die Maschinen-Sichten (MCP). `null` = nichts zu erklären.
 *
 * Existiert, weil `verifikationStatus: null` sonst eine Sackgasse ist — „nicht verifiziert", ohne
 * dass erkennbar wäre, ob der Code unlesbar war, falsche Ziffern zeigte oder das Siegel fehlte. Der
 * Grund liegt seit jeher in der Zeile und stand nur in der Admin-Liste; die Keyholder-KI sah ihn
 * nicht und konnte den Sub deshalb weder gezielt fragen noch die Ursache benennen.
 *
 * `status` ist PFLICHT und entscheidet mit: der Grund gilt NUR, solange nicht automatisch verifiziert
 * ist. Die Spalten `verifikationReason`/`verifikationReasonDetected` werden ausschliesslich von der
 * Auto-Prüfung geschrieben und von einem späteren Urteil NICHT abgeräumt (`resolveKontrolle` setzt
 * nur `verifikationStatus`). Ohne diese Schranke stünde neben einem `manual` der Grund der damals
 * gescheiterten Maschinen-Prüfung — die Keyholder-KI läse „von Hand bestätigt" UND „falsche Ziffern
 * gelesen" in derselben Zeile und zöge eine Bestätigung in Zweifel, die der Mensch längst gegeben
 * hat. Die Admin-Liste hält dieselbe Schranke seit jeher (`kontrollen.ts`: „Nur bei 'unverified'
 * aussagekräftig"); der MCP hatte sie nicht.
 *
 * Defensiv gegen Alt-/Fremdwerte: ein unbekannter Code fällt auf `null` statt als ungültiger
 * VerifyReason durchzurutschen — dieselbe Härtung wie `effectiveDeviceCheckStatus` für den
 * Geräte-Check.
 */
export function toVerifyFailure(
  status: string | null | undefined,
  reason: string | null | undefined,
  detected: string | null | undefined,
): VerifyFailure | null {
  // Roh-Spalte: `null` = unverifiziert. Jeder gesetzte Status (ai/manual/rejected/pending) ist ein
  // aktuelleres Urteil als der gespeicherte Auto-Grund.
  if (status) return null;
  if (!reason || !(reason in VERIFY_REASON_KEYS)) return null;
  return { reason: reason as VerifyReason, detected: detected ?? null };
}

/** Renders a reason code as localized text via the given `inspectionForm` translator. `detected`
 *  feeds the `{detected}` placeholder used by the `*Wrong` variants; ignored by `*Missing`.
 *  Defensive against an unrecognized `reason` (e.g. stale/legacy DB value) — degrades to `null`
 *  instead of calling `t(undefined, …)`, which would crash the whole server-rendered list. */
export function formatVerifyReason(
  reason: VerifyReason | null | undefined,
  detected: string | null | undefined,
  t: (key: string, values?: Record<string, string>) => string,
): string | null {
  if (!reason) return null;
  const key = VERIFY_REASON_KEYS[reason];
  if (!key) return null;
  return t(key, { detected: detected ?? "" });
}
