export const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS"] as const;
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES"] as const;

/** Validates that imageUrl is an internal upload path (prevents SSRF + ownership bypass). */
const ALLOWED_IMAGE_URL = /^\/api\/uploads\/[a-zA-Z0-9._-]+$/;
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = no image, which is valid
  return ALLOWED_IMAGE_URL.test(url);
}
