import type { EntryValidationCode } from "@/lib/entryErrors";
import type { ServiceErrorCode } from "@/lib/serviceErrorCodes";
import type { TaskState } from "@/lib/tasks";

export const VALID_LOCALES = ["de", "en"] as const;
export type Locale = (typeof VALID_LOCALES)[number];
/** Single source for locale validation — shared by i18n/request.ts, the settings API and the sync. */
export function isValidLocale(v: unknown): v is Locale {
  return typeof v === "string" && (VALID_LOCALES as readonly string[]).includes(v);
}

/** Clamp any value to a valid locale, falling back to "de" (the default). */
export function toLocale(v: unknown): Locale {
  return isValidLocale(v) ? v : "de";
}

/** Public marketing site — hosts the user-facing how-to / FAQ content linked from the app. */
export const MARKETING_URL = "https://chastitytracker.ch";
/** Locale-aware link to the public inspection explanation (marketing FAQ; EN lives under /en). */
export function inspectionHelpUrl(locale: string): string {
  return locale === "en" ? `${MARKETING_URL}/en/faq` : `${MARKETING_URL}/faq`;
}

/** Locale-aware link to the public AI-keyholder/MCP explainer. The two locales are separate posts
 *  with their own slugs (linked via `translationSlug` on the marketing side), not one path prefixed. */
export function mcpHelpUrl(locale: string): string {
  return locale === "en"
    ? `${MARKETING_URL}/en/blog/ai-keyholder-mcp`
    : `${MARKETING_URL}/blog/ki-keyholder-mcp`;
}

/**
 * Sprungmarke der Aufgaben-Historie auf dem Sub-Dashboard (`TaskList`).
 *
 * Ziel des Aufgaben-Badges an `OffenseCard`: eine Strafaufgabe, die den Aufgaben-Block oben schon
 * verlassen hat (versäumt, abgebrochen, erledigt), steht NUR noch in dieser Liste — ohne den Sprung
 * dorthin sagte das Badge „als Aufgabe gestellt" und liess den Träger stehen. Als Konstante, weil
 * Sprungmarke und Link sonst in zwei Dateien liegen und ein Umbenennen die eine stumm ins Leere
 * laufen liesse: ein fehlender Anker wirft nicht, er scrollt einfach nicht.
 *
 * BEKANNTE GRENZE: der Sprung führt an die Liste, nicht an die einzelne Aufgabe — die blättert zu
 * fünft (`usePagedList`), und gerade die hier gemeinten (versäumt, abgebrochen) stehen selten auf
 * Seite 1. Ein gezielter Deep-Link (Seite vorwählen + Sheet öffnen) wäre der nächste Schritt.
 */
export const TASK_LIST_ANCHOR = "tasks";

export const LOCALES = [
  { value: "de", label: "DE" },
  { value: "en", label: "EN" },
] as const;

export const LOCALES_LONG = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
] as const;

export const VALID_TYPES = ["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"] as const;
/** Entry types restricted to KG (the built-in DeviceCategory). */
export const KG_ENTRY_TYPES: ReadonlySet<string> = new Set(["VERSCHLUSS", "OEFFNEN"]);
/** Entry types for non-KG DeviceCategories (Plug, Collar, ...). Require deviceId. */
export const WEAR_ENTRY_TYPES: ReadonlySet<string> = new Set(["WEAR_BEGIN", "WEAR_END"]);
/** Entry types that may carry a box photo (`boxImageUrl`): der Schlüssel-Nachweis durchs
 *  Sichtfenster der Heimdall-Box. Beim Einschliessen entsteht er, bei jeder Kontrolle wird er
 *  wiederholt — und nur die Wiederholung belegt, dass der Schlüssel drin GEBLIEBEN ist. Die
 *  Wiederholung darf seit `lib/boxKeyProof.ts` auch aus der Telemetrie kommen (unbewegter Riegel
 *  seit dem letzten Nachweis) — das ersetzt aber nur ein FEHLENDES Foto, nie ein vorliegendes. */
export const BOX_PHOTO_TYPES: ReadonlySet<string> = new Set(["VERSCHLUSS", "PRUEFUNG"]);
/** `BoxEvent.type`: die Übergänge, die der Heimdall-Server melden darf (Ingest-Whitelist). */
export const BOX_EVENT_TYPES = ["LOCKED", "UNLOCKED", "EARLY_OPEN", "UNAUTHORIZED_OPEN"] as const;
/** Davon die Bewegungen AUS der Verschluss-Stellung — die Gegenprobe des Schlüssel-Nachweises aus der
 *  Telemetrie (`lib/boxKeyProof.ts`). Abgeleitet, damit ein neuer Ereignis-Typ nur EINE Liste braucht. */
export const BOLT_OPEN_EVENT_TYPES = BOX_EVENT_TYPES.filter((t) => t !== "LOCKED");
/** Feature flag: gate WEAR_BEGIN/WEAR_END entry creation + categories UI.
 *  Default ON. Setze `ENABLE_DEVICE_CATEGORIES=false` um KG-only-Verhalten zu erzwingen
 *  (z.B. fuer eine Instanz die das Feature noch nicht ausrollen will).
 *  Case-insensitive damit `False`/`FALSE` nicht still als ON durchrutschen. */
export function deviceCategoriesEnabled(): boolean {
  return process.env.ENABLE_DEVICE_CATEGORIES?.toLowerCase() !== "false";
}

/** Gewichtstracking (Wiegen, BMI, Verlauf) — Instanz-Schalter.
 *
 *  **Opt-in wie der Bildersafe: Default AUS**, eingeschaltet mit `ENABLE_WEIGHT_TRACKING=true`.
 *  Gewicht und BMI sind Gesundheitsdaten, und eine Instanz, die sie nie erhebt, soll das Feature
 *  auch nicht angeboten bekommen — nicht einmal als Schalter in den Einstellungen. Wer es will,
 *  sagt es einmal.
 *
 *  „An" heisst danach immer noch NICHT „sichtbar": je Träger schaltet zusätzlich die Keyholderin
 *  (`User.weightTrackingEnabled`, ebenfalls Default false). Zwei Schalter, zwei Fragen — darf diese
 *  Instanz das überhaupt, und will diese Keyholderin es für diesen Träger.
 *
 *  Case-insensitive, damit `True`/`TRUE` nicht still als AUS durchrutschen. */
export function weightTrackingEnabled(): boolean {
  return process.env.ENABLE_WEIGHT_TRACKING?.toLowerCase() === "true";
}

/** Bildersafe (softwareseitige Schlüssel-Verwahrung: versiegeltes Foto des Schlüsselbox-Codes).
 *  Eigenständiges, opt-in Feature pro Instanz via `ENABLE_BILDERSAFE=true` (Default aus).
 *  Unabhängig von Heimdall (das über HEIMDALL_SYNC_SECRET aktiviert wird) — beide können
 *  einzeln aktiviert werden. Siegel + Kontrollen (Schicht A) sind davon unberührt. */
export function bildersafeEnabled(): boolean {
  return process.env.ENABLE_BILDERSAFE?.toLowerCase() === "true";
}

/** Grenzen des Bild-Abrufs. Freigeschaltet wird er NICHT hier, sondern über `mcpImageKeyUnlocked()`
 *  in `src/lib/mcp/entryImage.ts` — der Schlüssel braucht die Datenbank und kann deshalb nicht in
 *  dieser client-erreichbaren Datei liegen.
 *
 *  BEWUSST NICHT über ENV justierbar, anders als die Px-Budgets darunter:
 *  das sind keine Leistungs-Stellschrauben, sondern die Zusage, wie weit der Abruf reicht. Eine
 *  Zusage, die sich per Umgebungsvariable aufweichen lässt, ist keine.
 *
 *  Zusammen genommen ist das Archiv damit nicht mehr erreichbar, sondern nur noch das, was gerade
 *  passiert ist: 24 Stunden Reichweite, 4 Bilder pro Stunde, 12 pro Tag. */
export const MCP_IMAGE_MAX_AGE_H = 24;
export const MCP_IMAGE_MAX_AGE_MS = MCP_IMAGE_MAX_AGE_H * 60 * 60 * 1000;
export const MCP_IMAGE_PER_HOUR = 4;
export const MCP_IMAGE_PER_DAY = 12;

