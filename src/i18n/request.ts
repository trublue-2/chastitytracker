import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { isValidLocale, toLocale, type Locale } from "@/lib/constants";

export default getRequestConfig(async ({ locale: override }) => {
  // An explicit override (getTranslations({locale})) wins and must NOT touch cookies() — those
  // callers can run outside a request scope where cookies() throws. Otherwise the UI locale comes
  // from the per-browser `locale` cookie (default "de").
  const locale: Locale = isValidLocale(override)
    ? override
    : toLocale((await cookies()).get("locale")?.value);

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
