/**
 * Die Schnellschalter der Keyholder-Übersicht: welche Einstellungen eines Trägers dort als Chip
 * stehen dürfen, und wie ein Chip sie umlegt.
 *
 * **Eine Registratur, drei Abnehmer** — die Auswahlliste in den Einstellungen, die Chips auf der
 * Karte und die Whitelist der Schreib-Seite lesen dieselbe Tabelle. Getrennt gepflegt bekäme man
 * genau die Lücke, die man nicht sieht: eine Einstellung, die sich anwählen, aber nicht schalten
 * lässt (oder umgekehrt einen Chip, der ein Feld schreibt, das niemand anbieten wollte).
 *
 * **Warum kein generischer „schreib irgendein Boolean"-Endpunkt.** `field` ist der Feldname, den
 * `PATCH /api/admin/users/[id]` entgegennimmt — und diese Route ist ein VERTEILER auf die
 * Fachdienste: die Reinigung läuft über `setCleaningSettings` (samt Regel-Historie), die
 * Kontroll-Einstellungen über `setAutoKontrolleSettings` (samt Neuwurf des Tagesplans). Ein Chip
 * schickt deshalb genau ein Feld an dieselbe Route wie das Formular in den Einstellungen und erbt
 * damit jede Prüfung, jede Historie und jede Folgewirkung. Ein eigener Endpunkt, der die Spalte
 * direkt setzt, wäre der Fehler — er umginge sie alle.
 *
 * Server-Seiten und die Client-Komponente des Chips teilen sich dieses Modul. Es darf deshalb
 * **keinen Server-Code nach sich ziehen** (`prisma`, `next/server`) — ein einziger solcher Import
 * landete ohne Typfehler und ohne Testrot im Client-Bundle. Geprüft wird das in `quickSettings.test.ts`.
 */

import { parseJsonList } from "@/lib/jsonList";

/** Woran eine Einstellung hängt, ohne die es sie auf diesem Bildschirm nicht gibt. */
export type QuickSettingRequirement =
  /** Der Träger hat eine Heimdall-Box gemeldet. */
  | "box"
  /** Das Gewichtstracking ist auf dieser Instanz überhaupt eingeschaltet (ENV). */
  | "weightFeature";

export interface QuickSetting {
  /** Stabiler Schlüssel — SO wird die Auswahl gespeichert. Nie umbenennen: er steht in den
   *  Datensätzen der Nutzer und fiele dort still weg. */
  key: string;
  /** Das Feld, das `PATCH /api/admin/users/[id]` dafür entgegennimmt. */
  field: string;
  /** i18n-Schlüssel im `admin`-Namensraum — die Beschriftung des Chips UND der Auswahlzeile. */
  labelKey: string;
  requires?: QuickSettingRequirement;
  /**
   * Das Feld, an dem diese Einstellung HÄNGT — ist es aus, wirkt sie nicht, und der Chip entfällt.
   *
   * Dieselbe Regel, der die Einstellungs-Seite schon folgt: dort steht „nur bei Sperrzeit" im
   * eingeklappten Block der Automatik und der Boxfoto-Zwang in dem der Verschluss-Kontrolle. Ein
   * Chip, der „eingeschaltet" meldet, während die Einstellung darüber alles stilllegt, sagt die
   * Wahrheit über die Spalte und das Falsche über den Zustand.
   */
  dependsOn?: string;
}

/**
 * Die anbietbaren Einstellungen, in Anzeige-Reihenfolge.
 *
 * Ausschliesslich Ja/Nein-Einstellungen: ein Chip hat genau zwei Zustände und einen Griff. Fenster,
 * Spannen und Kontingente sind hier bewusst nicht zu finden — sie brauchen ein Formular, und ein
 * Chip, der eines aufklappt, wäre keine Abkürzung mehr, sondern ein zweiter Weg in die
 * Einstellungen.
 */
export const QUICK_SETTINGS: readonly QuickSetting[] = [
  { key: "autoInspections", field: "autoKontrolleAktiv", labelKey: "quickAutoInspections" },
  { key: "onlyDuringLockPeriod", field: "autoKontrolleNurBeiSperre", labelKey: "quickOnlyDuringLockPeriod", dependsOn: "autoKontrolleAktiv" },
  { key: "postLockInspection", field: "postLockInspectionEnabled", labelKey: "quickPostLockInspection" },
  { key: "postLockBoxPhoto", field: "postLockInspectionRequireBoxPhoto", labelKey: "quickPostLockBoxPhoto", requires: "box", dependsOn: "postLockInspectionEnabled" },
  { key: "cleaning", field: "cleaningAllowed", labelKey: "quickCleaning" },
  { key: "inspectionReminder", field: "inspectionReminderEnabled", labelKey: "quickInspectionReminder" },
  { key: "inspectionAutoMark", field: "inspectionAutoMarkEnabled", labelKey: "quickInspectionAutoMark" },
  { key: "weightTracking", field: "weightTrackingEnabled", labelKey: "quickWeightTracking", requires: "weightFeature" },
  { key: "lockRequiresBolt", field: "lockRequiresBolt", labelKey: "quickLockRequiresBolt", requires: "box" },
];

