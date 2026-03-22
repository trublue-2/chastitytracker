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
  manual:     { label: "Manuell verifiziert", cls: "bg-green-50 text-green-700 border-green-200" },
  rejected:   { label: "Abgelehnt",           cls: "bg-red-50 text-red-700 border-red-200" },
};

// Combined for backwards compatibility
export const KONTROLLE_PILLS: Record<string, { label: string; cls: string }> = {
  ...ANFORDERUNG_PILLS,
  ...VERIFIKATION_PILLS,
};