/** Kantenlänge, auf die ein Foto für den MCP heruntergerechnet wird. BEWUSST getrennt von
 *  `visionMaxImagePx()`: der Wert dort ist auf eine lokale Vision-Box getunt, und wer ihn für sein
 *  eigenes Modell senkt, darf damit nicht verkleinern, was das Keyholder-Modell zu sehen bekommt.
 *  Env: `MCP_IMAGE_MAX_PX` (Default 1400). */
export function mcpImageMaxPx(): number {
  const n = Number(process.env.MCP_IMAGE_MAX_PX);
  return Number.isFinite(n) && n >= 256 ? n : 1400;
}

/** Max. Kantenlänge (px), auf die Bilder VOR einer Vision-Anfrage runterskaliert werden.
 *  Reduziert die Vision-Tokens/Latenz drastisch (v.a. lokale Modelle wie Ollama) bei kaum
 *  Genauigkeitsverlust für Ziffern/Geräte. Justierbar via `VISION_MAX_IMAGE_PX` (Default 1024). */
export function visionMaxImagePx(): number {
  const n = Number(process.env.VISION_MAX_IMAGE_PX);
  return Number.isFinite(n) && n >= 256 ? n : 1024;
}

/** Kleinere Kantenlänge für GERÄTE-Tasks (detect/check): dort zählen mehrere Bilder gleichzeitig,
 *  und die Geräte-Form ist auch bei weniger Auflösung erkennbar. Jedes Bild kostet Tokens ∝ px²,
 *  daher ist Verkleinern hier der größte Speed-Hebel. Env: VISION_DEVICE_MAX_IMAGE_PX (Default 768). */
export function visionDeviceMaxImagePx(): number {
  const n = Number(process.env.VISION_DEVICE_MAX_IMAGE_PX);
  return Number.isFinite(n) && n >= 256 ? n : 768;
}

/** Max. Referenzbilder JE Gerät im Vision-Prompt. Jedes Bild kostet ~1060 Tokens (~6s bei
 *  qwen2.5-vl auf M1) — das ist der dominante Latenz-Faktor, NICHT die Auflösung. Weniger Bilder =
 *  deutlich schneller; mehr = robustere Erkennung. Env: VISION_MAX_REFS_PER_DEVICE (Default 2). */
export function visionMaxRefsPerDevice(): number {
  const n = Number(process.env.VISION_MAX_REFS_PER_DEVICE);
  return Number.isFinite(n) && n >= 1 ? n : 2;
}

/** Obergrenze für die GESAMTzahl Referenzbilder im Geräte-Prompt (über alle Geräte), damit die
 *  Latenz bei vielen Geräten nicht explodiert. Verteilt wird sie von `allocateImageBudget`.
 *  NICHT hart: jedes Gerät braucht sein Grundbild, um überhaupt Kandidat zu sein — gibt es mehr
 *  Geräte als Budget, wird sie bewusst überzogen. Env: VISION_MAX_TOTAL_REFS (Default 6). */
export function visionMaxTotalRefs(): number {
  const n = Number(process.env.VISION_MAX_TOTAL_REFS);
  return Number.isFinite(n) && n >= 1 ? n : 6;
}

/** Heimdall-Hardware-Box aktiv? = Sync-Secret gesetzt. Gilt für Integration UND Box-UI:
 *  ohne Secret werden keine Box-Aktionen angezeigt (auch wenn noch alte BoxStatus-Zeilen existieren). */
export function heimdallEnabled(): boolean {
  return !!process.env.HEIMDALL_SYNC_SECRET;
}
export const ORGASMUS_ARTEN = ["Orgasmus", "ruinierter Orgasmus", "feuchter Traum"] as const;
/** Maps each ORGASMUS_ARTEN value to its orgasmForm i18n key (shared by entry + Anforderung forms). */
export const ORGASMUS_ART_I18N_KEYS: Record<string, string> = {
  "Orgasmus": "artOrgasmus",
  "ruinierter Orgasmus": "artRuiniert",
  "feuchter Traum": "artTraum",
};
/** Translates an orgasmusArt base value via the orgasmForm namespace, falling back to the raw value. */
export function orgasmusArtLabel(art: string, t: (key: string) => string): string {
  const key = ORGASMUS_ART_I18N_KEYS[art];
  return key ? t(key) : art;
}
/** Charakter einer Orgasmus-Aufforderung: ANWEISUNG = Pflicht, GELEGENHEIT = Erlaubnis. */
export const ORGASMUS_ANFORDERUNG_ARTEN = ["ANWEISUNG", "GELEGENHEIT"] as const;
export type OrgasmusAnforderungArt = typeof ORGASMUS_ANFORDERUNG_ARTEN[number];
/** Translates an OrgasmusAnforderung `art` (ANWEISUNG/GELEGENHEIT) via the admin namespace.
 *  Shared by the request form and the admin banners (overview + user detail) to avoid a
 *  duplicated ternary at each call site. */
export function orgasmusAnforderungArtLabel(art: OrgasmusAnforderungArt, t: (key: string) => string): string {
  return art === "ANWEISUNG" ? t("orgasmReqModeAnweisung") : t("orgasmReqModeGelegenheit");
}
// AUTO_ENTFERNT: system-only reason for the auto-created OEFFNEN entry when a Kontrolle's
// escalation reminder is ignored (see inspectionEscalationService.ts). Protected like REINIGUNG
// (reservedCodes() covers all of OEFFNEN_GRUENDE), but unlike REINIGUNG it must never be
// user-selectable — see SYSTEM_ONLY_OPENING_CODES below, filtered out of the sub's own dropdown.
/** Eintragstypen, die ein Gerät tragen — Ownership-Guard und `create` beider Entry-Routen lesen
 *  dieselbe Liste. Getrennte Literale liefen auseinander: ein Gerät validiert, aber nicht
 *  gespeichert (oder umgekehrt) fällt niemandem auf. PRUEFUNG kam mit den Ziel-Kontrollen dazu (v5.0.1).
 *  Hinweis: `VerschlussAnforderung.deviceId` ist NICHT gemeint — das ist die Anforderung, kein Eintrag. */
export const DEVICE_BEARING_TYPES: readonly string[] = ["VERSCHLUSS", "WEAR_BEGIN", "WEAR_END", "PRUEFUNG"];

export const AUTO_ENTFERNT_REASON = "AUTO_ENTFERNT";
export const OEFFNEN_GRUENDE = ["REINIGUNG", "KEYHOLDER", "NOTFALL", "ANDERES", AUTO_ENTFERNT_REASON] as const;
export type OeffnenGrund = typeof OEFFNEN_GRUENDE[number];
/** Reserved AND hidden from the user-facing opening-reason picker — system-only codes. */
export const SYSTEM_ONLY_OPENING_CODES: readonly string[] = [AUTO_ENTFERNT_REASON];

/** Wer einen Eintrag verursacht hat. `system` = niemand hat gehandelt, der Tracker hat gebucht
 *  (Eskalation einer unbeantworteten Kontrolle). Spiegelt die `Entry.source`-Spalte; die Regel
 *  „nur eine WILLENTLICHE Handlung hat Folgen" hängt daran (Strafbuch, Sperrzeit-Bruch). */
export const ENTRY_SOURCES = ["user", "system"] as const;
export type EntrySource = typeof ENTRY_SOURCES[number];

/**
 * Warum eine VerschlussAnforderung/Sperrzeit `withdrawnAt` trägt — die Endart, nicht nur das Ende.
 *
 * Ohne sie sah eine vom Sub aufgebrochene Sperrzeit exakt aus wie eine bewusst zurückgezogene und
 * wie eine, die es nie gab: `withdrawnAt` gesetzt, sonst nichts. Genau diese Ununterscheidbarkeit
 * war der Bug (11.07.2026 — eine 14-Tage-Sperre verschwand spurlos).
 *
 * `null` heisst „noch nicht beendet" ODER „vor v4.50.30 beendet" — Alt-Zeilen tragen keinen Grund.
 */
