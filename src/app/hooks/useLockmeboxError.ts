"use client";

import { useTranslations } from "next-intl";
import { useApiError } from "@/app/hooks/useApiError";
import type { LockmeboxSessionOutcome } from "@/lib/lockmeboxBle";

/** So viel der letzten Zeile der Box zeigt die Fehlermeldung — genug, um das Format zu erkennen. */
const LAST_LINE_MAX = 80;

/** Der Satz zu einer gescheiterten Bluetooth-Sitzung — für jede Sitzung an der LockMeBox derselbe. */
export function useLockmeboxError(): (failure: Extract<LockmeboxSessionOutcome, { ok: false }>) => string {
  const t = useTranslations("lockmebox");
  const apiError = useApiError();
  return (failure) =>
    failure.error === "server" ? (failure.code ? apiError(failure.code) : t("serverUnreachable"))
    : failure.error === "noReply" && failure.lastLine ? t("noReplyLast", { line: failure.lastLine.slice(0, LAST_LINE_MAX) })
    : t(failure.error);
}
