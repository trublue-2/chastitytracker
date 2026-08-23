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
export const MESSAGE_CATEGORIES = ["inspection", "lock", "orgasm", "offense", "penalty", "task", "weight", "system"] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/**
 * Body-Key → Kategorie. Vollständig für alle `MESSAGE_BODY_KEYS`; `messageService.test.ts` erzwingt
 * das, damit ein neu hinzugefügter Schlüssel nicht stillschweigend als „system" durchrutscht.
 */
const CATEGORY_BY_BODY_KEY: Record<MessageBodyKey, MessageCategory> = {
  penaltyMessage: "penalty",
  penaltyMessageNoReason: "penalty",
  penaltyTaskMessage: "penalty",
  penaltyTaskDurationMessage: "penalty",

  // Eigene Kategorie, nicht `penalty`: ein festgestelltes Vergehen IST noch keine Strafe, und ein
  // fallengelassenes wird nie eine. Beide unter „Strafe" zu führen hiesse, dem Träger eine
  // Anschuldigung als Urteil zu verkaufen — und der Filter „Strafe" fände Zeilen, die nichts fordern.
  offenseDetectedMessage: "offense",
  offenseDetectedMessageTitled: "offense",
  offenseDismissedMessage: "offense",
  wrongDeviceMessage: "offense",

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
  // Geht in den KEYHOLDER-Posteingang (`audience: "keyholders"`, notify.ts), nicht in den des Subs.
  // Die Kategorie gilt trotzdem: die Filterleiste ist auf beiden Seiten dieselbe.
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
  taskAssignedDurationMessage: "task",
  taskChangedMessage: "task",
  taskChangedDurationMessage: "task",
  taskWithdrawnMessage: "task",
  taskAwaitingMessage: "task",
  taskDoneMessage: "task",
  taskFailedMessage: "task",
  // Wie bei den Kontroll-Keyholder-Meldungen: gehen in den Keyholder-Posteingang, nicht in den des
  // Subs.
  taskDoneMessageKeyholder: "task",
  taskFailedMessageKeyholder: "task",
  taskReviewMessageKeyholder: "task",
  taskProofLateMessageKeyholder: "task",
  taskProofAcceptedMessage: "task",
  taskProofRejectedMessage: "task",

  weightTargetReachedMessageKeyholder: "weight",
  weightTargetLostMessageKeyholder: "weight",
  // Freigabe-Vorgabe (docs/gewicht-freigabe-konzept.md). Kategorie `weight` und nicht `orgasm`:
  // gestellt und zurückgezogen wird eine GEWICHTS-Bedingung. Erst wenn sie greift, entsteht eine
  // Orgasmus-Anforderung — und die meldet sich mit ihren eigenen Schlüsseln.
  weightReleaseSetMessage: "weight",
  weightReleaseWithdrawnMessage: "weight",
  weightReleaseOpenedMessageKeyholder: "weight",
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
 * Vergehen = unlock (Feststellung), Strafe = warn (Forderung), System = neutral.
 */
export const MESSAGE_CATEGORY_PILLS: Record<MessageCategory, { labelKey: string; variant: BadgeVariant }> = {
  inspection: { labelKey: "catInspection", variant: "inspect" },
  lock:       { labelKey: "catLock",       variant: "sperrzeit" },
  orgasm:     { labelKey: "catOrgasm",     variant: "orgasm" },
  // Nicht `warn`: die Warnfarbe gehört der Strafe, und beide können in der LISTE direkt untereinander
  // stehen (in der Filterleiste steht nur der Text). `unlock` heisst app-weit sonst „geöffnet" — die
  // Doppelbelegung ist bewusst in Kauf genommen, frei waren nur `lock`, `unlock` und `ok`, und die
  // beiden grünen sagen bei einem Vergehen das Falsche.
  offense:    { labelKey: "catOffense",    variant: "unlock" },
  penalty:    { labelKey: "catPenalty",    variant: "warn" },
  task:       { labelKey: "catTask",       variant: "request" },
  // Eigene Kategorie und ausdrücklich NICHT `offense`: das erreichte oder verfehlte Ziel meldet eine
  // Zahl, er erhebt keinen Vorwurf. Unter „Vergehen" gefiltert stünde er neben Dingen, die eine
  // Konsequenz verlangen — hier entscheidet die Keyholderin erst noch, ob überhaupt etwas folgt.
  weight:     { labelKey: "catWeight",     variant: "neutral" },
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

/**
 * Wie ein Absender beschriftet wird — die EINE Regel für Filterleiste und Nachrichten-Zeile.
 *
 * DREI Stufen, von der genauesten zur allgemeinsten:
 *
 *  1. `senderName` — der an der NACHRICHT festgehaltene Absender (heute: wer ein Vergehen von Hand
 *     notiert hat). Er gilt vor allem anderen, weil er der einzige ist, der die Frage wirklich
 *     beantwortet: er stand beim Schreiben fest und bleibt wahr, auch wenn die Zuordnung sich
 *     später ändert.
 *  2. `keyholderName` — der EINE Keyholder des Trägers, wenn es genau einen gibt. Eine Schätzung
 *     aus der Seite, nicht aus der Zeile: bei zweien wäre sie null, sonst stünde die falsche Person
 *     an einer Nachricht. Sie trägt weiter jede Zeile, die keinen eigenen Namen hat.
 *  3. Die Bezeichnung der Art. „System" und „KI-Keyholder" ändern sich nie — dort gibt es keine
 *     Person.
 *
 * Der Name gilt nur bei `kind === "keyholder"`: eine System- oder KI-Zeile bekommt gar keinen (und
 * wo doch einer stünde, wäre er ein Datenfehler, den die Anzeige nicht verstärken soll).
 *
 * `t` kommt als Parameter, weil dieselbe Regel in einer Client-Zeile und in einer Client-Leiste
 * gebraucht wird, dieses Modul aber importfrei bleibt (siehe Kopf der Datei).
 */
export function senderLabel(
  kind: MessageSenderKind,
  senderName: string | null,
  keyholderName: string | null,
  t: (key: string) => string,
): string {
  if (kind !== "keyholder") return t(`sender.${kind}`);
  return senderName || keyholderName || t(`sender.${kind}`);
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

/**
 * Derselbe Filter aus den `searchParams` einer SEITE — der Weg, den beide Posteingangs-Seiten gehen.
 *
 * Next.js reicht sie als `Record<string, string | string[] | undefined>` herein, `parseMessageFilter`
 * liest `URLSearchParams`. Diese Umformung stand in beiden Seiten wortgleich da; sie gehört neben
 * die Lese-Regel, damit eine neue Filter-Dimension nicht auf dem Seiten-Weg stumm wegfällt, während
 * sie über die API weiterläuft. Ein doppelt gesetzter Parameter kommt als Array — davon zählt der
 * erste, wie bei `.get()`.
 */
export function parseMessageFilterFrom(
  searchParams: Record<string, string | string[] | undefined>,
): MessageFilter {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  return parseMessageFilter(params);
}

/** Zeigt die Liste gerade einen Ausschnitt? Entscheidet den Leer-Text — „keine Nachrichten" wäre
 *  falsch, wenn nur der Filter greift. */
export function isMessageFiltered(filter: MessageFilter): boolean {
  return Boolean(filter.unreadOnly || filter.category || filter.senderKind);
}
