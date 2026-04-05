"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { setLocaleCookie } from "@/lib/locale";

/** Switches the active locale and refreshes the page. */
export function useLocaleSwitcher() {
  const router = useRouter();
  return useCallback((value: string) => {
    setLocaleCookie(value);
    router.refresh();
  }, [router]);
}
