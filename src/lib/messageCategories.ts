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
/** Die Kategorien in Anzeige-Reihenfolge — Quelle für den Typ UND für die Filterleiste. */
export const MESSAGE_CATEGORIES = ["inspection", "lock", "orgasm", "penalty", "task", "system"] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/**
 * Body-Key → Kategorie. Vollständig für alle `MESSAGE_BODY_KEYS`; `messageService.test.ts` erzwingt
 * das, damit ein neu hinzugefügter Schlüssel nicht stillschweigend als „system" durchrutscht.
 */
const CATEGORY_BY_BODY_KEY: Record<MessageBodyKey, MessageCategory> = {
  penaltyMessage: "penalty",
  penaltyMessageNoReason: "penalty",
  penaltyTaskMessage: "penalty",
  offenseDetectedMessage: "penalty",
  offenseDetectedMessageTitled: "penalty",
  offenseDismissedMessage: "penalty",

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

/**
 * Die `bodyKey`s einer Kategorie — die Umkehrung der Tabelle oben.
 *
 * Damit lässt sich nach Kategorie filtern, OHNE eine Spalte nachzurüsten: die Zuordnung bleibt eine
 * Anzeige-Entscheidung (Begründung oben), die Abfrage bekommt nur die Schlüssel, die dazu gehören.
 * Abgeleitet statt danebengeschrieben — eine zweite Liste veraltete beim ersten neuen Schlüssel.
 */
export function bodyKeysOfCategory(category: MessageCategory): MessageBodyKey[] {
  return (Object.keys(CATEGORY_BY_BODY_KEY) as MessageBodyKey[]).filter(
    (key) => CATEGORY_BY_BODY_KEY[key] === category,
  );
}

/**
 * Die Schlüssel aller ANDEREN Kategorien — was übrig bleibt, ist „system".
 *
 * Denn `system` ist der Auffang-Topf: {@link messageCategory} schickt dorthin auch die Nachricht
 * ohne Schlüssel (Freitext) und die mit einem unbekannten. Eine Filterung über die system-Schlüssel
 * allein verlöre also genau die beiden Fälle, die es nur dort gibt.
 */
export function bodyKeysOutsideSystem(): MessageBodyKey[] {
  return (Object.keys(CATEGORY_BY_BODY_KEY) as MessageBodyKey[]).filter(
    (key) => CATEGORY_BY_BODY_KEY[key] !== "system",
  );
}

/** True, wenn der Wert eine bekannte Kategorie ist — die Prüfung für den Query-Parameter. */
export function isMessageCategory(value: string): value is MessageCategory {
  return (MESSAGE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Die Absender-Arten. Liegen HIER und nicht in `messageService.ts`, obwohl sie dort gebraucht
 * werden: die Filterleiste ist eine Client-Komponente, und ein Wert-Import aus dem Service zöge
 * `prisma` in den Browser-Bundle — genau das, wovor der Kopf dieser Datei warnt. Der Service
 * re-exportiert sie, damit seine Aufrufer unverändert bleiben.
 */
export const MESSAGE_SENDER_KINDS = ["system", "keyholder", "ai"] as const;
export type MessageSenderKind = (typeof MESSAGE_SENDER_KINDS)[number];

export function isMessageSenderKind(value: string): value is MessageSenderKind {
  return (MESSAGE_SENDER_KINDS as readonly string[]).includes(value);
}

/** Die Sicht auf den Posteingang: welcher Ausschnitt gezeigt wird. */
export interface MessageFilter {
  /** Nur ungelesene. */
  unreadOnly?: boolean;
  category?: MessageCategory;
  senderKind?: MessageSenderKind;
}

/**
 * Filter ↔ Query-Parameter, beide Richtungen nebeneinander.
 *
 * Vorher stand das Schreiben im Client und das Lesen in der Route — dieselbe Abbildung, vierzig
 * Zeilen und eine Modulgrenze auseinander, und beide Seiten scheitern STILL: ein vergessener
 * Parameter fällt einfach weg, die Auswahl bleibt sichtbar und die Liste ignoriert sie. Nebeneinander
 * kann eine neue Filter-Dimension nur noch in beiden oder in keiner fehlen.
 */
export function messageFilterToParams(filter: MessageFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.unreadOnly) params.set("unread", "1");
  if (filter.category) params.set("category", filter.category);
  if (filter.senderKind) params.set("sender", filter.senderKind);
  return params;
}

/** Unbekannte Werte fallen weg, statt den Aufruf abzuweisen: ein Filter ist eine ANSICHT, kein
 *  Vorgang — ein veralteter Link mit einer Kategorie, die es nicht mehr gibt, soll den ungefilterten
 *  Posteingang zeigen und keinen Fehler. */
export function parseMessageFilter(params: URLSearchParams): MessageFilter {
  const category = params.get("category");
  const sender = params.get("sender");
  return {
    unreadOnly: params.get("unread") === "1",
    ...(category && isMessageCategory(category) ? { category } : {}),
    ...(sender && isMessageSenderKind(sender) ? { senderKind: sender } : {}),
  };
}

/** Zeigt die Liste gerade einen Ausschnitt? Entscheidet den Leer-Text — „keine Nachrichten" wäre
 *  falsch, wenn nur der Filter greift. */
export function isMessageFiltered(filter: MessageFilter): boolean {
  return Boolean(filter.unreadOnly || filter.category || filter.senderKind);
}