export const LOCK_ENDED_REASON = {
  /** Bewusst zurückgezogen (Keyholder-Aktion oder von einer neuen Direktive ersetzt). */
  keyholder: "keyholder",
  /** Durch eine Öffnung des Subs beendet. Ob diese Öffnung ERLAUBT war, sagt das Strafbuch —
   *  hier steht nur, WIE die Sperrzeit endete, nicht ob jemand sich etwas zuschulden kommen liess. */
  opening: "opening",
  /** Vom Poller verworfen, weil sie im Moment ihrer Auslösung schon gegenstandslos war. */
  obsolete: "obsolete",
} as const;
export type LockEndedReason = typeof LOCK_ENDED_REASON[keyof typeof LOCK_ENDED_REASON];

/** Maps OEFFNEN_GRUENDE values to openForm i18n keys */
export const GRUND_I18N_KEYS: Record<typeof OEFFNEN_GRUENDE[number], string> = {
  REINIGUNG: "grundReinigung",
  KEYHOLDER: "grundKeyholder",
  NOTFALL: "grundNotfall",
  ANDERES: "grundAnderes",
  AUTO_ENTFERNT: "grundAutoEntfernt",
};

// ── Entry display constants (shared by dashboard + admin entry lists) ─────────

/** Maps entry type to stats i18n key (e.g. tStats(TYPE_STATS_KEYS["VERSCHLUSS"]) → "Lock") */
export const TYPE_STATS_KEYS: Record<string, string> = {
  VERSCHLUSS: "lock",
  OEFFNEN: "opening",
  PRUEFUNG: "inspection",
  ORGASMUS: "orgasm",
  WEAR_BEGIN: "wearBegin",
  WEAR_END: "wearEnd",
};

/** Hex colors for HTML email templates (no Tailwind/CSS vars available in email) */
export const TYPE_EMAIL_COLORS: Record<string, string> = {
  VERSCHLUSS: "#16a34a",
  OEFFNEN: "#dc2626",
  PRUEFUNG: "#f97316",
  ORGASMUS: "#8b5cf6",
};

/** User-Spalten, die ein Nutzer über den generischen `userSelfFieldRoute`-Handler SELBST ändern
 *  darf. Bewusst eng gehalten und compilerseitig erzwungen: admin-gesetzte Felder (`role`,
 *  `reinigungErlaubt`, `mobileDesktopUpload`, …) gehören NICHT hierher — die brauchen laut
 *  CLAUDE.md („Admin-Felder in User-Settings") zwingend `requireAdminApi()`.
 *  `email`/`passwordHash` sind ebenfalls Self-Felder, laufen aber über eigene Handler
 *  (Trim/409 bzw. anderer Body-Key + bcrypt) und stehen deshalb nicht in dieser Liste. */
export const SELF_EDITABLE_USER_FIELDS = [
  "timezone", "locale", "hideOwnTracker", "startPage", "dashboardLayout",
  // Gewichtstracking: Angaben ÜBER den Träger, nicht Vorgaben AN ihn. Die Keyholder-Felder
  // (`weightTrackingEnabled`, `weighingWindows`, `targetWeightKeyholderKg`) stehen bewusst nicht
  // hier — sie laufen über `requireKeyholderOrAdminApi()`.
  "heightCm", "unitSystem", "targetWeightKg",
] as const;
export type SelfEditableUserField = (typeof SELF_EDITABLE_USER_FIELDS)[number];

/** Stabiler Fehler-Code der Settings-Services, wenn ein Patch kein einziges Feld setzt. Geteilt von
 *  setReinigungSettings / setAutoKontrolleSettings / setInspectionEscalationSettings, damit die
 *  drei Geschwister nicht auseinanderlaufen. Der Client löst ihn über den `errors`-Namespace auf. */
export const NO_FIELDS_TO_UPDATE = "noFieldsToUpdate";

/** Stabiler Fehler-Code für ein Feld, das keine gültige „HH:MM"-Uhrzeit ist. */
export const INVALID_TIME = "invalidTime";

/** Stabiler Fehler-Code für ein „von – bis"-Paar, dessen Ende nicht nach dem Start liegt. */
export const TIME_RANGE_INVALID = "timeRangeInvalid";

/** Eine Uhrzeit des Tages, „HH:MM" im 24-Stunden-Format. EINE Quelle für alle Wanduhr-Felder
 *  (Schlaf-/Auslöse-Fenster der Auto-Kontrollen, Reinigungs-Fenster) — hier statt in einem der
 *  Services, weil beide dieselbe Regel brauchen und ein Import zwischen ihnen einen Modul-Zyklus
 *  schlösse (reinigungService → autoKontrolleService → queries → reinigungService). */
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Zulässiger Wertebereich EINES Zahlen-Feldes. `fallback` = Wert bei fehlender Eingabe — NICHT die
 *  Untergrenze, deshalb ein eigenes Feld. Wann er greift, entscheidet die jeweilige Klemm-Funktion und
 *  ist bewusst verschieden: `clamp` (Server) nimmt ihn auch für einen auf 0 gerundeten Wert,
 *  `clampInputValue` (Formular) nur für eine leere/unlesbare Eingabe — eine getippte „0" landet dort
 *  auf `min`. Siehe die Begründung bei `clampInputValue` in `utils.ts`. */
export interface NumberRange {
  readonly min: number;
  readonly max: number;
  readonly fallback: number;
}

/*
 * Wertebereiche der Admin-Settings — EINE Quelle für alle Seiten: die Services klemmen damit beim
 * Schreiben (`clamp`), die Formulare geben denselben Bereich an `NumberInput` weiter, und die
 * MCP-Tool-Schemas/dryRun-Previews nennen bzw. zeigen denselben Bereich. Getrennte Kopien driften
 * unbemerkt: klemmt das Formular auf einen veralteten Bereich, zerstört es die Eingabe, bevor der
 * Server sie überhaupt sieht. Hier statt im jeweiligen Service, weil `NumberInput` ein Client-Modul
 * ist und dieses hier — anders als die Services — keinen Prisma-Client mitzieht.
 *
 * JE FELD eine Konstante, auch wo zwei Felder einer „von – bis"-Zeile min/max teilen: der Fallback
 * gehört zum Feld (er spiegelt dessen `@default` im Prisma-Schema), nicht zum Bereich. Ein optionaler
 * Fallback hätte ihn stattdessen an jedes Call-Site zurückgereicht — genau die Kopie, die hier weg soll.
 */

/** Minuten je Reinigungspause. */
export const CLEANING_MAX_MINUTES_RANGE = { min: 1, max: 120, fallback: 15 } as const satisfies NumberRange;
/** Reinigungspausen pro Tag (0 = unbegrenzt). */
export const CLEANING_MAX_PER_DAY_RANGE = { min: 0, max: 20, fallback: 0 } as const satisfies NumberRange;
/** Höchstzahl der Reinigungs-Fenster eines Tages (Listen-Länge, kein Zahlen-Feld → kein `NumberRange`).
 *  Durchgesetzt in `setReinigungSettings`, also für JEDEN Schreiber der Spalte. */
export const CLEANING_WINDOWS_MAX = 12;
/** Stabiler Fehler-Code, wenn ein Schreibvorgang mehr als {@link CLEANING_WINDOWS_MAX} Fenster setzt.
 *  Nennt die Zahl bewusst nicht — dafür bräuchte die Meldung einen ICU-Parameter (siehe DEVICE_CODES). */
export const CLEANING_WINDOWS_TOO_MANY = "CLEANING_WINDOWS_TOO_MANY";

/** Körpergrösse in cm. Grosszügig gefasst — die Grenzen fangen den Tippfehler (17 cm, 1780 cm),
 *  nicht den ungewöhnlichen Menschen. */
export const HEIGHT_CM_RANGE = { min: 100, max: 250, fallback: 175 } as const satisfies NumberRange;
/** Zulässiges Gewicht in kg. Fängt Zahlendreher und die falsch gelesene Waage, sonst nichts. */
export const WEIGHT_KG_RANGE = { min: 20, max: 300, fallback: 75 } as const satisfies NumberRange;
/** Höchstzahl der Wiege-Fenster eines Tages — wie {@link CLEANING_WINDOWS_MAX}, eigene Konstante,
 *  weil die Reinigung von diesem Feature unberührt bleibt (siehe docs/gewicht-konzept.md, 4.1). */
export const WEIGHING_WINDOWS_MAX = 7;

