"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SubmitResult } from "@/app/entries/types";

/**
 * Shared submit-handling for entry-form Cores. Handles saving/error state and
 * try/catch/finally boilerplate. Callers provide the actual network call via
 * `submitFn`; the hook invokes `onSuccess` when the result is ok.
 */
export function useEntrySubmit<P>(
  submitFn: (payload: P) => Promise<SubmitResult>,
  onSuccess?: () => void,
) {
  const tc = useTranslations("common");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(payload: P) {
    setSaving(true);
    setError("");
    try {
      const result = await submitFn(payload);
      if (result.ok === false) setError(result.error);
      else onSuccess?.();
    } catch {
      setError(tc("networkError"));
    } finally {
      setSaving(false);
    }
  }

  return { saving, error, setError, submit };
}
