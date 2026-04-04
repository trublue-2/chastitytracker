"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * useViewTransition — wraps router.push() inside document.startViewTransition()
 * for smooth page-to-page animations. Falls back to plain navigation on
 * unsupported browsers.
 *
 * Support: Chrome 111+, Safari 18+
 */
export default function useViewTransition() {
  const router = useRouter();

  const navigateWithTransition = useCallback(
    (href: string) => {
      // Check for View Transitions API support
      if (
        typeof document !== "undefined" &&
        "startViewTransition" in document &&
        typeof (document as { startViewTransition?: (cb: () => void) => void }).startViewTransition === "function"
      ) {
        (document as { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
          router.push(href);
        });
      } else {
        router.push(href);
      }
    },
    [router]
  );

  return { navigateWithTransition };
}