/** Wie lange ein Wiege-Fenster dauern darf. Untergrenze fünf Minuten (darunter ist es keine Spanne,
 *  sondern ein Termin), Obergrenze ein ganzer Tag — wer 24 h einstellt, hat die Fensterpflicht
 *  faktisch abgeschaltet, und das ist seine Sache. */
export const WEIGHING_WINDOW_DURATION_RANGE = { min: 5, max: 24 * 60, fallback: 180 } as const satisfies NumberRange;

/*
 * Freigabe-Vorgabe (docs/gewicht-freigabe-konzept.md): das Gewicht öffnet das nächste
 * Orgasmus-Fenster. Die Schwelle selbst nimmt {@link WEIGHT_KG_RANGE} — es ist dasselbe Gewicht.
 */

/** Breite des Mittels in KALENDER-Tagen. Untergrenze zwei (bei einem Tag wäre es der Tageswert,
 *  also genau das Rauschen zurück, dessen Vermeidung der Grund für das Mittel ist), Obergrenze
 *  vierzehn — darüber beschreibt es nicht mehr den aktuellen Stand. */
export const RELEASE_AVERAGE_DAYS_RANGE = { min: 2, max: 14, fallback: 3 } as const satisfies NumberRange;
/** Wie viele zählende Messungen im Fenster liegen müssen. Wird zusätzlich gegen `averageDays`
 *  geklemmt — mehr Messungen zu verlangen, als das Fenster Tage hat, wäre unerfüllbar. */
export const RELEASE_MIN_MEASUREMENTS_RANGE = { min: 1, max: 14, fallback: 2 } as const satisfies NumberRange;
/** Täglicher Anstieg der Schwelle in kg. `0` = konstante Schwelle, und das ist die Vorgabe: der
 *  Anstieg ist ein Entgegenkommen, keine Voreinstellung. */
export const RELEASE_STEP_KG_RANGE = { min: 0, max: 5, fallback: 0 } as const satisfies NumberRange;
/** Wie lange das erzeugte Orgasmus-Fenster offen steht. */
export const RELEASE_WINDOW_HOURS_RANGE = { min: 1, max: 168, fallback: 24 } as const satisfies NumberRange;

/** Grenzen beider Eskalationsstufen einer überfälligen Kontrolle: 5 min – 24 h. */
const INSPECTION_ESCALATION_DELAY = { min: 5, max: 1440 } as const;
/** Verzögerung bis zur Erinnerung (Stufe 1). */
export const INSPECTION_REMINDER_DELAY_RANGE = { ...INSPECTION_ESCALATION_DELAY, fallback: 5 } as const satisfies NumberRange;
/** Verzögerung bis zum automatischen Vermerk (Stufe 2). */
export const INSPECTION_AUTO_MARK_DELAY_RANGE = { ...INSPECTION_ESCALATION_DELAY, fallback: 60 } as const satisfies NumberRange;

/** Vorgabe-Frist einer Kontrollanforderung in Stunden. Hier, weil sie an drei Stellen auftaucht:
 *  Formular-Startwert, Service-Fallback und die MCP-Tool-Beschreibung. Die dritte ist Prosa — als
 *  Literal geschrieben informiert sie den Agenten still falsch, sobald die Vorgabe wandert. */
export const INSPECTION_DEADLINE_DEFAULT_H = 1;

/** Sperrfrist zwischen zwei Code-Wiederholungen auf Knopfdruck. Beide Seiten lesen sie hier: die
 *  Route begrenzt damit (`checkRateLimit`), der Knopf sperrt sich so lange selbst. Stünde sie
 *  zweimal, liefe der Knopf irgendwann in einen 429, den er selbst hätte verhindern sollen. */
/**
 * Wie viele Zeilen eine geblätterte Liste zeigt — die Zahl hängt an der ART der Liste, nicht an der
 * Seite, auf der sie steht.
 *
 * `LIST` sind die Listen-KARTEN (Kontroll-Historie, Aufgaben-Historie, Statistik-Listen, Orgasmen):
 * eine Karte mit Kopfzeile, in der man blättert. `BLOCK` sind die Dashboard-BLÖCKE des Trägers, die
 * sich eine Spalte mit allem anderen teilen und deshalb kürzer bleiben.
 *
 * Die Unterscheidung sah lange nach „Adminportal gegen Dashboard" aus — sie ist es nicht:
 * `StatsKontrollenList` blättert zu zehnt in genau der schmalen Spalte des Trägers. Beide Zahlen
 * standen als Literal in acht Dateien; hier stehen sie einmal.
 */
export const LIST_PAGE_SIZE = 10;
export const BLOCK_PAGE_SIZE = 5;

export const INSPECTION_CODE_PUSH_COOLDOWN_MS = 30_000;

/**
 * Wie lang ein Kontroll-Code sein darf: gewürfelt sind es fünf Ziffern, von Hand vergeben bis zu acht.
 *
 * Zusammengezogen für das Eingabefeld, die Auslöse-Schwelle der Foto-Prüfung, die Siegel-Erkennung
 * (`deriveSealCode` — dieselbe Regel auf derselben Spalte) und die Annahme der Push-Wiederholung.
 * Die Wiederholung ist die Stelle, an der eine zu grosszügige Annahme etwas hiesse: sie schickt, was
 * hereinkommt, als Meldung an das Gerät des Absenders.
 *
 * NICHT umgestellt: `generateKontrollCode` würfelt seine fünf Ziffern weiter über `10000 + …`, und
 * `isImplausibleSeal` prüft mit einer eigenen Untergrenze. Beide sind dieselbe Grösse — sie hier
 * anzuhängen wäre richtig, ist aber ein Eingriff in Erzeugung und Bilderkennung und gehört nicht in
 * eine Formular-Änderung.
 */
export const INSPECTION_CODE_LENGTH = { min: 5, max: 8 } as const;

/** Einmal gebaut statt bei jedem Aufruf: der Ausdruck steht aus zwei Konstanten fest, wird aber im
 *  Render bei jedem Tastendruck im Code-Feld ausgewertet. */
const INSPECTION_CODE_RE = new RegExp(`^\\d{${INSPECTION_CODE_LENGTH.min},${INSPECTION_CODE_LENGTH.max}}$`);

/** Ist das eine brauchbare Kontroll-Code-Eingabe? Ziffern, und in der Länge oben. */
export function isValidInspectionCode(code: string): boolean {
  return INSPECTION_CODE_RE.test(code);
}

/**
 * Der Rate-Limit-Schlüssel der Code-Wiederholung — EINER für beide Wege (Anforderung und
 * Selbstkontrolle).
 *
 * Als Funktion und nicht als Literal in jeder Route: die Zusage ist „ein Zähler je Knopfdruck", und
 * zwei Zähler liessen sich abwechselnd drücken. Zweimal hingeschrieben hinge sie an einem Kommentar
 * statt an der Struktur.
 *
 * Eigener Schlüssel statt des geteilten `user:<id>`: der zählt schon die Foto-Verifikation (10/min),
 * und die beiden Aktionen laufen im selben Formular direkt hintereinander.
 */
export function inspectionCodePushLimitKey(userId: string): string {
  return `code-push:${userId}`;
}

/**
 * Rasterung einer Frist-Eingabe je Einheit — EINE Zahl für `min`/`step` des Feldes, für dessen
 * HTML-Validierung und für das Runden beim Einheiten-Wechsel. Ein Wert neben dem Raster (0.1 h bei
 * step 0.25) liesse das Formular nicht mehr absenden; wer feiner will als eine Viertelstunde,
 * schaltet auf Minuten.
 *
 * `min` ist die kleinste sinnvolle EINGABE in dieser Einheit, keine fachliche Untergrenze — deshalb
 * sind die beiden Zeilen auch nicht ineinander umrechenbar (5 min sind in Minuten erlaubt, in
 * Stunden nicht). Was eine Frist wirklich mindestens sein muss, weiss der Server: die Aufgaben-
 * Haltefrist etwa muss hinter der Kulanzfrist liegen (`TASK_HOLD_UNTIL_TOO_SOON`), und das hängt an
 * einem zweiten Feld, das diese Konstante nicht kennt.
 */
