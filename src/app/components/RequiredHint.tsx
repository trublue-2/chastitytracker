"use client";

import { useTranslations } from "next-intl";

export default function RequiredHint() {
  const t = useTranslations("common");
  return <p className="text-xs text-foreground-faint">{t("requiredHint")}</p>;
}
