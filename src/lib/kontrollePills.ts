export const ANFORDERUNG_PILLS: Record<string, { label: string; cls: string }> = {
  open:      { label: "Offen",             cls: "bg-orange-50 text-orange-700 border-orange-200" },
  overdue:   { label: "Überfällig",        cls: "bg-red-50 text-red-600 border-red-200" },
  fulfilled: { label: "Erfüllt",           cls: "bg-green-50 text-green-700 border-green-200" },
  late:      { label: "Zu spät erfüllt",   cls: "bg-red-50 text-red-600 border-red-200" },
  withdrawn: { label: "Zurückgezogen",     cls: "bg-gray-100 text-gray-400 border-gray-200" },
};

export const VERIFIKATION_PILLS: Record<string, { label: string; cls: string }> = {
  unverified: { label: "Unverifiziert",       cls: "bg-gray-100 text-gray-400 border-gray-200" },
  ai:         { label: "KI-verifiziert",      cls: "bg-green-50 text-green-700 border-green-200" },
  manual:     { label: "Bestätigt",           cls: "bg-green-50 text-green-700 border-green-200" },
  rejected:   { label: "Abgelehnt",           cls: "bg-red-50 text-red-700 border-red-200" },
};

// Combined for backwards compatibility
export const KONTROLLE_PILLS: Record<string, { label: string; cls: string }> = {
  ...ANFORDERUNG_PILLS,
  ...VERIFIKATION_PILLS,
};

const GREEN  = "bg-green-50 text-green-700 border-green-200";
const ORANGE = "bg-orange-50 text-orange-700 border-orange-200";
const RED    = "bg-red-50 text-red-600 border-red-200";
const GRAY   = "bg-gray-100 text-gray-400 border-gray-200";

const ANFORDERUNG_LABELS: Record<string, string> = {
  open:      "Offen",
  overdue:   "Überfällig",
  fulfilled: "Erfüllt",
  late:      "Zu spät erfüllt",
  withdrawn: "Zurückgezogen",
  selfcontrol: "Selbstkontrolle",
};

const VERIFIKATION_LABELS: Record<string, string> = {
  unverified: "Unverifiziert",
  ai:         "KI-verifiziert",
  manual:     "Bestätigt",
  rejected:   "Abgelehnt",
};

/**
 * Kombiniert AnforderungStatus + VerifikationStatus zu einer einzigen Pill.
 * Label = beide Stati verbunden mit " – ", Farbe nach Kombinationslogik.
 */
export function getKombinierterPill(
  anforderungStatus: string | null,
  verifikationStatus: string | null,
): { label: string; cls: string } | null {
  // Offene / Überfällige / Zurückgezogene: keine Verifikation vorhanden
  if (anforderungStatus === "open")      return { label: "Offen",         cls: ORANGE };
  if (anforderungStatus === "overdue")   return { label: "Überfällig",    cls: RED };
  if (anforderungStatus === "withdrawn") return { label: "Zurückgezogen", cls: GRAY };

  const aKey = anforderungStatus ?? "selfcontrol";
  const aLabel = ANFORDERUNG_LABELS[aKey] ?? aKey;
  const vLabel = verifikationStatus ? (VERIFIKATION_LABELS[verifikationStatus] ?? verifikationStatus) : null;
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