export const DURATION_UNITS = {
  h: { min: 0.25, step: 0.25 },
  min: { min: 5, step: 5 },
} as const;
export type DurationUnit = keyof typeof DURATION_UNITS;

/**
 * Die Schnellwahl einer Dauer-Eingabe, in Stunden — die Stufen, die `DurationInput` als Knöpfe
 * anbietet.
 *
 * ZWEI Skalen, weil die Schnellwahl zur GRÖSSENORDNUNG des Feldes gehört und nicht zur Eingabe-Art:
 * eine Kontroll-, Aufgaben- oder Nachweis-Frist wird in Minuten bis Stunden beantwortet (`short`),
 * eine Sperrzeit in Stunden bis Tagen (`long`). Die kurze Reihe unter ein Feld zu setzen, dessen
 * Vorgabe 24 h ist, böte fünf Knöpfe an, von denen keiner eine plausible Antwort ist — und jeder den
 * sinnvollen Vorgabewert mit einem Tap überschreibt.
 *
 * Die kurzen Stufen stehen je vorne, weil die langen ohnehin die getippten sind.
 */
export const DURATION_QUICK_HOURS = {
  short: [0.25, 0.5, 1, 2, 4],
  long: [4, 8, 12, 24, 48],
} as const;

/** Eingetippte Dauer → Stunden, die Einheit, in der Modell und Server rechnen. */
export function durationToHours(value: number, unit: DurationUnit): number {
  return unit === "min" ? value / 60 : value;
}

/** Stunden → der Wert, wie er in dieser Einheit ins Feld gehört: auf ihr Raster gerundet und nicht
 *  unter ihr Minimum. Gegenstück zu {@link durationToHours} — der Weg zurück ins Formular. */
export function durationFromHours(hours: number, unit: DurationUnit): number {
  const { min, step } = DURATION_UNITS[unit];
  const raw = unit === "min" ? hours * 60 : hours;
  return Math.max(min, Math.round(raw / step) * step);
}

/**
 * Die eingetippte Dauer in Stunden — oder der Ersatzwert, wenn das Feld leer (oder unlesbar) ist.
 *
 * Der Ersatzwert ist IMMER eine Stunden-Angabe und läuft bewusst NICHT durch die Einheiten-
 * Umrechnung: in Minuten gelesen würde aus einer Vorgabe von 4 h eine Frist von vier Minuten.
 * Solange der Einheiten-Wechsel selbst einen Wert nachtrug, war das Feld nie leer und der Fall
 * unerreichbar; seit `DurationInput` ein leeres Feld leer LÄSST, ist er zwei Klicks entfernt (Feld
 * leeren, umschalten, absenden). Die Kontroll- und die Einschliess-Frist hatten dafür je eine
 * eigene Fassung — dieselbe Figur, zweimal gepflegt.
 */
export function durationHoursOr(raw: string, unit: DurationUnit, fallbackH: number): number {
  const value = durationToHours(parseFloat(raw), unit);
  return value > 0 ? value : fallbackH;
}

/** Erlaubte Auslöse-Verzögerung einer über den MCP angeforderten Kontrolle: 5 min – 24 h. Kein
 *  Admin-Setting, sondern die `request_inspection`-Policy — hier, weil Tool-Schema (Beschreibung
 *  des Bereichs) und Service (`clamp`) denselben Bereich nennen müssen. `fallback` greift nur für
 *  einen auf 0 gerundeten Bruchteil; die echte 0 („sofort") fängt der Aufrufer vorher ab. */
export const INSPECTION_DELAY_RANGE = { min: 5, max: 1440, fallback: 5 } as const satisfies NumberRange;
/** Zufalls-Fenster derselben Verzögerung, wenn der Agent KEINEN Wert nennt (Überraschungseffekt).
 *  Bewusst enger als `INSPECTION_DELAY_RANGE`: die Obergrenze dort begrenzt nur, was ausdrücklich
 *  verlangt wird — der Zufallsfall soll weiterhin zeitnah zuschlagen. */
export const INSPECTION_RANDOM_DELAY = { min: 5, max: 65 } as const;

/** Automatische Kontrollen pro Tag — Min und Max derselben Zeile teilen auch den Fallback. */
export const AUTO_INSPECTION_PER_DAY_RANGE = { min: 0, max: 12, fallback: 0 } as const satisfies NumberRange;

/** Verzögerung der Kontrolle nach einem Wiederverschluss, der eine Reinigungspause beendet: der
 *  Sub soll den Beleg nicht direkt an die Reinigung anschliessen können, aber nah genug daran,
 *  dass er das Gerät nicht in der Zwischenzeit wieder abnimmt. */
export const CLEANING_RELOCK_INSPECTION_DELAY = { min: 15, max: 45 } as const;
/** Dieselbe Kontrolle, wenn sie im Schlaf-Fenster landet: kürzer, weil sie den Sub ohnehin nur beim
 *  ohnehin wachen Wiederverschluss trifft — und ohne Eskalationsstufe 2, damit verschlafene Minuten
 *  keine Session beenden (die Regel steht bei `scheduleCleaningRelockInspection`). */
export const CLEANING_RELOCK_INSPECTION_DELAY_SLEEP = { min: 5, max: 15 } as const;

/** Grenzen der Erfüllungsfrist einer automatischen Kontrolle (Minuten). */
const AUTO_INSPECTION_DEADLINE = { min: 5, max: 240 } as const;
/** Untere Frist-Grenze („von"). */
export const AUTO_INSPECTION_DEADLINE_FROM_RANGE = { ...AUTO_INSPECTION_DEADLINE, fallback: 15 } as const satisfies NumberRange;
/** Obere Frist-Grenze („bis"). */
export const AUTO_INSPECTION_DEADLINE_TO_RANGE = { ...AUTO_INSPECTION_DEADLINE, fallback: 60 } as const satisfies NumberRange;

/** Call-to-Action-Button-Farben für HTML-Mails (in E-Mail keine CSS-Variablen → Hex).
 *  Bewusst getrennt von TYPE_EMAIL_COLORS: das ist der Akzent je Eintrags-TYP, nicht die
 *  Button-Farbe eines Benachrichtigungs-Mails (eine Orgasmus-ANWEISUNG ist kein Orgasmus-Eintrag). */
export const EMAIL_BUTTON_COLORS = {
  /** Standard: Dashboard-Button. */
  default: "#4f46e5",
  /** Kontroll-Anforderung („Kontrolle erfüllen"). */
  inspection: "#f97316",
  /** Orgasmus-Anweisung / -Gelegenheit. */
  orgasm: "#be185d",
} as const;

/** Zustands-Ton einer Aufgabe — geteilt von der Karte und der Aufgaben-Liste. `warn` bleibt den
 *  echten Fehlschlägen vorbehalten: eine noch offene Bedingung ist kein Alarm, und eine ausstehende
 *  Sichtung erst recht nicht (der Sub hat dort getan, was er konnte).
 *
 *  Hier statt in der Karte, weil er beim Zustand hängt und nicht am Bauteil: die Liste braucht
 *  denselben Ton, ohne dafür eine Client-Komponente samt Icons und Bildbetrachter zu importieren. */
export const TASK_STATE_COLOR: Record<TaskState, string> = {
  pending: "text-foreground-muted",
  partial: "text-foreground-muted",
  running: "text-foreground-muted",
  done: "text-ok-text",
  missed: "text-warn-text",
  aborted: "text-warn-text",
  withdrawn: "text-foreground-muted",
  awaitingReview: "text-foreground-muted",
};

// ── Notification event types (shared by API + admin UI) ─────────────────────

export const NOTIFICATION_EVENT_TYPES = [
  "VERSCHLUSS",
  "OEFFNUNG_IMMER",
  "OEFFNUNG_VERBOTEN",
  "ORGASMUS",
  "KONTROLLE_FREIWILLIG",
  "KONTROLLE_ANGEFORDERT",
  "WEAR_BEGIN_ANY",
  "WEAR_END_ANY",
  "TASK_PROOF_LATE",
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];

/** Die beiden Versand-Kanäle einer Meldung. Die Posteingangs-Zeile hängt NICHT daran. */
export interface NotificationChannels {
  mail: boolean;
  push: boolean;
}

/** Ohne Angabe gilt beides — die eine Stelle, an der dieser Default steht. */
export const ALL_CHANNELS: NotificationChannels = { mail: true, push: true };

