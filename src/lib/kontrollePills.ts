export const ANFORDERUNG_PILLS: Record<string, { labelKey: string; cls: string }> = {
  open:      { labelKey: "pillOpen",      cls: "bg-[var(--color-inspect-bg)] text-[var(--color-inspect-text)] border-[var(--color-inspect-border)]" },
  overdue:   { labelKey: "pillOverdue",   cls: "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)]" },
  fulfilled: { labelKey: "pillFulfilled", cls: "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]" },
  late:      { labelKey: "pillLate",      cls: "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)]" },
  withdrawn: { labelKey: "pillWithdrawn", cls: "bg-[var(--surface-raised)] text-[var(--foreground-muted)] border-[var(--border)]" },
};

export const VERIFIKATION_PILLS: Record<string, { labelKey: string; cls: string }> = {
  unverified: { labelKey: "pillUnverified", cls: "bg-[var(--surface-raised)] text-[var(--foreground-muted)] border-[var(--border)]" },
  ai:         { labelKey: "pillAi",         cls: "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]" },
  manual:     { labelKey: "pillManual",     cls: "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]" },
  rejected:   { labelKey: "pillRejected",   cls: "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)]" },
};

// Combined for backwards compatibility
export const KONTROLLE_PILLS: Record<string, { labelKey: string; cls: string }> = {
  ...ANFORDERUNG_PILLS,
  ...VERIFIKATION_PILLS,
};

const GREEN  = "bg-[var(--color-lock-bg)] text-[var(--color-lock-text)] border-[var(--color-lock-border)]";
const ORANGE = "bg-[var(--color-inspect-bg)] text-[var(--color-inspect-text)] border-[var(--color-inspect-border)]";
const RED    = "bg-[var(--color-warn-bg)] text-[var(--color-warn-text)] border-[var(--color-warn-border)]";
const GRAY   = "bg-[var(--surface-raised)] text-[var(--foreground-muted)] border-[var(--border)]";

const ANFORDERUNG_KEYS: Record<string, string> = {
  open:        "pillOpen",
  overdue:     "pillOverdue",
  fulfilled:   "pillFulfilled",
  late:        "pillLate",
  withdrawn:   "pillWithdrawn",
  selfcontrol: "pillSelfcontrol",
};

const VERIFIKATION_KEYS: Record<string, string> = {
  unverified: "pillUnverified",
  ai:         "pillAi",
  manual:     "pillManual",
  rejected:   "pillRejected",
};

/**
 * Kombiniert AnforderungStatus + VerifikationStatus zu einer einzigen Pill.
 * Label = beide Stati verbunden mit " – ", Farbe nach Kombinationslogik.
 * t = Übersetzungsfunktion aus getTranslations("admin") bzw. useTranslations("admin")
 */
export function getKombinierterPill(
  anforderungStatus: string | null,
  verifikationStatus: string | null,
  t: (key: string) => string,
): { label: string; cls: string } | null {
  // Offene / Überfällige / Zurückgezogene: keine Verifikation vorhanden
  if (anforderungStatus === "open")      return { label: t("pillOpen"),         cls: ORANGE };
  if (anforderungStatus === "overdue")   return { label: t("pillOverdue"),      cls: RED };
  if (anforderungStatus === "withdrawn") return { label: t("pillWithdrawn"),    cls: GRAY };

  const aKey = anforderungStatus ?? "selfcontrol";
  const aLabel = t(ANFORDERUNG_KEYS[aKey] ?? "pillSelfcontrol");
  const vLabel = verifikationStatus ? t(VERIFIKATION_KEYS[verifikationStatus] ?? "pillUnverified") : null;
  const label = vLabel ? `${aLabel} – ${vLabel}` : aLabel;

  const verified = verifikationStatus === "manual" || verifikationStatus === "ai";
  const rejected = verifikationStatus === "rejected";

  // Selbstkontrolle (kein Anforderung)
  if (anforderungStatus === null) {
    if (verified) return { label, cls: GREEN };
    if (rejected) return { label, cls: ORANGE };
    return { label, cls: GRAY };
  }

  // Erfüllt (pünktlich)
  if (anforderungStatus === "fulfilled") {
    if (verified) return { label, cls: GREEN };
    if (rejected) return { label, cls: RED };
    return { label, cls: GRAY };
  }

  // Zu spät erfüllt
  if (anforderungStatus === "late") {
    if (verified) return { label, cls: ORANGE };
    if (rejected) return { label, cls: RED };
    return { label, cls: ORANGE };
  }

  return null;
}
