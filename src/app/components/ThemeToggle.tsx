"use client";

import { useTranslations } from "next-intl";
import { useTheme, type ThemeMode } from "@/app/hooks/useTheme";
import type { ThemeRole } from "@/lib/theme";
import SegmentedControl from "@/app/components/SegmentedControl";

interface Props {
  role: ThemeRole;
  label?: string;
}

export default function ThemeToggle({ role, label }: Props) {
  const t = useTranslations("theme");
  const { mode, setMode } = useTheme(role);

  const options = [
    { value: "light", label: t("light") },
    { value: "system", label: t("system") },
    { value: "dark", label: t("dark") },
  ];

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-xs font-medium text-foreground-faint mr-auto whitespace-nowrap">
        {label ?? t("label")}
      </span>
      <SegmentedControl
        options={options}
        value={mode}
        onChange={(v) => setMode(v as ThemeMode)}
      />
    </div>
  );
}