/**
 * Präferenzen, die am EMPFÄNGER hängen — bewusst eine eigene Liste.
 *
 * `NOTIFICATION_EVENT_TYPES` oben liegt zwar am Sub, steuert aber die Meldungen über seine Einträge
 * AN DIE KEYHOLDER, und genau so ist das Admin-Raster (`NotificationToggles`) beschriftet. Ein
 * Schalter, der dort das Gegenteil bedeutet — „Meldungen AN den Sub" —, wäre eine Falle. Diese
 * Liste erscheint deshalb ausschliesslich in den eigenen Einstellungen des Nutzers.
 *
 * `WEIGHT_REMINDER` ist der zweite Fall dieser Art: die Erinnerung zum Wiege-Fenster geht an den
 * TRÄGER. Sie gehört damit in seine Einstellungen und ausdrücklich NICHT in das Admin-Raster —
 * dort stünde ein Schalter, dessen Beschriftung („Meldungen über seine Einträge") das Gegenteil
 * verspricht.
 */
export const RECIPIENT_NOTIFICATION_EVENT_TYPES = ["MESSAGE_RECEIVED", "WEIGHT_REMINDER"] as const;

export type RecipientNotificationEventType = typeof RECIPIENT_NOTIFICATION_EVENT_TYPES[number];

export function isRecipientNotificationEventType(v: unknown): v is RecipientNotificationEventType {
  return typeof v === "string" && (RECIPIENT_NOTIFICATION_EVENT_TYPES as readonly string[]).includes(v);
}

// ── Trainingsvorgabe: Perioden-Stundenbasis (nur für h↔% Umrechnung im Admin-Formular) ──
// Durchschnittswerte; Monat = 365.25/12·24, Jahr = 365.25·24 (berücksichtigt Schaltjahre).
export const HOURS_PER_DAY = 24;
export const HOURS_PER_WEEK = 168;
export const HOURS_PER_MONTH = 730;
export const HOURS_PER_YEAR = 8766;

// ── Startseite nach Login (pro-User-Präferenz) ───────────────────────────────
export const START_PAGES = ["auto", "overview", "users", "dashboard"] as const;
export type StartPage = (typeof START_PAGES)[number];
export function isValidStartPage(v: unknown): v is StartPage {
  return typeof v === "string" && (START_PAGES as readonly string[]).includes(v);
}

// ── Password validation ─────────────────────────────────────────────────────

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_MAX_BYTES = 72;

export type PasswordErrorCode = "passwordTooShort" | "passwordTooLong";

/** Returns a stable i18n error code if invalid, null if OK. */
export function passwordErrorCode(password: string): PasswordErrorCode | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if (Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES) return "passwordTooLong";
  return null;
}

// ── Orgasmus Art parsing ────────────────────────────────────────────────────

/** Kanonisches Trennzeichen zwischen Hauptart und Unterart einer Orgasmus-Art (Single Source). */
export const ART_SEP = " – ";

/** Extracts base orgasmusArt before the ART_SEP detail separator */
export function parseOrgasmusArtBase(orgasmusArt: string | null | undefined): string | undefined {
  return orgasmusArt?.split(ART_SEP)[0];
}

// ── Validation ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return true; // null/empty = clear email, which is valid
  return EMAIL_RE.test(s);
}

// ── Device / KG constants ───────────────────────────────────────────────────

export const VALID_CURRENCIES = ["CHF", "EUR", "USD"] as const;
export type Currency = typeof VALID_CURRENCIES[number];

export const DEVICE_NAME_MAX_LENGTH = 60;
export const DEVICE_DESCRIPTION_MAX_LENGTH = 500;

/** Die Codes, die {@link validateDeviceInput} liefern kann — eine Teilmenge der `DEVICE_CODES` aus
 *  dem Service-Register, an dem die Übersetzungen hängen. Das `satisfies` hält sie daran gebunden:
 *  ein Tippfehler oder ein Code ohne Registry-Eintrag ist ein Compile-Fehler statt eines
 *  unübersetzten Tokens im Fehlerfeld. */
const DEVICE_VALIDATION_CODES = [
  "DEVICE_NAME_REQUIRED", "DEVICE_NAME_TOO_LONG", "DEVICE_DESCRIPTION_TOO_LONG",
  "DEVICE_INVALID_PRICE", "DEVICE_INVALID_CURRENCY", "DEVICE_CURRENCY_REQUIRED",
] as const satisfies readonly ServiceErrorCode[];
export type DeviceValidationCode = typeof DEVICE_VALIDATION_CODES[number];

/**
 * Prüft die Felder eines Geräts und liefert den ERSTEN Verstoss — oder `null`.
 *
 * Die eine Stelle für `POST /api/devices`, `PATCH /api/devices/[id]` und den MCP-Write: die Kette
 * stand dreimal da und war bereits auseinander (die eine Fassung liess `NaN` als Preis durch, weil
 * `NaN < 0` falsch ist). Vorbild ist `validateCategoryInput` — nur gibt diese hier einen CODE
 * zurück, weil die Geräte-Routen ihre Fehler übersetzt ausliefern.
 *
 * `undefined` heisst „Feld nicht angegeben" und wird übersprungen — ein PATCH, der nur den Preis
 * ändert, darf nicht am Bestandsnamen scheitern. Preis und Währung müssen dagegen als EFFEKTIVE
 * Werte kommen (beim Ändern also mit dem Bestand verschmolzen): „ein Preis braucht eine Währung"
 * ist eine Aussage über den Zustand NACH der Änderung, nicht über den Aufruf.
 */
export function validateDeviceInput(input: {
  name?: unknown;
  description?: unknown;
  purchasePrice?: unknown;
  currency?: unknown;
}): DeviceValidationCode | null {
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || !input.name.trim()) return "DEVICE_NAME_REQUIRED";
    if (input.name.trim().length > DEVICE_NAME_MAX_LENGTH) return "DEVICE_NAME_TOO_LONG";
  }
  if (typeof input.description === "string" && input.description.length > DEVICE_DESCRIPTION_MAX_LENGTH) {
    return "DEVICE_DESCRIPTION_TOO_LONG";
  }
  if (input.purchasePrice != null && (typeof input.purchasePrice !== "number" || !Number.isFinite(input.purchasePrice) || input.purchasePrice < 0)) {
    return "DEVICE_INVALID_PRICE";
  }
  if (input.currency != null && !(VALID_CURRENCIES as readonly unknown[]).includes(input.currency)) {
    return "DEVICE_INVALID_CURRENCY";
  }
  if (input.purchasePrice != null && !input.currency) return "DEVICE_CURRENCY_REQUIRED";
  return null;
}

// ── Rotation ────────────────────────────────────────────────────────────────

export const VALID_ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = typeof VALID_ROTATIONS[number];

/** Validates that imageUrl is an internal upload path (prevents SSRF + ownership bypass). */
const ALLOWED_IMAGE_URL = /^\/api\/uploads\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return true; // null/undefined = no image, which is valid
  return ALLOWED_IMAGE_URL.test(url);
}

/**
 * Shared payload validation for entry creation (used by both user and admin routes).
 * Returns a stable error code on failure (always a 400 for the caller), or null on success.
 * The route answers with `{ error: code }`; the client resolves it via `useApiError()`.
 * Note: Admin-route has `requirePhotoForPruefung: false` because admin may retroactively
 * log entries without a photo. User-route requires a photo for PRUEFUNG.
 */
