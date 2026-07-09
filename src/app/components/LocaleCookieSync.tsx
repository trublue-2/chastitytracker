"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setLocaleCookie } from "@/lib/locale";

/**
 * One-time bridge that adopts the logged-in account's stored language on a device that has no
 * `locale` cookie yet (fresh browser / new device). The layout only renders this when the cookie
 * is absent, so once it sets the cookie and refreshes, it is no longer mounted — no loop, and it
 * never overrides a language the user actively picked on this device.
 */
export default function LocaleCookieSync({ locale }: { locale: string }) {
  const router = useRouter();
  useEffect(() => {
    setLocaleCookie(locale);
    router.refresh();
  }, [locale, router]);
  return null;
}
