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