export function validateEntryPayload(
  body: { type?: string; startTime?: string; imageUrl?: string; boxImageUrl?: string; oeffnenGrund?: string; orgasmusArt?: string; note?: string; keyInBox?: unknown },
  opts: { requirePhotoForPruefung?: boolean; allowFuture?: boolean } = {},
  // Per-User Reason-Validierung (aus reasonsService). Fehlt sie, gelten die eingebauten Konstanten
  // (Default-Verhalten für null-Config / Aufrufer ohne User-Kontext) — unverändert. `orgasmAllowed`
  // prüft den VOLLEN Wert (Kombi-Code ODER blanke Hauptart), nicht nur die Basis.
  reasonCtx?: { orgasmAllowed?: (value: string) => boolean; openingCodes?: Set<string> },
): EntryValidationCode | null {
  const { requirePhotoForPruefung = true, allowFuture = false } = opts;
  const { type, startTime, imageUrl, boxImageUrl, oeffnenGrund, orgasmusArt, note, keyInBox } = body;

  // Schlüssel-Deklaration: nur ein echter Boolean oder gar nichts. Ein Client, der `"false"` schickt,
  // darf weder als "ja" durchrutschen (String ist truthy) noch als String in der Spalte landen.
  if (keyInBox !== undefined && keyInBox !== null && typeof keyInBox !== "boolean") {
    return "INVALID_KEY_IN_BOX";
  }
  if (!isValidImageUrl(imageUrl)) return "INVALID_IMAGE_URL";
  // Box-Foto (Schlüssel im Sichtfenster): derselbe Pfad-Guard wie das Haupt-Foto. Es wird
  // server-seitig an die Vision gereicht — eine fremde URL wäre hier direkt ein SSRF-Hebel.
  if (!isValidImageUrl(boxImageUrl)) return "INVALID_IMAGE_URL";
  if (!startTime) return "START_TIME_REQUIRED";
  if (!allowFuture && new Date(startTime) > new Date()) return "TIME_IN_FUTURE";
  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return "INVALID_TYPE";
  }
  if (WEAR_ENTRY_TYPES.has(type) && !deviceCategoriesEnabled()) {
    return "DEVICE_CATEGORIES_DISABLED";
  }
  if (type === "OEFFNEN") {
    // System-only reason codes (e.g. AUTO_ENTFERNT) are reserved/protected like REINIGUNG, but
    // must NEVER be user-submittable — otherwise a sub could pick the "auto-marked" label
    // themselves via a hand-crafted request, even though `source` (system vs. user) is never
    // client-controlled. Block unconditionally, before the openingCodes/OEFFNEN_GRUENDE check.
    if (oeffnenGrund && SYSTEM_ONLY_OPENING_CODES.includes(oeffnenGrund)) {
      return "OPENING_REASON_REQUIRED";
    }
    const openingOk = reasonCtx?.openingCodes
      ? !!oeffnenGrund && reasonCtx.openingCodes.has(oeffnenGrund)
      : !!oeffnenGrund && OEFFNEN_GRUENDE.includes(oeffnenGrund as (typeof OEFFNEN_GRUENDE)[number]);
    if (!openingOk) {
      return "OPENING_REASON_REQUIRED";
    }
    if (!note?.trim()) return "NOTE_REQUIRED";
  }
  if (type === "PRUEFUNG" && requirePhotoForPruefung && !imageUrl) {
    return "INSPECTION_PHOTO_REQUIRED";
  }
  if (type === "ORGASMUS") {
    const orgasmOk = reasonCtx?.orgasmAllowed
      ? reasonCtx.orgasmAllowed(orgasmusArt ?? "")
      : (ORGASMUS_ARTEN as readonly string[]).includes(parseOrgasmusArtBase(orgasmusArt) ?? "");
    if (!orgasmOk) return "INVALID_ORGASM_TYPE";
  }
  return null;
}

// ── Aufgaben (Task) ─────────────────────────────────────────────────────────
/** Längen-Grenzen für Aufgaben-Texte. Zentral hier, nicht im Formular: dieselben Werte prüfen
 *  Service (serverseitig verbindlich) und UI (`maxLength`). Ohne Grenze zerlegt ein langer Titel
 *  das kompakte Banner in der Keyholder-Übersicht. Vorbild: `CATEGORY_NAME_MAX_LENGTH`. */
export const TASK_TITLE_MAX_LENGTH = 80;
export const TASK_DESCRIPTION_MAX_LENGTH = 2000;
/** Voreingestellte Kulanz (Minuten) zum Anlegen der geforderten Geräte, ab Erstellung der Aufgabe. */
export const TASK_DEFAULT_START_GRACE_MIN = 30;
/** Zulässiger Bereich der Kulanz. Ein negativer Wert würde die Endzeit-Prüfung umdrehen und eine
 *  Aufgabe erlauben, deren Frist bereits abgelaufen ist.
 *
 *  Bewusst KEIN {@link NumberRange}: dem Typ fehlt hier nicht bloss `fallback`, er wäre eine falsche
 *  Zusage. Ein `NumberRange` ist das Versprechen „hiermit klemmt `clamp()`" — und genau `clamp()`
 *  darf auf dieses Feld nicht angewandt werden, weil sein `Math.round(value) || fallback` aus der
 *  ausdrücklich gesetzten 0 („sofort anfangen") den Default machte. Siehe {@link clampStartGrace}. */
export const TASK_START_GRACE_RANGE = { min: 0, max: 24 * 60 } as const;
/**
 * Die Kulanz auf ihren Bereich bringen — der EINE Ort, an dem dieser Wert geklemmt wird.
 *
 * Genau wegen der Sonderregel oben: `clamp()` scheidet aus, also müsste jede Aufrufstelle die
 * Klemmung von Hand hinschreiben. Genau das stand kurzzeitig doppelt da (Service und Formular), und
 * nur eine der beiden Fassungen fing eine leere Eingabe ab — ein `NaN` wäre bis in die Datenbank
 * durchgelaufen.
 *
 * `undefined` (Feld nicht gesetzt) und eine unlesbare Eingabe führen beide auf den Default: wer keine
 * gültige Zahl nennt, bekommt die Vorgabe, nicht die Bereichsgrenze.
 */
export function clampStartGrace(value: number | undefined): number {
  const rounded = Math.round(value ?? TASK_DEFAULT_START_GRACE_MIN);
  if (!Number.isFinite(rounded)) return TASK_DEFAULT_START_GRACE_MIN;
  return Math.min(TASK_START_GRACE_RANGE.max, Math.max(TASK_START_GRACE_RANGE.min, rounded));
}
/**
 * Die Kulanz aus einer UHRZEIT ableiten — „spätestens um 18:00" statt „in 240 Minuten".
 *
 * Gespeichert bleibt die Minutenzahl; die Uhrzeit ist nur der zweite Eingabeweg desselben Feldes.
 * Gemessen wird gegen den NULLPUNKT der Aufgabe (`wirksamAb ?? createdAt`, siehe `taskAnchor`) und
 * nicht gegen „jetzt": bei einer terminierten Aufgabe liegt zwischen Ausfüllen und Wirksamwerden die
 * ganze Verzögerung, und ab „jetzt" gerechnet käme sie oben drauf.
 *
 * `null` heisst „taugt nicht als Frist" — unlesbar, nicht nach dem Nullpunkt (≤ 0 Minuten), oder
 * weiter als {@link TASK_START_GRACE_RANGE}`.max` danach. Bewusst KEINE Klemmung wie in
 * {@link clampStartGrace}: eine getippte Zahl darf man auf ihren Bereich bringen, eine ausdrücklich
 * gewählte Uhrzeit nicht — aus „spätestens 20:00" würde sonst stillschweigend 18:00. Der Aufrufer
 * weist die Eingabe stattdessen ab.
 *
 * Die 0 ist deshalb hier ungültig, obwohl `TASK_START_GRACE_RANGE.min` sie erlaubt: getippt heisst
 * sie „sofort anfangen", als Uhrzeit wäre sie der Nullpunkt selbst — eine Frist, die im Moment ihres
 * Entstehens schon abgelaufen ist.
 *
 * AUFGERUNDET auf die ganze Minute, nicht kaufmännisch gerundet: der Nullpunkt trägt Sekunden, die
 * Uhrzeit nicht. Abgerundet fiele die Frist bis zu 59 Sekunden VOR die gewählte Uhrzeit — sie würde
 * durch die Rundung strenger, und die Vorschau im Formular nennte eine Minute vor der, die gerade
 * eingestellt wurde.
 */
