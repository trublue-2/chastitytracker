"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme, type ThemeMode } from "@/app/hooks/useTheme";

interface Props {
  role: "user" | "admin";
}

const options: { mode: ThemeMode; icon: typeof Sun }[] = [
  { mode: "light", icon: Sun },
  { mode: "system", icon: Monitor },
  { mode: "dark", icon: Moon },
];

export default function ThemeToggle({ role }: Props) {
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme(role);

  return (
    <div className="flex items-center gap-1 px-4 py-2">
      <span className="text-xs font-medium text-foreground-faint mr-auto">{t("label")}</span>
      <div className="flex items-center bg-surface-raised rounded-lg p-0.5 gap-0.5">
        {options.map(({ mode: m, icon: Icon }) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={[
              "p-1.5 rounded-md transition-colors",
              mode === m
                ? "bg-surface text-foreground shadow-sm"
                : "text-foreground-faint hover:text-foreground-muted",
            ].join(" ")}
            aria-label={t(m)}
            title={t(m)}
          >
            <Icon size={14} strokeWidth={1.75} />
          </button>
        ))}
      </div>
    </div>
  );
}
