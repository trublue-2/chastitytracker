"use client";

import { useCallback, useState } from "react";
import {
  STORAGE_KEYS,
  applyTheme,
  readStoredMode,
  type ThemeMode,
  type ThemeRole,
} from "@/lib/theme";

export type { ThemeMode } from "@/lib/theme";

export function useTheme(role: ThemeRole) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode(role));

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      localStorage.setItem(STORAGE_KEYS[role], next);
      applyTheme(role);
      window.dispatchEvent(new CustomEvent("theme-changed", { detail: { role } }));
    },
    [role],
  );

  return { mode, setMode } as const;
}