export function startGraceFromClock(clockMs: number, anchorMs: number): number | null {
  const minutes = Math.ceil((clockMs - anchorMs) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  if (minutes <= 0 || minutes > TASK_START_GRACE_RANGE.max) return null;
  return minutes;
}
/**
 * Zulässige Haltedauer im DAUER-MODUS (Minuten, gemessen ab dem tatsächlichen Beginn).
 *
 * Wie {@link TASK_START_GRACE_RANGE} bewusst KEIN {@link NumberRange}: der Typ verspricht „hiermit
 * klemmt `clamp()`", und dessen `Math.round(value) || fallback` ist hier falsch — es gibt keinen
 * sinnvollen Ausweichwert. Eine Aufgabe ohne gewählte Dauer darf nicht auf einer geraten landen;
 * genau das war beim Vorbelegen der Frist schon einmal der Fehler (zwei Stunden Knebel, nie gewählt).
 * `min: 1`, weil eine Haltezeit von null Minuten nichts fordert.
 */
export const TASK_HOLD_DURATION_RANGE = { min: 1, max: 365 * 24 * 60 } as const;

/** Die Haltedauer auf ihren Bereich bringen — der EINE Ort, an dem dieser Wert geklemmt wird.
 *  `undefined`/unlesbar bleibt `undefined`: „keine Dauer gewählt" heisst klassischer Modus und darf
 *  nicht stillschweigend zu einer Dauer werden. */
export function clampHoldDuration(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return undefined;
  return Math.min(TASK_HOLD_DURATION_RANGE.max, Math.max(TASK_HOLD_DURATION_RANGE.min, rounded));
}

/**
 * Die EIGENE Fälligkeit eines Nachweises auf ihren Bereich bringen (Minuten ab dem Nullpunkt der
 * Aufgabe) — `undefined` heisst „keine eigene Frist", der Nachweis bleibt bis zum Ende der Aufgabe
 * offen.
 *
 * Eigene Funktion und NICHT {@link clampHoldDuration}, obwohl beide dieselbe Spanne teilen: die
 * beiden unterscheiden sich genau an der unteren Kante, und dort liegt der Schaden. `clampHoldDuration`
 * hebt eine 0 auf `min: 1` — für eine Haltedauer richtig („null Minuten fordern nichts"), hier
 * fatal: aus einer getippten 0 würde eine Frist EINE MINUTE nach dem Nullpunkt, und die Aufgabe wäre
 * versäumt, bevor der Träger das Handy weglegt. Eine 0 ist hier keine unmögliche Dauer, sondern die
 * Aussage „keine". Genau die Sorte Umdeutung, gegen die schon `clampStartGrace` eine eigene Funktion
 * hat (siehe dort).
 */
export function clampProofDueOffset(value: number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded) || rounded < TASK_HOLD_DURATION_RANGE.min) return undefined;
  return Math.min(TASK_HOLD_DURATION_RANGE.max, rounded);
}

/** Wie viele Nachweis-Fotos eine Aufgabe höchstens fordern darf. Nicht willkürlich: jeder Nachweis
 *  ist ein eigener Gang zum Handy, und die Reihenfolge muss belegbar bleiben. Zehn ist grosszügig
 *  über dem Leitbeispiel (drei) und deckelt zugleich, was `evaluateProofs` je Auswertung sortiert. */
export const TASK_PROOF_MAX = 10;
/** Was auf dem Bild zu sehen sein muss — eine Anweisung, kein Aufsatz. */
export const TASK_PROOF_DESCRIPTION_MAX_LENGTH = 200;
/** Arten von Aufgaben-Bedingungen. WEAR = Gerät/Kategorie tragen · KG_LOCKED = verschlossen sein
 *  (der KG ist bewusst keine Trage-Kategorie, ein WEAR_BEGIN darauf wird abgewiesen). */
export const TASK_REQUIREMENT_TYPES = ["WEAR", "KG_LOCKED"] as const;
export type TaskRequirementType = (typeof TASK_REQUIREMENT_TYPES)[number];

// ── Notierte Vergehen (ManualOffense) ───────────────────────────────────────
/**
 * Die AUDIT-KENNUNG „von der KI erledigt" — der eine Wert, unter dem der MCP-Weg in den Autoren-
 * Feldern der Strafbuch-Schicht steht: `StrafeRecord.judgedBy` und `ManualOffense.createdBy`.
 *
 * Drei Rollen hängen an genau diesem String, und sie sind über drei Module verteilt:
 *  * GESCHRIEBEN wird er ausschliesslich vom MCP (`mcpWrite.ts`) — „von der KI" gegenüber „von Hand
 *    in der Oberfläche". WELCHER Keyholder autorisiert hat, steht im Action-Log, nicht hier.
 *  * GELESEN wird er von der Absender-Abbildung (`senderFromAuthor` in `messageService.ts`): daraus
 *    wird die Zusicherung „die KI hat geurteilt" an der Nachricht.
 *  * ANGEZEIGT wird er im Strafbuch (`StrafbuchClient.tsx`) als KI-Hinweis am Urteil.
 *
 * Hier zentral und nicht dreimal lokal, weil ein Auseinanderlaufen NICHT auffällt: schriebe der MCP
 * plötzlich „mcp", fiele jedes KI-Urteil beim Lesen in den Zweig „Benutzername" — dem Träger würde
 * ein MENSCH namens „mcp" als Absender gemeldet, also genau die Falschaussage, gegen die die
 * Absender-Angabe gebaut ist. Kein Test und kein Compiler bemerkte das an drei privaten Kopien.
 *
 * In `constants.ts` und nicht in `messageService.ts`, weil diese Datei importfrei ist und die
 * Strafbuch-Oberfläche eine CLIENT-Komponente ist — der Service zöge Prisma mit.
 *
 * KANONISCH — die Namensgrenze. Ein Benutzer, der wirklich `ai` hiesse, würde überall als KI
 * gelesen: seine Meldungen kämen beim Träger als KI-Zeile an (`senderFromAuthor`) und sein Urteil
 * stünde im Strafbuch mit KI-Hinweis (`judgedByFromActor`). Deshalb ist der Name auf JEDEM Weg in
 * die Benutzertabelle verstellt: die Benutzer-API verlangt mindestens drei Zeichen, und
 * `scripts/seed.js` weicht auf den Standardnamen aus, wenn `ADMIN_USERNAME` die Kennung trägt
 * (gross/klein egal). Jede andere Stelle, die diese Grenze erwähnt, zeigt hierher, statt die
 * Begründung zu wiederholen — sonst hinkt sie beim nächsten Nachziehen an zwei Stellen hinterher.
 */
export const AI_AUTHOR = "ai";

/**
 * Werte eines Autoren-Feldes, die „kein Autor festgehalten" bedeuten — der leere Text (Ausweichwert
 * von `sessionActor`) und `"?"` (derselbe Ausweichwert, bevor er auf leer umgestellt wurde).
 *
 * Ein Autoren-Wert ist der ABSENDER der Meldung an den Träger. Ein Platzhalter, der nicht als
 * „niemand" erkannt wird, steht ihm deshalb wörtlich als Absender „?" im Posteingang, und das
 * Strafbuch beschriftet eine Zeile „Notiert von: ?". Genau diese Grenze zieht auch die
 * Nachtrags-Migration `20260812100000_message_sender_name` (`createdBy NOT IN ('', '?')`) — sie hier
 * einmal auszusprechen ist der Grund, warum Migration und Laufzeit dieselbe Menge meinen.
 */
const NO_AUTHOR_VALUES = new Set(["", "?"]);

/** Steht hinter diesem Autoren-Wert wirklich jemand? Die EINE Antwort für Absender-Abbildung
 *  (`senderFromAuthor`), Spalten-Schreibweg (`actorColumn`) und Anzeige (`StrafbuchClient`) —
 *  drei getrennte `if (createdBy)` waren die Stelle, an der sie auseinanderliefen. */
export function hasAuthor(author: string | null | undefined): author is string {
  return !!author && !NO_AUTHOR_VALUES.has(author);
}

/** Längen-Grenzen eines von Hand notierten Vergehens. Zentral hier aus demselben Grund wie bei den
 *  Aufgaben: dieselben Werte prüft die Route (serverseitig verbindlich) und begrenzt das Formular
 *  (`maxLength`). Der Titel trägt die Zeile im Strafbuch und wird zum Straf-Anlass einer
 *  Strafaufgabe — dieselbe Rolle wie ein Aufgaben-Titel, darum dieselbe Grenze. */
export const MANUAL_OFFENSE_TITLE_MAX_LENGTH = 80;
export const MANUAL_OFFENSE_DESCRIPTION_MAX_LENGTH = 2000;
