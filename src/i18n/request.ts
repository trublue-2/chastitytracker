import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

const VALID_LOCALES = ["de", "en"] as const;
type Locale = (typeof VALID_LOCALES)[number];

function isValidLocale(v: unknown): v is Locale {
  return VALID_LOCALES.includes(v as Locale);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("locale")?.value;
  const locale: Locale = isValidLocale(raw) ? raw : "de";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