/**
 * Wie viele Chips höchstens auf einer Karte stehen.
 *
 * Keine Willkür, sondern die Breite der Zeile: neben den Schnellaktionen („Kontrolle anfordern",
 * „Sperrzeit setzen", „Sofort aufschliessen") bleibt auf einem Handy für wenig Platz. Mehr Chips
 * schöben die Aktionen in eine dritte Reihe — und die Aktionen sind der Grund, warum die
 * Keyholderin den Bildschirm öffnet, nicht die Schalter.
 */
export const MAX_QUICK_SETTINGS = 4;

/** Die Spalten, die eine Karte für die Chips laden muss. Aus der Registratur abgeleitet statt
 *  danebengeschrieben — ein neuer Eintrag bringt seine Spalte damit selbst mit. */
export const QUICK_SETTING_SELECT: Record<string, true> = Object.fromEntries(
  QUICK_SETTINGS.map((s) => [s.field, true as const]),
);

/** Eine User-Zeile, soweit die Chips sie lesen: die Felder der Registratur, alle boolesch. */
export type QuickSettingValues = Record<string, boolean>;

/**
 * Der aktuelle Wert eines Schalters auf einer geladenen User-Zeile.
 *
 * Die eine Stelle mit der Typ-Brücke: `field` ist eine Zeichenkette aus der Registratur, die Zeile
 * ein Prisma-Objekt mit festen Feldern — TypeScript kann die beiden nicht zusammenbringen. Als Cast
 * an der Aufrufstelle stünde er in jeder Anzeige neu; hier steht er einmal, und
 * {@link QUICK_SETTING_SELECT} sorgt dafür, dass die Spalte auch wirklich geladen wurde.
 */
export function quickSettingValue(row: object, s: QuickSetting): boolean {
  return (row as QuickSettingValues)[s.field] === true;
}

/** Gilt diese Einstellung für diesen Träger? Ohne Box kein Riegel-Zwang, ohne Instanz-Schalter
 *  kein Gewicht — ein Chip, der ins Leere schaltet, ist schlimmer als keiner. */
export function quickSettingAvailable(
  s: QuickSetting,
  ctx: { hasBox: boolean; weightFeature: boolean },
): boolean {
  if (s.requires === "box") return ctx.hasBox;
  if (s.requires === "weightFeature") return ctx.weightFeature;
  return true;
}

/**
 * Steht dieser Schalter auf DIESER Karte? Verfügbarkeit (gilt er für den Träger?) UND Wirksamkeit
 * (ist die Einstellung darüber überhaupt an?). Die Auswahlliste in den Einstellungen fragt nur das
 * erste — dort soll man einen Schalter auch vorbereiten können, dessen Oberbegriff gerade aus ist.
 */
export function quickSettingOnCard(
  s: QuickSetting,
  row: object,
  ctx: { hasBox: boolean; weightFeature: boolean },
): boolean {
  if (!quickSettingAvailable(s, ctx)) return false;
  return !s.dependsOn || (row as QuickSettingValues)[s.dependsOn] === true;
}

/**
 * Die gespeicherte Auswahl lesen — tolerant wie jeder Parser einer JSON-Spalte hier.
 *
 * Unbekannte Schlüssel fallen weg statt zu werfen: eine Einstellung kann verschwinden (umbenannt,
 * entfernt), und die Auswahl eines Nutzers darf daran nicht zerbrechen. Reihenfolge und Obergrenze
 * kommen aus der REGISTRATUR, nicht aus der Spalte — so kann keine alte Zeile mehr Chips
 * durchsetzen, als die Karte trägt.
 */
export function parseQuickSettings(raw: unknown): QuickSetting[] {
  // Derselbe tolerante Lese-Pfad wie bei den Fenster-Familien (`jsonList.ts`): String → JSON →
  // Array → Form-Filter, Murks fällt still weg.
  const keys = parseJsonList(raw, (item) => (typeof item === "string" ? item : null));
  return QUICK_SETTINGS.filter((s) => keys.includes(s.key)).slice(0, MAX_QUICK_SETTINGS);
}

/** Die rohen Schlüssel einer Auswahl — für die Schreib-Seite, die sie normalisiert ablegt. */
export function normalizeQuickSettings(raw: unknown): string[] {
  return parseQuickSettings(raw).map((s) => s.key);
}

