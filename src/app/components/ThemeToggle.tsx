"use client";

import { useTranslations } from "next-intl";
import { useTheme, type ThemeMode } from "@/app/hooks/useTheme";
import type { ThemeRole } from "@/lib/theme";

interface Props {
  role: ThemeRole;
  label?: string;
}

const modes: ThemeMode[] = ["light", "system", "dark"];

export default function ThemeToggle({ role, label }: Props) {
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme(role);

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-xs font-medium text-foreground-faint mr-auto whitespace-nowrap">
        {label ?? t("label")}
      </span>
      <div className="flex items-center bg-surface-raised rounded-lg p-0.5 gap-0.5">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              "px-2 py-1 rounded-md text-xs font-medium transition-colors",
              mode === m
                ? "bg-surface text-foreground shadow-sm"
                : "text-foreground-faint hover:text-foreground-muted",
            ].join(" ")}
          >
            {t(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
