import type { MessageBodyKey } from "@/lib/messageService";
import type { BadgeVariant } from "@/app/components/Badge";

/**
 * Worum es in einer Nachricht geht — die Kategorie, die die Zeile im Posteingang trägt.
 *
 * Abgeleitet aus dem `bodyKey`, nicht gespeichert: die Zuordnung ist eine Anzeige-Entscheidung und
 * darf sich ändern, ohne dass Bestandszeilen umgeschrieben werden müssen.
 *
 * Bewusst OHNE Importe (ausser dem Typ) — dieselbe Regel wie in `codedError.ts`: damit die Tabelle
 * aus einer Client-Komponente erreichbar bleibt, ohne `prisma` oder `next/server` in den Browser zu
 * ziehen.
 */
// Nur zur Typ-Ableitung — wer die Kategorien braucht, nimmt MESSAGE_CATEGORY_PILLS.
const MESSAGE_CATEGORIES = ["inspection", "lock", "orgasm", "penalty", "task", "system"] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/**
 * Body-Key → Kategorie. Vollständig für alle `MESSAGE_BODY_KEYS`; `messageService.test.ts` erzwingt
 * das, damit ein neu hinzugefügter Schlüssel nicht stillschweigend als „system" durchrutscht.
 */
const CATEGORY_BY_BODY_KEY: Record<MessageBodyKey, MessageCategory> = {
  penaltyMessage: "penalty",
  penaltyMessageNoReason: "penalty",

  inspectionRequestedMessage: "inspection",
  inspectionConfirmedMessage: "inspection",
  inspectionRejectedMessage: "inspection",
  inspectionResolvedWithdrawnMessage: "inspection",
  inspectionReminderMessage: "inspection",
  inspectionReminderMessageNoCode: "inspection",
  inspectionAutoRemovedMessageSub: "inspection",
  inspectionAutoRemovedMessageSubNoCode: "inspection",
  inspectionAutoRemovedMessageSubWear: "inspection",
  inspectionAutoRemovedMessageSubWearNoCode: "inspection",
  // Geht an die Keyholder, nicht in den Sub-Posteingang (notify.ts, `inbox: false`) — steht hier nur,
  // damit die Tabelle über alle Body-Keys vollständig ist.
  inspectionAutoRemovedMessageKeyholder: "inspection",
  inspectionAutoRemovedMessageKeyholderNoCode: "inspection",
  inspectionAutoRemovedMessageKeyholderWear: "inspection",
  inspectionAutoRemovedMessageKeyholderWearNoCode: "inspection",

  lockRequestBody: "lock",
  lockPeriodSetBody: "lock",
  lockRequestChangedMessage: "lock",
  lockPeriodChangedMessage: "lock",
  lockPeriodChangedMessageIndefinite: "lock",
  lockRequestWithdrawnMessage: "lock",
  lockPeriodWithdrawnMessage: "lock",

  orgasmAnweisungIntro: "orgasm",
  orgasmGelegenheitIntro: "orgasm",
  orgasmWithdrawnMessage: "orgasm",

  taskAssignedMessage: "task",
  taskChangedMessage: "task",
  taskWithdrawnMessage: "task",
  taskAwaitingMessage: "task",
  taskDoneMessage: "task",
  taskFailedMessage: "task",
  // Wie bei den Kontroll-Keyholder-Meldungen: gehen an die Keyholder, nicht in den Sub-Posteingang
  // (`inbox: false` in taskService.ts) — hier nur, damit die Tabelle vollständig bleibt.
  taskDoneMessageKeyholder: "task",
  taskFailedMessageKeyholder: "task",
  taskReviewMessageKeyholder: "task",
  taskProofAcceptedMessage: "task",
  taskProofRejectedMessage: "task",
};

/**
 * Die Kategorie einer Nachricht. `system` ist der Auffang für Freitext-Nachrichten (kein `bodyKey`,
 * ab Etappe 2) und für einen Schlüssel, den die Tabelle nicht kennt — die Zeile bleibt damit
 * anzeigbar, statt an einer fehlenden Zuordnung zu scheitern.
 */
export function messageCategory(bodyKey: string | null): MessageCategory {
  if (!bodyKey) return "system";
  // `Object.hasOwn` statt `?? "system"`: `bodyKey` kommt aus einer freien TEXT-Spalte, und ein
  // Objekt-Literal erbt von `Object.prototype` — ein Wert wie "constructor" oder "toString" liefert
  // sonst ein geerbtes Member (eine FUNKTION) als „Kategorie". Das wäre nicht kosmetisch: der
  // Presenter legt den Wert in die RSC-Antwort, wo React eine Funktion nicht serialisieren kann, und
  // in der Zeile fehlte der Pill-Eintrag — eine Zeile nähme die ganze Seite mit. Dieselbe Falle und
  // dieselbe Absicherung wie in `serviceResult.ts` (mapServiceError).
  return Object.hasOwn(CATEGORY_BY_BODY_KEY, bodyKey)
    ? CATEGORY_BY_BODY_KEY[bodyKey as MessageBodyKey]
    : "system";
}

/**
 * Label-Schlüssel (Namensraum `messages`) + Badge-Variante je Kategorie.
 *
 * Die Farben kommen aus `Badge` und werden hier NICHT als Klassen wiederholt — sonst stünden dieselben
 * Tokens an zwei Stellen und liefen auseinander. `Badge` (nicht `Pill`) ist das Status-Chip dieses
 * Projekts: `size="sm"` ist `h-5 text-xs` und damit das, was in den Listen überall steht — `Pill` ist
 * mit `h-7 text-sm` + Entfernen-Kreuz ein Filter-Chip und würde die Metazeile dominieren.
 * Semantik: Kontrolle = inspect (Aufmerksamkeit), Sperre = sperrzeit, Orgasmus = orgasm,
 * Strafe = warn, System = neutral.
 */
export const MESSAGE_CATEGORY_PILLS: Record<MessageCategory, { labelKey: string; variant: BadgeVariant }> = {
  inspection: { labelKey: "catInspection", variant: "inspect" },
  lock:       { labelKey: "catLock",       variant: "sperrzeit" },
  orgasm:     { labelKey: "catOrgasm",     variant: "orgasm" },
  penalty:    { labelKey: "catPenalty",    variant: "warn" },
  task:       { labelKey: "catTask",       variant: "request" },
  system:     { labelKey: "catSystem",     variant: "neutral" },
};
