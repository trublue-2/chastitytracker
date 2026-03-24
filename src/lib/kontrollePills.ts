export const ANFORDERUNG_PILLS: Record<string, { labelKey: string; cls: string }> = {
  open:      { labelKey: "pillOpen",      cls: "bg-orange-50 text-orange-700 border-orange-200" },
  overdue:   { labelKey: "pillOverdue",   cls: "bg-red-50 text-red-600 border-red-200" },
  fulfilled: { labelKey: "pillFulfilled", cls: "bg-green-50 text-green-700 border-green-200" },
  late:      { labelKey: "pillLate",      cls: "bg-red-50 text-red-600 border-red-200" },
  withdrawn: { labelKey: "pillWithdrawn", cls: "bg-gray-100 text-gray-400 border-gray-200" },
};

export const VERIFIKATION_PILLS: Record<string, { labelKey: string; cls: string }> = {
  unverified: { labelKey: "pillUnverified", cls: "bg-gray-100 text-gray-400 border-gray-200" },
  ai:         { labelKey: "pillAi",         cls: "bg-green-50 text-green-700 border-green-200" },
  manual:     { labelKey: "pillManual",     cls: "bg-green-50 text-green-700 border-green-200" },
  rejected:   { labelKey: "pillRejected",   cls: "bg-red-50 text-red-700 border-red-200" },
};

// Combined for backwards compatibility
export const KONTROLLE_PILLS: Record<string, { labelKey: string; cls: string }> = {
  ...ANFORDERUNG_PILLS,
  ...VERIFIKATION_PILLS,
};

const GREEN  = "bg-green-50 text-green-700 border-green-200";
const ORANGE = "bg-orange-50 text-orange-700 border-orange-200";
const RED    = "bg-red-50 text-red-600 border-red-200";
const GRAY   = "bg-gray-100 text-gray-400 border-gray-200";

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
