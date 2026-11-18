"use client";

import { useTranslations } from "next-intl";
import Toggle from "@/app/components/Toggle";
import { useDebugMode } from "@/app/hooks/useDebugMode";

/** Der Schalter für den Debug-Modus ({@link useDebugMode}) — nur auf diesem Gerät. */
export default function DebugModeToggle() {
  const t = useTranslations("changelog");
  const [enabled, setEnabled] = useDebugMode();
  return <Toggle label={t("debugMode")} description={t("debugModeHint")} checked={enabled} onChange={setEnabled} />;
}
