/**
 * **Die Pillen sind Beschriftungen geworden — Farbe, keine Fläche und kein Rahmen.**
 *
 * `cls` trug bisher Fläche, Schrift und Rand einer gefüllten Pille. Auf einer Kontroll-Liste
 * standen davon zwölf untereinander, jede in ihrem eigenen kleinen Kasten. Was übrig bleibt, ist
 * die Textfarbe.
 *
 * Und sie fällt sparsamer aus als vorher, nach EINER Regel: **Farbe sagt, dass etwas jetzt etwas
 * will.** Eine offene Kontrolle will (Koralle), eine überfällige oder abgelehnte will dringend
 * (Warn) — eine erfüllte und geprüfte will nichts mehr und ist deshalb neutral. Sie war bisher
 * grün, also die auffälligste Farbe der Liste ausgerechnet für den Normalfall.
 */
const AUFMERKSAM = "text-inspect";
const DRINGEND   = "text-warn";
/** Erledigt, geprüft, zurückgezogen — Vergangenes. Trägt keine Farbe. */
const ERLEDIGT   = "text-foreground-muted";
const LEISE      = "text-foreground-faint";

export const ANFORDERUNG_PILLS: Record<string, { labelKey: string; cls: string }> = {
  open:      { labelKey: "pillOpen",      cls: AUFMERKSAM },
  overdue:   { labelKey: "pillOverdue",   cls: DRINGEND },
  fulfilled: { labelKey: "pillFulfilled", cls: ERLEDIGT },
  late:      { labelKey: "pillLate",      cls: DRINGEND },
  withdrawn: { labelKey: "pillWithdrawn", cls: LEISE },
  scheduled: { labelKey: "pillScheduled", cls: AUFMERKSAM },
  missed:    { labelKey: "pillMissed",    cls: DRINGEND },
};

export const VERIFIKATION_PILLS: Record<string, { labelKey: string; cls: string }> = {
  unverified:   { labelKey: "pillUnverified",  cls: LEISE },
  not_required: { labelKey: "pillNotRequired", cls: LEISE },
  pending:      { labelKey: "pillPending",     cls: AUFMERKSAM },
  ai:           { labelKey: "pillAi",          cls: ERLEDIGT },
  manual:       { labelKey: "pillManual",      cls: ERLEDIGT },
  rejected:     { labelKey: "pillRejected",    cls: DRINGEND },
};

// Combined for backwards compatibility
export const KONTROLLE_PILLS: Record<string, { labelKey: string; cls: string }> = {
  ...ANFORDERUNG_PILLS,
  ...VERIFIKATION_PILLS,
};

/** Dieselben vier Töne wie oben, unter den Namen, unter denen die Kombinationslogik sie kennt.
 *  „Grün" heisst hier neutral: der geprüfte Normalfall ist kein Signal. */
const GREEN  = ERLEDIGT;
const ORANGE = AUFMERKSAM;
const RED    = DRINGEND;
const GRAY   = LEISE;

const ANFORDERUNG_KEYS: Record<string, string> = {
  open:        "pillOpen",
  overdue:     "pillOverdue",
  fulfilled:   "pillFulfilled",
  late:        "pillLate",
  withdrawn:   "pillWithdrawn",
  scheduled:   "pillScheduled",
  selfcontrol: "pillSelfcontrol",
  missed:      "pillMissed",
};

const VERIFIKATION_KEYS: Record<string, string> = {
  unverified: "pillUnverified",
  not_required: "pillNotRequired",
  pending:    "pillPending",
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
  // Offene / Überfällige / Versäumte / Zurückgezogene: keine Verifikation vorhanden
  if (anforderungStatus === "open")      return { label: t("pillOpen"),         cls: ORANGE };
  if (anforderungStatus === "overdue")   return { label: t("pillOverdue"),      cls: RED };
  // Versäumt: Frist verstrichen, nie beantwortet — die Eskalation hat das Gerät auto-entfernt.
  if (anforderungStatus === "missed")    return { label: t("pillMissed"),       cls: RED };
  if (anforderungStatus === "withdrawn") return { label: t("pillWithdrawn"),    cls: GRAY };

  const aKey = anforderungStatus ?? "selfcontrol";
  const aLabel = t(ANFORDERUNG_KEYS[aKey] ?? "pillSelfcontrol");
  const vLabel = verifikationStatus ? t(VERIFIKATION_KEYS[verifikationStatus] ?? "pillUnverified") : null;
  const label = vLabel ? `${aLabel} – ${vLabel}` : aLabel;

  // Verifizierung läuft noch (KI-Check nicht abgeschlossen): unabhängig vom Anforderungs-Status
  // immer ORANGE ("in Arbeit", kein Problem) — muss vor den verified/rejected-Checks stehen, sonst
  // fällt "pending" fälschlich auf den rejected/grau-Default durch.
  if (verifikationStatus === "pending") return { label, cls: ORANGE };

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
