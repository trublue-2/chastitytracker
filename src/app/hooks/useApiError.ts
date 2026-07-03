"use client";

import { useTranslations } from "next-intl";
import { PASSWORD_MIN_LENGTH, BCRYPT_MAX_BYTES } from "@/lib/constants";

/**
 * Resolves a stable API error code (see the `errors` message namespace) into a
 * localized message. Unknown or absent codes fall back to the generic error.
 * Password params ({min}/{max}) are always supplied; unused ones are ignored.
 */
export function useApiError() {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  return (code: string | null | undefined): string =>
    code && t.has(code) ? t(code, { min: PASSWORD_MIN_LENGTH, max: BCRYPT_MAX_BYTES }) : tc("error");
}
