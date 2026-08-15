import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getControllableSubsCached } from "@/lib/keyholder";
import { bodyKeysOfCategory, bodyKeysOutsideSystem, type MessageFilter, type MessageSenderKind } from "@/lib/messageCategories";
import { dismissalMessageStillApplies, judgmentMessageStillApplies } from "@/lib/offenseTypes";
import { isHiddenFromSub } from "@/lib/delayedTrigger";
import { mapAnforderungStatus } from "@/lib/utils";
import { AI_AUTHOR, hasAuthor } from "@/lib/constants";

/**
 * Der Posteingang: die Nachrichten, die der Sub nachlesen kann.
 *
 * Bis hierher existierten die Meldungen des Trackers nur als Mail und Push — nach dem Versand
 * nirgends mehr. Am härtesten beim Straftext: `StrafeRecord.reason` steht in der Mail, das Strafbuch
 * ist admin-only, und wer die Mail verpasst, erfuhr nie, wofür er bestraft wurde.
 *
 * Zwei Regeln tragen den Rest dieser Datei:
 *  1. Freitexte werden VERLINKT, nicht kopiert (`ref`). Eine spätere Korrektur am Straftext wirkt
 *     damit rückwirkend richtig, statt eine zweite, veraltete Wahrheit stehen zu lassen.
 *  2. Eine Nachricht darf NIEMALS eine terminierte Direktive verraten — deshalb filtert die
 *     ABFRAGE (nicht erst die Anzeige) alles heraus, was `isHiddenFromSub()` verbirgt.
 */

/**
 * Schlüssel im `emails`-Namensraum, die als Nachrichten-Text taugen. `NotifyContent.messageKey` ist
 * auf diese Union getypt: ein Schlüssel, den niemand deklariert hat, ist damit ein Compile-Fehler
 * statt einer unübersetzten Nachricht. Die Gegenrichtung — jeder Schlüssel existiert in BEIDEN
 * Sprachdateien — erzwingt `messageService.test.ts`.
 */
export const MESSAGE_BODY_KEYS = [
  // Strafe
  "penaltyMessage",
  "penaltyMessageNoReason",
  "penaltyTaskMessage",
  "penaltyTaskDurationMessage",
  // Vergehen — festgestellt (noch ohne Urteil) bzw. fallengelassen. Die Feststellung gibt es in
  // zwei Fassungen: mit eigenem Anlass-Titel (notiertes Vergehen, Aufgabe) und ohne, wo die Art
  // selbst schon alles sagt.
  "offenseDetectedMessage",
  "offenseDetectedMessageTitled",
  "offenseDismissedMessage",
  // Automatisch geahndet, ohne Urteilsschritt — deshalb eine eigene Meldung: der Melder sieht sie
  // nicht (er meldet nur Unbeurteiltes) und der Dashboard-Block auch nicht (nur offene Strafen).
  "wrongDeviceMessage",
  // Kontrolle
  "inspectionRequestedMessage",
  "inspectionConfirmedMessage",
  "inspectionRejectedMessage",
  "inspectionResolvedWithdrawnMessage",
  "inspectionReminderMessage",
  "inspectionReminderMessageNoCode",
  "inspectionAutoRemovedMessageSub",
  "inspectionAutoRemovedMessageSubNoCode",
  "inspectionAutoRemovedMessageSubWear",
  "inspectionAutoRemovedMessageSubWearNoCode",
  "inspectionAutoRemovedMessageKeyholder",
  "inspectionAutoRemovedMessageKeyholderNoCode",
  "inspectionAutoRemovedMessageKeyholderWear",
  "inspectionAutoRemovedMessageKeyholderWearNoCode",
  // Verschluss / Sperrzeit
  "lockRequestBody",
  "lockPeriodSetBody",
  "lockRequestChangedMessage",
  "lockPeriodChangedMessage",
  "lockPeriodChangedMessageIndefinite",
  "lockRequestWithdrawnMessage",
  "lockPeriodWithdrawnMessage",
  // Orgasmus
  "orgasmAnweisungIntro",
  "orgasmGelegenheitIntro",
  "orgasmWithdrawnMessage",
  // Aufgaben
  "taskAssignedMessage",
  "taskAssignedDurationMessage",
  "taskChangedMessage",
  "taskChangedDurationMessage",
  "taskWithdrawnMessage",
  "taskAwaitingMessage",
  "taskDoneMessage",
  "taskFailedMessage",
  "taskDoneMessageKeyholder",
  "taskFailedMessageKeyholder",
  "taskReviewMessageKeyholder",
  "taskProofAcceptedMessage",
  "taskProofRejectedMessage",
] as const;

export type MessageBodyKey = (typeof MESSAGE_BODY_KEYS)[number];

/**
 * An WEN eine Nachricht gerichtet ist.
 *
 * `subjectUserId` bleibt in BEIDEN Fällen der SUB — auch bei `"keyholders"`. Warum das aufgeht und
 * warum der Kanal deshalb ohne Migration auskommt, steht KANONISCH am Modell selbst
 * (`prisma/schema.prisma`, `Message.audience`). Hier nicht wiederholt: zwei Fassungen derselben
 * Begründung laufen beim ersten Nachziehen auseinander.
 *
 * Der Typ liegt HIER und nicht im importfreien `messageCategories.ts`: die Zielgruppe ist keine
 * Filter-Dimension, die der Nutzer wählt, sondern folgt daraus, WER schaut. Eine Client-Komponente
 * hat mit ihr nichts zu tun. Braucht sie später doch eine, zieht der Typ um.
 */
export type MessageAudience = "sub" | "keyholders";

/**
 * Wessen Posteingang gemeint ist — die EINE Antwort auf „welche Zeilen" UND „wessen Gelesen-Stand".
 *
 * Bis zum Keyholder-Kanal waren beide derselbe Wert: der Sub liest seinen eigenen Posteingang, also
 * stand `subjectUserId` sowohl im Zeilen-Filter als auch in `reads: { where: { userId } }`. Genau
 * diese Kopplung bricht hier auf — die Zeilen gehören dem SUB, gelesen werden sie vom KEYHOLDER.
 * Ein zweiter Satz Abfragen dafür hiesse, jede Scope- und Sichtbarkeitsregel doppelt zu pflegen.
 *
 * Der Scope ist damit auch die Rechte-Grenze: er kommt IMMER vom Aufrufer (Session bzw. Guard) und
 * nie aus Query oder Body. Jede Abfrage dieser Datei trägt ihn in ihrer Where-Klausel.
 */
export interface InboxScope {
  /** Die Träger, um die es geht. Leere Liste = garantiert leeres Ergebnis (Keyholder ohne Subs). */
  subjectUserIds: string[];
  /**
   * Benutzername je Träger — die Auskunft, die eine Zeile im Keyholder-Posteingang braucht: der
   * spannt über mehrere Träger, und eine Zeile, die nicht sagt, um WEN es geht, ist dort unbrauchbar.
   *
   * `null` im Posteingang des Trägers: dort wäre die Antwort immer „ich". Die Namen kommen mit dem
   * Scope herein, weil der Guard sie ohnehin gelesen hat (`getControllableSubs` liefert
   * `{id, username}[]`) — sie hier nachzuschlagen wäre eine zweite Abfrage über dieselben Ids.
   */
  subjectNames: ReadonlyMap<string, string> | null;
  /** Wer LIEST — löst `MessageRead` auf. Beim Sub er selbst, beim Keyholder der Keyholder. */
  readerId: string;
  audience: MessageAudience;
}

/** Der Posteingang des Subs: er ist Betreff UND Leser. */
export const subInbox = (subjectUserId: string): InboxScope => ({
  subjectUserIds: [subjectUserId],
  subjectNames: null,
  readerId: subjectUserId,
  audience: "sub",
});

/**
 * Der Posteingang eines Keyholders: die Zeilen seiner Subs, gelesen von IHM.
 *
 * Die Sub-Liste ist die Rechte-Grenze — sie kommt vom Aufrufer (`assertController()` /
 * `requireControllerApi()`, beide über `getControllableSubs`), nie aus der Anfrage. Keine zweite
 * Ableitung der Zuordnung: sie ist die eine Abfrage dieses Features, die nicht auseinanderlaufen
 * darf.
 *
 * ENTSCHIEDEN (die Routen stehen): es ist `getControllableSubs`, nicht das engere
 * `getKeyholdersOfUser`. Drei Gründe, in dieser Reihenfolge:
 *  1. Es spiegelt `getControllersOfUser` — genau die Menge, die denselben Inhalt heute schon per
 *     Mail bekommt. Der Posteingang darf keinen engeren Kreis haben als der Kanal, den er ersetzt.
 *  2. Das engere Set wäre auf jeder Instanz LEER, die keine `AdminUserRelationship`-Zeilen pflegt
 *     (nachgeprüft: die Live-Instanz hat null) — der Posteingang bliebe dort dauerhaft leer, ohne
 *     dass jemand einen Fehler sähe.
 *  3. Es ist dieselbe Grenze wie überall sonst im blauen Bereich; ein zweiter, engerer Begriff von
 *     „meine Träger" nur für Nachrichten wäre die Sorte Sonderregel, die man beim dritten Feature
 *     vergisst.
 *
 * Der Preis, klar ausgesprochen: auf einer Instanz OHNE `AdminUserRelationship`-Zeilen liest JEDER
 * globale Admin die Keyholder-Meldungen ALLER Träger mit. Das ist dieselbe Sichtbarkeit, die er per
 * Mail ohnehin hat, aber es ist eine bewusste Entscheidung und keine Nebenwirkung.
 */
export const keyholderInbox = (readerId: string, subs: { id: string; username: string }[]): InboxScope => ({
  subjectUserIds: subs.map((s) => s.id),
  subjectNames: new Map(subs.map((s) => [s.id, s.username])),
  readerId,
  audience: "keyholders",
});

/** Objekt-Typen, auf die eine Nachricht zeigen kann. Namensschema wie `NoteRef.entityType`. */
/**
 * `offense` zeigt auf die id des URTEILS (`StrafeRecord.id`) — die „Strafe verhängt"-Nachricht.
 * `detectedOffense` zeigt auf die `refId` des VERGEHENS, also auf den Anlass, der auch ohne Urteil
 * existiert. Zwei Namensräume, deshalb zwei Typen: dieselbe Zeile unter einem Namen zu führen hiesse,
 * eine `refId` gegen `StrafeRecord.id` aufzulösen — das findet nichts und die Nachricht stünde als
 * „nicht auflösbar" im Posteingang.
 */
export type MessageRefType = "offense" | "detectedOffense" | "control" | "lockRequest" | "orgasmDirective" | "task";
export interface MessageRef {
  type: MessageRefType;
  id: string;
}

/** Wer getippt hat. Zwei Achsen wie im Bestand (`StrafeRecord.judgedBy` / `KeyholderActionLog.source`):
 *  `kind` ist der Absender, nicht die Autorität. */
/** Absender-Arten und Filter liegen in `messageCategories.ts` — importfrei, damit die
 *  Client-Filterleiste sie lesen kann, ohne `prisma` in den Browser zu ziehen. Hier re-exportiert,
 *  damit die bestehenden Importeure unverändert bleiben. */
export { MESSAGE_SENDER_KINDS, isMessageSenderKind, type MessageSenderKind, type MessageFilter } from "@/lib/messageCategories";

export interface RecordMessageParams {
  subjectUserId: string;
  /**
   * Default `"sub"` — jeder Bestandsaufrufer schreibt in den Posteingang des Trägers, und das soll
   * er auch weiterhin, ohne es hinzuschreiben. Nur `notifyControllers` setzt `"keyholders"`.
   */
  audience?: MessageAudience;
  bodyKey: MessageBodyKey;
  params?: Record<string, string | number>;
  /**
   * WER die Meldung ausgelöst hat — weglassen, wo die App selbst entschieden hat. Siehe
   * {@link MessageActor}.
   *
   * Der HANDELNDE und nicht das Paar `senderKind`/`senderName`: die Absender-Achse leitet
   * {@link recordSystemMessage} über {@link senderFromAuthor} selbst ab. Solange die beiden Spalten
   * hier standen, konnte ein Aufrufer sie widersprüchlich setzen (ein Name an einer System-Zeile,
   * eine KI-Zeile mit menschlichem Namen) — und die Schreibstelle musste das mit einem eigenen
   * Wächter wieder einfangen. Als EINE Angabe ist der Widerspruch nicht mehr formulierbar.
   */
  actor?: MessageActor;
  ref?: MessageRef | null;
  /**
   * Höchstens EINE Nachricht dieses Texts pro Bezugsobjekt.
   *
   * Für die Zustellung einer Direktive: der Poller sendet ZUERST und stempelt `benachrichtigtAt`
   * danach (damit ein Fehlschlag erneut versucht wird — bewusst so, siehe kontrollePoller.ts).
   * Bricht er dazwischen ab, liefe der nächste Lauf erneut durch diese Funktion und hinterliesse
   * eine zweite, dauerhafte Zeile im Posteingang. Vorher war der Preis eines Retrys eine doppelte
   * Mail — transient; eine doppelte Nachricht bliebe stehen.
   *
   * Bewusst ein Read-then-Write ohne DB-Constraint: die Läufe liegen Minuten auseinander (Absturz,
   * Deploy), nicht Millisekunden, und ein `@@unique` würde die legitimen Wiederholungen anderer
   * Texte zum selben Objekt (geänderte Frist, Rückzug) mit verbieten.
   */
  once?: boolean;
}

/**
 * Wer GEHANDELT hat — die eine Kennung, die von der Aktion bis an die Nachricht durchgereicht wird.
 *
 * Drei zulässige Formen, und {@link senderFromAuthor} ist die einzige Stelle, die sie auseinanderhält:
 *  * der BENUTZERNAME eines Menschen (Sitzung: `session.user.name`) → Keyholder-Zeile MIT Namen,
 *  * {@link AI_AUTHOR} → KI-Zeile ohne Namen (der MCP hat keine Person),
 *  * leer/`null`/`undefined` → niemand hat gehandelt, die App hat entschieden → System-Zeile.
 *
 * Ein eigener Name statt `string | null | undefined` an zwanzig Signaturen: das Feld trägt eine
 * Zusicherung („genau EINE Person, nie eine Rolle, nie eine Liste"), die ein nackter String nicht
 * ausspricht — und die Stelle, an der man sie nachliest, ist diese hier.
 */
export type MessageActor = string | null | undefined;

/** Die beiden Absender-Spalten einer Nachricht, wie sie in die Tabelle gehen. */
type SenderColumns = { senderKind: MessageSenderKind; senderName: string | null };

/**
 * Absender-Angaben aus der Kennung des Handelnden — die EINE Abbildung {@link MessageActor} →
 * Absender-Achse. Jede Meldung dieser App geht durch sie; eine zweite daneben wäre die Stelle, an
 * der die KI irgendwann als Mensch (oder ein Mensch als System) im Posteingang stünde.
 *
 * MODULPRIVAT, und das ist der Punkt: die Schreibstelle ({@link recordSystemMessage}) ruft sie
 * selbst, und {@link RecordMessageParams} nimmt gar keine Absender-Spalten mehr entgegen. Damit ist
 * „die Absender-Achse folgt immer dem Handelnden" keine Regel, an die sich sechs Aufrufer halten
 * müssen, sondern die einzige Form, in der eine Nachricht entstehen kann.
 *
 * Der Wertebereich ist genau der Grund, warum sie nicht auf `StrafeRecord.judgedBy` rechnet: darin
 * stehen nur Kürzel ({@link AI_AUTHOR}/"admin"/"system"), hier dagegen dieselbe KI-Kennung ODER ein
 * echter BENUTZERNAME. Die Richtung „Kennung → Kürzel" ist die Umkehrung und steht dort, wo das
 * Kürzel gebraucht wird (`judgedByFromActor` in strafurteilService.ts).
 *
 * Das Ergebnis ist VOLLSTÄNDIG: beide Spalten stehen immer drin, auch im Fall „kein Autor" — es gibt
 * keinen Standard, der von woanders durchkäme, und damit keinen Zustand, in dem die eine Spalte
 * gesetzt und die andere geraten ist.
 *
 * OHNE Autor ist „system" die richtige Antwort und keine Notlösung: eine Meldung ohne Handelnden ist
 * ein Befund der App (Auto-Kontrolle, Eskalation, abgeleitetes Vergehen). WELCHE Werte als „kein
 * Autor" gelten, sagt {@link hasAuthor} — dort steht auch, warum ein Platzhalter dazugehört.
 */
function senderFromAuthor(author: MessageActor): SenderColumns {
  if (!hasAuthor(author)) return { senderKind: "system", senderName: null };
  return author === AI_AUTHOR
    ? { senderKind: "ai", senderName: null }
    : { senderKind: "keyholder", senderName: author };
}

/**
 * Dieselbe Kennung für eine SPALTE (`KontrollAnforderung.createdBy`, `VerschlussAnforderung.createdBy`).
 *
 * Steht neben {@link senderFromAuthor}, weil beide dieselbe Grenze ziehen müssen: was die Lese-Seite
 * als „kein Autor" versteht, darf die Schreib-Seite nicht als Autor ablegen. Zwei getrennt
 * hingeschriebene `|| null` in zwei Diensten waren genau die Stelle, an der das auseinanderläuft —
 * dann stünde in der Spalte ein Wert, den kein Leser als „niemand" erkennt. Beide fragen deshalb
 * dasselbe {@link hasAuthor}.
 *
 * Bleibt hier und wandert NICHT zu `hasAuthor` in die `constants.ts`: dies ist die Schreibform eines
 * {@link MessageActor}, und der Typ mit seiner Zusicherung („genau EINE Person") wohnt hier.
 */
export function actorColumn(actor: MessageActor): string | null {
  return hasAuthor(actor) ? actor : null;
}

/**
 * Schreibt eine Maschinen-Nachricht (i18n-Schlüssel + Parameter). Die einzige Factory dieser Etappe
 * — sie ist der Grund, warum `body` und `bodyKey` sich nicht gegenseitig überschreiben können: es
 * gibt keinen Aufrufer, der beides setzen könnte (SQLite kennt den Constraint nicht).
 *
 * Fire-and-forget-tauglich: wirft nicht. Eine fehlgeschlagene Nachricht darf die auslösende
 * Direktive nicht mitreissen. Liefert die id der Nachricht (null, wenn das Schreiben scheiterte) —
 * gebraucht für `unreadCount(scope, alsoCount)`.
 */
export async function recordSystemMessage(p: RecordMessageParams): Promise<string | null> {
  const audience = p.audience ?? "sub";
  // Die Absender-Achse entsteht HIER, aus dem Handelnden — die EINE Schreibstelle ist damit auch die
  // einzige, die `senderKind`/`senderName` je zu Gesicht bekommt. Ein Name an einer System-Zeile
  // (oder eine KI-Zeile mit menschlichem Namen) ist deshalb nicht mehr abzuwehren, sondern gar nicht
  // erst formulierbar: {@link senderFromAuthor} erzeugt beide Spalten zusammen.
  const { senderKind, senderName } = senderFromAuthor(p.actor);
  try {
    if (p.once && p.ref) {
      const existing = await prisma.message.findFirst({
        where: {
          subjectUserId: p.subjectUserId,
          // Mit in die Suche: Sub- und Keyholder-Zeile teilen sich Träger und Bezugsobjekt. Ohne
          // `audience` hielte die eine die andere für ihr eigenes Duplikat und unterdrückte sie.
          audience,
          bodyKey: p.bodyKey,
          refEntityType: p.ref.type,
          refEntityId: p.ref.id,
        },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    const created = await prisma.message.create({
      data: {
        subjectUserId: p.subjectUserId,
        senderKind,
        senderName,
        audience,
        bodyKey: p.bodyKey,
        bodyParams: p.params ? JSON.stringify(p.params) : null,
        refEntityType: p.ref?.type ?? null,
        refEntityId: p.ref?.id ?? null,
      },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    console.error("[messages] record failed", err);
    return null;
  }
}

/** Eine Zeile im Posteingang. `refText` ist der LIVE gelesene Freitext des Bezugsobjekts. */
export interface InboxMessage {
  id: string;
  createdAt: Date;
  senderKind: MessageSenderKind;
  /** Der NAME des Absenders, wo einer festgehalten wurde — sonst null, dann beschriftet die Anzeige
   *  die Zeile über die `senderKind` (siehe `senderLabel`). */
  senderName: string | null;
  bodyKey: string | null;
  bodyParams: Record<string, string | number> | null;
  body: string | null;
  /** Freitext des Bezugsobjekts (Straftext, Kommentar, Anforderungs-Nachricht) — frisch gelesen. */
  refText: string | null;
  /** Code der offenen Kontrolle, falls die Nachricht auf eine zeigt — der Presenter macht daraus
   *  das Ziel. Sonst null: es gibt keine Seite, die etwas beiträgt. */
  refActionCode: string | null;
  /** ZIEL dieser Kontrolle (`categoryId`, null = KG). Muss mit in den Link: ohne ihn landet eine
   *  Trage-Kontrolle auf dem KG-Formular, und die Einreichung beantwortet sie nicht (v5.0.1). */
  refActionCategoryId: string | null;
  /** Referenz gesetzt, Objekt aber nicht (mehr) auflösbar. Muster: `unknownRef` in lib/mcp/notes.ts. */
  refMissing: boolean;
  /**
   * Benutzername des TRÄGERS — nur im Keyholder-Posteingang gesetzt, sonst `null`.
   *
   * Der Keyholder-Posteingang spannt über mehrere Träger: eine Zeile, die nicht sagt, um WEN es
   * geht, ist dort unbrauchbar. Im Posteingang des Trägers ist die Antwort dagegen immer „ich" —
   * dort bleibt das Feld leer. Aufgelöst aus `InboxScope.subjectNames`, also ohne eigene Abfrage.
   */
  subjectUsername: string | null;
  read: boolean;
}

/** Zeilen je Seite im Posteingang. Klein genug, dass eine Seite auf einen Blick lesbar bleibt —
 *  der Grund, warum aus dem wachsenden „Mehr laden" echte Seiten wurden. */
export const MESSAGE_PAGE_SIZE = 20;

function parseParams(raw: string | null): Record<string, string | number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string | number>) : null;
  } catch {
    return null;
  }
}

/**
 * Das Minimum, um über die Sichtbarkeit einer Nachricht zu entscheiden. `bodyKey` gehört dazu, weil
 * die Sichtbarkeit nicht durchgehend am Referenz-Typ hängt — siehe {@link DISMISSED_OFFENSE_KEY}.
 * Pflichtfeld, damit ein Aufrufer, der die Spalte nicht mitliest, ein Compile-Fehler ist statt einer
 * stillen Regression.
 */
type RefRow = {
  id: string;
  /** Der TRÄGER der Zeile — Teil jedes Referenz-Schlüssels (siehe {@link refKey}). Pflichtfeld,
   *  damit ein Aufrufer, der die Spalte nicht mitliest, ein Compile-Fehler ist. */
  subjectUserId: string;
  bodyKey: string | null;
  refEntityType: string | null;
  refEntityId: string | null;
};

/**
 * Der Schlüssel, unter dem Freitext und Sichtbarkeit eines Bezugsobjekts nachgeschlagen werden.
 *
 * Mit dem TRÄGER davor, nicht bloss `typ:id`: der Keyholder-Posteingang spannt über mehrere Träger,
 * und ohne ihn fiele eine Zeile über Sub A mit dem Bezugsobjekt von Sub B zusammen, sobald beide im
 * selben Stapel liegen. „Ids sind cuids, das trifft sich nie" wäre ein Argument aus der Konstruktion
 * — und genau die Sorte Argument, die dieser Datei sonst nirgends reicht, weil der Träger überall
 * Teil der SUCHE ist. Er ist es deshalb auch hier, statt dass die Auflösung bei mehreren Trägern
 * abgeschaltet wird (bis v5.1 die Folge: auf jeder Instanz mit zwei Subs — und immer beim globalen
 * Admin — verlor JEDE Keyholder-Zeile ihren Bezugs-Block, und eine tote Referenz war von einer nie
 * gesetzten nicht zu unterscheiden).
 */
const refKey = (subjectUserId: string, type: string, id: string) => `${subjectUserId}:${type}:${id}`;

/** Die Zeilen eines Stapels, die auf DIESEN Objekt-Typ zeigen — mit Träger und Referenz-Id. */
function refsOfType(rows: RefRow[], type: MessageRefType): { subjectUserId: string; refId: string }[] {
  return rows
    .filter((r) => r.refEntityType === type && r.refEntityId)
    .map((r) => ({ subjectUserId: r.subjectUserId, refId: r.refEntityId! }));
}

/** Die Referenz-Ids eines Nachrichten-Stapels je Objekt-Typ — die `in`-Liste der Abfragen. */
function idsOfType(rows: RefRow[], type: MessageRefType): string[] {
  return refsOfType(rows, type).map((r) => r.refId);
}

/**
 * Eigener Sichtbarkeits-Namensraum auf DERSELBEN Referenz: `detectedOffense:<refId>` ist die
 * Feststellung („ein Vergehen wurde festgestellt" — bleibt wahr), `dismissedOffense:<refId>` die
 * Verwerfung („fallengelassen" — gilt nur, solange das Urteil DISMISSED ist). Kein
 * {@link MessageRefType}: an der Nachricht steht weiterhin `detectedOffense`, dies hier ist nur der
 * Schlüssel, unter dem Text und Sichtbarkeit nachgeschlagen werden.
 */
const DISMISSED_OFFENSE_KEY = "dismissedOffense";

/**
 * Auf die Union getippt, nicht als roher String verglichen: `RefRow.bodyKey` ist `string | null`,
 * eine Umbenennung des Schlüssels bliebe hier also stumm — `keyOf` fiele auf `detectedOffense`
 * zurück und JEDE überholte Verwerfungs-Meldung wäre wieder dauerhaft sichtbar, unter dem Straftext.
 * Genau der Fehler, den diese Regel verhindert.
 *
 * Exportiert, weil DREI Stellen dieselbe Zeile meinen müssen: die Sichtbarkeit hier, das Schreiben
 * (`notifyOffenseDismissed`) und das Löschen beim Wieder-Eröffnen (`judgeOffense`, siehe dort).
 * Ein zweites Literal in einer davon wäre lautlos — geschrieben würde die eine Zeile, gesucht die
 * andere.
 */
export const DISMISSAL_BODY_KEY: MessageBodyKey = "offenseDismissedMessage";

/** Ist das eine Verwerfungs-Meldung? Die einzige Zeile, deren Sichtbarkeit am `bodyKey` hängt. */
function isDismissalRow(row: RefRow): boolean {
  return row.bodyKey === DISMISSAL_BODY_KEY && row.refEntityType === "detectedOffense" && Boolean(row.refEntityId);
}

function keyOf(row: RefRow): string | null {
  if (!row.refEntityType || !row.refEntityId) return null;
  return refKey(row.subjectUserId, isDismissalRow(row) ? DISMISSED_OFFENSE_KEY : row.refEntityType, row.refEntityId);
}

/**
 * Die `subjectUserId`-Bedingung eines Scopes — und dieselbe als `userId` für die Bezugsobjekte.
 *
 * IMMER als `IN (…)`, auch bei einem einzelnen Träger: für den Planer ist das nachweislich egal —
 * SQLite klappt ein einelementiges `IN` auf eine Gleichheit zusammen (die Stelligkeit steht beim
 * Vorbereiten fest) und nutzt `@@index([subjectUserId, audience, createdAt, id])` in beiden
 * Schreibweisen ohne temporären B-Baum. Eine Sonderform ohne Wirkung ist nur eine zweite Gestalt
 * derselben Bedingung.
 *
 * AB ZWEI Trägern kippt der Plan: `ORDER BY createdAt DESC, id DESC` kann die Index-Ordnung dann
 * nicht mehr nutzen und SQLite sortiert die ganze Treffermenge in einem temporären B-Baum — auch für
 * Seite 1. Mit `subjectUserId` als führender Spalte ist das durch keinen Index zu heilen; bei einer
 * Handvoll Subs ist es bedeutungslos, bei fünfstelligen Nachrichtenmengen wäre es der Punkt, an dem
 * die Keyholder-Liste eine eigene Sortier-Strategie braucht.
 */
function subjectFilter(scope: InboxScope): Prisma.StringFilter {
  return { in: scope.subjectUserIds };
}

/**
 * Gilt die Verbergen-Regel für DIESEN Leser?
 *
 * Sie schützt eine Überraschung vor dem SUB (`isHiddenFromSub`) — vor dem Keyholder gibt es nichts
 * zu verbergen, er hat die terminierte Direktive selbst gestellt.
 *
 * Seit die Aufgaben-Ergebnismeldung ein `ref` trägt (für ihre Einmal-Zusage, siehe
 * `notifyControllers`), ist diese Prüfung nicht mehr bloss theoretisch: ohne sie könnte eine
 * Keyholder-Zeile ausgerechnet vor dem verschwinden, der die Direktive angeordnet hat. Angewendet
 * wird sie an zwei Stellen — `hiddenRefKeys` (Zähler) und der Filter in {@link listMessages}.
 */
const hidesFromReader = (scope: InboxScope): boolean => scope.audience === "sub";

/**
 * Die Referenz-Schlüssel, die für den Sub VERBORGEN sind.
 *
 * Nur `KontrollAnforderung` und `VerschlussAnforderung` tragen überhaupt das `{wirksamAb,
 * benachrichtigtAt}`-Paar (siehe delayedTrigger.ts) — Strafen, Orgasmus-Anweisungen und Aufgaben
 * können nicht terminiert sein und sind deshalb nie verborgen. Genau deshalb fragt diese Funktion
 * ZWEI Tabellen, nicht eine je Referenz-Art: sie ist der heisse Pfad (Header, jede Dashboard-Seite).
 * Wer eine Referenz-Art ergänzt, prüft zuerst, ob sie terminierbar ist — nur dann gehört sie hierher.
 *
 * Immer auf die Träger des Scopes eingegrenzt — eine Referenz auf die Zeile eines anderen Nutzers
 * findet nichts, statt sie preiszugeben.
 */
async function hiddenRefKeys(rows: RefRow[], scope: InboxScope): Promise<Set<string>> {
  // Die Regel gilt für den TRÄGER, nicht für jeden Leser — und sie wird HIER durchgesetzt, nicht an
  // den Aufrufern: eine leere Menge heisst „nichts verborgen", also bleibt jeder Aufruf drüben
  // bedingungslos. Stünde die Prüfung stattdessen an den Aufrufern, gäbe es zwei Stellen (in
  // unterschiedlicher Tiefe), die man beim dritten vergessen kann.
  if (!hidesFromReader(scope)) return new Set();
  const subjectUserId = subjectFilter(scope);
  const controlIds = idsOfType(rows, "control");
  const lockRequestIds = idsOfType(rows, "lockRequest");
  const offenseIds = idsOfType(rows, "offense");
  const dismissed = rows.filter(isDismissalRow).map((r) => ({ subjectUserId: r.subjectUserId, refId: r.refEntityId! }));
  const dismissedIds = dismissed.map((d) => d.refId);
  // Die „Strafe verhängt"-Nachricht zeigt auf die id des Urteils, die Verwerfungs-Meldung auf die
  // `refId` des Vergehens — zwei Spalten derselben Tabelle, also EINE Abfrage. Aber `OR` nur, wenn
  // wirklich beide Seiten etwas suchen: neben dem `userId`-Filter kostet ein `OR` SQLite den
  // Punktzugriff, es liest dann JEDE Straf-Zeile des Nutzers. Meist ist eine der beiden Listen leer
  // — und dieser Pfad läuft im Header auf jeder Dashboard-Seite.
  const offenseBranches: Prisma.StrafeRecordWhereInput[] = [
    ...(offenseIds.length ? [{ id: { in: offenseIds } }] : []),
    ...(dismissedIds.length ? [{ refId: { in: dismissedIds } }] : []),
  ];

  // `userId` mitlesen: der Träger steht im Referenz-Schlüssel (siehe `refKey`), und er kommt aus dem
  // gefundenen Objekt statt aus der Nachricht — die Abfrage ist ohnehin auf den Scope eingegrenzt.
  const scoped = { wirksamAb: true, benachrichtigtAt: true, id: true, userId: true } as const;
  const [controls, lockRequests, offenses] = await Promise.all([
    // Leere `in`-Liste = garantiert leeres Ergebnis: die Abfrage gar nicht erst stellen.
    controlIds.length
      ? prisma.kontrollAnforderung.findMany({ where: { id: { in: controlIds }, userId: subjectUserId }, select: scoped })
      : [],
    lockRequestIds.length
      ? prisma.verschlussAnforderung.findMany({ where: { id: { in: lockRequestIds }, userId: subjectUserId }, select: scoped })
      : [],
    // Der Urteils-Status gehört ZUM ZÄHLER, nicht nur zur Anzeige: verbirgt `refDetails` eine
    // Nachricht zu einem verworfenen Urteil, der Zähler sie aber nicht, steht dauerhaft ein Badge
    // über einem leeren Posteingang — und der Sub bekommt es nicht weg. Die beiden Pfade sind
    // getrennt, weil der Zähler keine TEXTE braucht; dieselbe Sichtbarkeit brauchen sie sehr wohl.
    offenseBranches.length
      ? prisma.strafeRecord.findMany({
          where: { userId: subjectUserId, ...(offenseBranches.length === 1 ? offenseBranches[0] : { OR: offenseBranches }) },
          select: { id: true, userId: true, refId: true, status: true },
        })
      : [],
  ]);

  const hidden = new Set<string>();
  for (const c of controls) if (isHiddenFromSub(c)) hidden.add(refKey(c.userId, "control", c.id));
  for (const l of lockRequests) if (isHiddenFromSub(l)) hidden.add(refKey(l.userId, "lockRequest", l.id));
  for (const o of offenses) if (!judgmentMessageStillApplies(o)) hidden.add(refKey(o.userId, "offense", o.id));
  // Wortgleich zur Ableitung in `refDetails` — Zähler und Liste dürfen hier nicht auseinanderlaufen.
  // Über die REFERENZEN, nicht über die gefundenen Urteile: ein blosses reopen LÖSCHT die Zeile, und
  // eine „fallengelassen"-Meldung ohne Urteil ist genauso falsch wie eine mit einem Strafurteil.
  if (dismissed.length) {
    const judgmentByRef = judgmentsByRef(offenses);
    for (const d of dismissed) {
      if (!dismissalMessageStillApplies(judgmentByRef.get(refKey(d.subjectUserId, "detectedOffense", d.refId)))) {
        hidden.add(refKey(d.subjectUserId, DISMISSED_OFFENSE_KEY, d.refId));
      }
    }
  }
  return hidden;
}

/** Urteile nach der Referenz ihres VERGEHENS — unter demselben Schlüssel, unter dem auch die
 *  Feststellungs-Meldung nachschlägt (Träger + `detectedOffense` + `refId`). Geteilt von Zähler und
 *  Liste, damit die Zuordnung nicht zweimal von Hand entsteht. */
function judgmentsByRef<T extends { userId: string; refId: string }>(judgments: T[]): Map<string, T> {
  return new Map(judgments.map((j) => [refKey(j.userId, "detectedOffense", j.refId), j]));
}

/** Was ein Bezugsobjekt für die Anzeige beiträgt: sein Freitext und — falls es eine Seite gibt, die
 *  etwas dazu sagt — das Ziel dorthin. */
type RefDetail = {
  text: string | null;
  /** Code der offenen Kontrolle — daraus baut der Presenter das Ziel. Der Service kennt keine
   *  Router-Pfade: `category` und Link sitzen dann beide in der Anzeige-Schicht. */
  actionCode: string | null;
  /** Für den Sub verborgen (terminierte, noch nicht ausgelöste Direktive). */
  /** Nur bei Kontrollen: das Ziel für den Formular-Link (null = KG bzw. keine Handlung offen). */
  actionCategoryId?: string | null;
  hidden: boolean;
};

/** Freitext + Link-Ziel je Referenz — nur für die ANZEIGE, deshalb getrennt von {@link hiddenRefKeys}:
 *  der Zähler braucht keinen einzigen dieser Texte.
 *
 *  Der Ergebnis-Schlüssel trägt den TRÄGER (siehe {@link refKey}), also löst diese Funktion über
 *  beliebig viele Träger auf — der Keyholder-Posteingang bekommt seine Bezugs-Blöcke damit auch auf
 *  einer Instanz mit mehreren Subs (und beim globalen Admin, wo es immer mehrere sind).
 *
 *  Das Feld `hidden` gilt trotzdem NUR für den Träger: die Anwendung steht beim Aufrufer
 *  ({@link listMessages}) hinter {@link hidesFromReader}. Der Keyholder bekommt hier also Texte,
 *  aber keine Verbergen-Regel — er hat die terminierte Direktive selbst gestellt. */
async function refDetails(rows: RefRow[], scope: InboxScope): Promise<Map<string, RefDetail>> {
  const subjectUserId = subjectFilter(scope);
  const detected = refsOfType(rows, "detectedOffense");
  const [offenseIds, detectedIds, controlIds, lockIds, orgasmIds, taskIds] =
    (["offense", "detectedOffense", "control", "lockRequest", "orgasmDirective", "task"] as const).map((t) => idsOfType(rows, t));

  const [judgments, controls, lockRequests, orgasmDirectives, tasks] = await Promise.all([
    // `status` mitlesen: ein verworfenes Urteil darf den Sub gar nicht erst erreichen — siehe
    // `judgmentMessageStillApplies`. Ohne diese Spalte zeigte eine alte „Strafe verhängt"-Nachricht nach
    // einer Korrektur auf PUNISHED→DISMISSED die VERWERFUNGS-Begründung.
    // EINE Abfrage für beide Vergehens-Bezüge. Die „Strafe verhängt"-Nachricht zeigt auf die id des
    // Urteils, die Feststellungs-Meldung auf die `refId` des Vergehens (sie entsteht, BEVOR es ein
    // Urteil gibt) — dieselbe Tabelle, zwei Spalten. Zwei findMany dafür wären derselbe Fehler, den
    // der Kommentar bei den Verschluss-Anforderungen zwei Zeilen tiefer schon benennt.
    offenseIds.length || detectedIds.length
      ? prisma.strafeRecord.findMany({
          where: { userId: subjectUserId, OR: [{ id: { in: offenseIds } }, { refId: { in: detectedIds } }] },
          // `userId` überall mitlesen: der Träger ist Teil des Ergebnis-Schlüssels (siehe `refKey`).
          select: { id: true, userId: true, refId: true, reason: true, status: true },
        })
      : [],
    // Mehr als der Kommentar: aus Code + Zustand entsteht das Link-Ziel (siehe unten).
    controlIds.length ? prisma.kontrollAnforderung.findMany({
      where: { id: { in: controlIds }, userId: subjectUserId },
      // `categoryId`: das Ziel gehört zum Link (siehe refActionCategoryId).
      select: { id: true, userId: true, kommentar: true, code: true, categoryId: true, entryId: true, withdrawnAt: true, deadline: true, wirksamAb: true, benachrichtigtAt: true, autoMarkedRemovedAt: true },
    }) : [],
    // wirksamAb/benachrichtigtAt mitlesen: dieselbe Zeile beantwortet Text UND Sichtbarkeit — sonst
    // fragte der Listen-Pfad diese Tabelle zweimal (einmal hier, einmal über hiddenRefKeys).
    lockIds.length ? prisma.verschlussAnforderung.findMany({ where: { id: { in: lockIds }, userId: subjectUserId }, select: { id: true, userId: true, nachricht: true, wirksamAb: true, benachrichtigtAt: true } }) : [],
    orgasmIds.length ? prisma.orgasmusAnforderung.findMany({ where: { id: { in: orgasmIds }, userId: subjectUserId }, select: { id: true, userId: true, nachricht: true } }) : [],
    // Die BESCHREIBUNG, nicht der Titel: sie ist der Freitext der Keyholderin — die eigentliche
    // Anweisung („die Wohnung, nicht nur das Wohnzimmer"). Sie stand im Posteingang bisher gar
    // nicht, und ohne sie ist eine Aufgabe dort nicht nachlesbar, sondern nur benannt.
    taskIds.length ? prisma.task.findMany({ where: { id: { in: taskIds }, userId: subjectUserId }, select: { id: true, userId: true, description: true } }) : [],
  ]);

  const now = new Date();
  const details = new Map<string, RefDetail>();
  for (const o of judgments) details.set(refKey(o.userId, "offense", o.id), { text: o.reason, actionCode: null, hidden: !judgmentMessageStillApplies(o) });
  // Über JEDE gemeldete Referenz, nicht nur über die gefundenen Urteile: ein noch unbeurteiltes
  // Vergehen hat kein `StrafeRecord`, und das ist der Normalfall, keine kaputte Referenz — ohne
  // diese Zeile stünde jede frisch gemeldete Zeile als „nicht auflösbar" im Posteingang.
  //
  // Die FESTSTELLUNG ist NIE verborgen, anders als die „Strafe verhängt"-Nachricht: diese Zeile sagt
  // „ein Vergehen wurde festgestellt", und das bleibt wahr, egal was daraus wird. Sie zu verbergen,
  // sobald das Urteil verworfen wird, wäre genau das lautlose Verschwinden, gegen das die Meldung
  // gebaut ist.
  //
  // Die VERWERFUNG dagegen gilt nur, solange das Urteil DISMISSED ist — deshalb ihr eigener
  // Schlüssel auf derselben Referenz (`dismissedOffense:<refId>`, siehe `keyOf`). Beide Zeilen holen
  // ihren Freitext aus demselben Urteil.
  const judgmentByRef = judgmentsByRef(judgments);
  for (const d of detected) {
    const judgment = judgmentByRef.get(refKey(d.subjectUserId, "detectedOffense", d.refId));
    const text = judgment?.reason ?? null;
    details.set(refKey(d.subjectUserId, "detectedOffense", d.refId), { text, actionCode: null, hidden: false });
    details.set(refKey(d.subjectUserId, DISMISSED_OFFENSE_KEY, d.refId), {
      text, actionCode: null, hidden: !dismissalMessageStillApplies(judgment),
    });
  }
  for (const c of controls) {
    // Ein Ziel gibt es NUR bei der offenen Kontrolle — dort steht eine Handlung an. Erfüllt,
    // abgelaufen, zurückgezogen oder noch nicht ausgelöst: kein Ziel, das etwas beiträgt. Der
    // Zustand kommt aus `mapAnforderungStatus` statt aus einer zweiten Handableitung.
    const open = mapAnforderungStatus(c, null, now) === "open";
    details.set(refKey(c.userId, "control", c.id), {
      text: c.kommentar,
      actionCode: open ? c.code : null,
      actionCategoryId: open ? c.categoryId : null,
      hidden: isHiddenFromSub(c),
    });
  }
  for (const l of lockRequests) details.set(refKey(l.userId, "lockRequest", l.id), { text: l.nachricht, actionCode: null, hidden: isHiddenFromSub(l) });
  for (const d of orgasmDirectives) details.set(refKey(d.userId, "orgasmDirective", d.id), { text: d.nachricht, actionCode: null, hidden: false });
  // `hidden: false`: eine Aufgabe kennt keine Terminierung — sie gilt ab dem Stellen, es gibt keinen
  // Überraschungs-Zeitpunkt zu schützen (siehe `delayedTrigger.ts`, das nur Kontrolle und Verschluss
  // betrifft).
  for (const t of tasks) details.set(refKey(t.userId, "task", t.id), { text: t.description, actionCode: null, hidden: false });
  return details;
}

/**
 * Nachrichten des Subs, absteigend nach Zeit, ohne die verborgenen.
 *
 * Der Filter steht bewusst hier und nicht in der Anzeige: eine Nachricht zu einer terminierten, noch
 * nicht ausgelösten Direktive verriete genau die Überraschung, die der Sinn der Terminierung ist —
 * und sie zu rendern und dann auszublenden hiesse, sie schon ausgeliefert zu haben.
 */
export interface MessagePage {
  messages: InboxMessage[];
  /** 1-basiert. Liegt die angefragte Seite hinter dem Ende, wird auf die letzte geklemmt. */
  page: number;
  pageCount: number;
}

/**
 * Die Where-Klausel einer Posteingangs-Sicht — geteilt von Zählung und Seitenabfrage, damit „Seite 3
 * von 7" und die Zeilen darauf denselben Filter meinen.
 *
 * Kategorie über die `bodyKey`s: die Zuordnung bleibt eine Anzeige-Entscheidung
 * (`messageCategories.ts`), gefiltert wird über die Schlüssel, die dazu gehören. „system" ist dabei
 * der Auffang-Topf und braucht die Umkehrung — sonst fielen die Freitext-Nachrichten (`bodyKey`
 * null) aus jedem Filter heraus. `OR` statt `notIn` allein, weil SQL für `NULL NOT IN (…)` „unknown"
 * liefert und die Zeile damit ausschlösse.
 */
function messageWhere(scope: InboxScope, filter: MessageFilter = {}): Prisma.MessageWhereInput {
  return {
    subjectUserId: subjectFilter(scope),
    audience: scope.audience,
    // Gegen den LESER, nicht gegen den Träger: dieselbe Keyholder-Zeile ist für den einen gelesen
    // und für den anderen nicht.
    ...(filter.unreadOnly ? { reads: { none: { userId: scope.readerId } } } : {}),
    ...(filter.senderKind ? { senderKind: filter.senderKind } : {}),
    ...(filter.category
      ? filter.category === "system"
        ? { OR: [{ bodyKey: null }, { bodyKey: { notIn: bodyKeysOutsideSystem() } }] }
        : { bodyKey: { in: bodyKeysOfCategory(filter.category) } }
      : {}),
  };
}

/**
 * Eine SEITE des Posteingangs, absteigend nach Zeit, ohne die verborgenen.
 *
 * Der Sichtbarkeits-Filter steht bewusst hier und nicht in der Anzeige: eine Nachricht zu einer
 * terminierten, noch nicht ausgelösten Direktive verriete genau die Überraschung, die der Sinn der
 * Terminierung ist — und sie zu rendern und dann auszublenden hiesse, sie schon ausgeliefert zu
 * haben.
 *
 * BEKANNTE UNSCHÄRFE: Die Seitenzahl zählt in der DATENBANK, der Sichtbarkeits-Filter greift erst
 * auf der geladenen Seite. Eine verborgene Nachricht zählt also mit, ohne zu erscheinen — eine Seite
 * kann kürzer sein als `MESSAGE_PAGE_SIZE`, und bei aktivem Ungelesen-Filter kann `pageCount` eine
 * etwas andere Menge meinen als die Zahl in der Glocke daneben (die kommt aus
 * `visibleUnreadRows`, das die Sichtbarkeit auflöst).
 *
 * Bewusst so, aber NICHT weil das Auflösen zu teuer wäre — `visibleUnreadRows` tut genau das auf
 * jeder Dashboard-Seite. Der genaue Weg hiesse, die Sichtbarkeit für ALLE Nachrichten des Nutzers
 * aufzulösen (nicht nur die ungelesenen), also den ganzen Posteingang zu laden, statt eine
 * indizierte Zählung zu fahren und 20 Zeilen zu holen. Verborgene Zeilen sind selten (terminierte
 * Direktiven, verworfene Urteile); dafür den Normalfall linear mit dem Posteingang wachsen zu
 * lassen, wäre der schlechtere Handel. Wird die Abweichung je störend, ist die Auflösung eine
 * gemeinsame `visibleMessageIds(userId, filter)` für Zähler, Liste und Seitenzahl.
 */
export async function listMessages(
  scope: InboxScope,
  opts: { page?: number; filter?: MessageFilter } = {},
): Promise<MessagePage> {
  // Leere Träger-Liste = garantiert leeres Ergebnis (die Zusicherung an `InboxScope`): gar nicht
  // erst fragen, statt SQLite ein `IN ()` zu schicken. Dieselbe Regel, die diese Datei bei den
  // Referenz-Abfragen schon anwendet.
  if (scope.subjectUserIds.length === 0) return { messages: [], page: 1, pageCount: 1 };
  const where = messageWhere(scope, opts.filter);
  const total = await prisma.message.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / MESSAGE_PAGE_SIZE));
  // Klemmen statt leer ausliefern: löscht der Nutzer die letzte Zeile von Seite 4, soll er Seite 4
  // sehen — nicht eine leere Seite hinter dem Ende.
  // Die ganze Klemmung an EINER Stelle, inklusive NaN (`|| 1` fängt sowohl NaN als auch 0): ein
  // zweiter Aufrufer soll die Regel nicht nachbauen müssen, um keine leere Seite zu bekommen.
  const page = Math.min(Math.max(Math.trunc(opts.page ?? 1) || 1, 1), pageCount);

  const rows = await prisma.message.findMany({
    where,
    // Zweites Sortierfeld: `createdAt` allein ist nicht eindeutig — zwei Nachrichten mit derselben
    // Sekunde an einer Seitengrenze erschienen sonst doppelt oder gar nicht.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * MESSAGE_PAGE_SIZE,
    take: MESSAGE_PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      senderKind: true,
      senderName: true,
      bodyKey: true,
      bodyParams: true,
      body: true,
      refEntityType: true,
      refEntityId: true,
      // Eine SPALTE mehr, keine Abfrage mehr: der Träger ist der Schlüssel, unter dem der Name aus
      // dem Scope nachgeschlagen wird (`InboxScope.subjectNames`).
      subjectUserId: true,
      reads: { where: { userId: scope.readerId }, select: { id: true } },
    },
  });

  // Eine Auflösung für beides: `refDetails` liefert Text, Ziel UND Sichtbarkeit. `hiddenRefKeys`
  // bleibt die schlanke Variante für den Zähler (Header-Pfad), der keinen Text braucht.
  const details = await refDetails(rows, scope);
  // Verbergen gilt für den TRÄGER, nicht für jeden Leser (siehe `hidesFromReader`) — der Keyholder
  // hat die terminierte Direktive selbst gestellt und bekommt seine Zeile in jedem Fall.
  const hides = hidesFromReader(scope);

  const messages: InboxMessage[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    const detail = key ? details.get(key) : undefined;
    if (hides && detail?.hidden) continue;
    messages.push({
      id: row.id,
      createdAt: row.createdAt,
      senderKind: row.senderKind as MessageSenderKind,
      senderName: row.senderName,
      bodyKey: row.bodyKey,
      bodyParams: parseParams(row.bodyParams),
      body: row.body,
      refText: detail?.text ?? null,
      refActionCode: detail?.actionCode ?? null,
      refActionCategoryId: detail?.actionCategoryId ?? null,
      refMissing: key !== null && detail === undefined,
      subjectUsername: scope.subjectNames?.get(row.subjectUserId) ?? null,
      read: row.reads.length > 0,
    });
  }
  return { messages, page, pageCount };
}

/**
 * Die ungelesenen Nachrichten, die der Sub SEHEN darf — die eine Stelle, an der die
 * Sichtbarkeitsregel für den Ungelesen-Zustand steht.
 *
 * Geteilt von {@link unreadCount} und {@link markAllRead}: quittierte „Alle als gelesen" auch die
 * verborgenen, käme die Nachricht einer terminierten Direktive beim Auslösen bereits gelesen an —
 * ohne Punkt, ohne Fettschrift, ohne Badge. Genau der Fall, für den es den Posteingang gibt.
 *
 * `alsoVisible` zählt genannte Nachrichten mit, auch wenn ihre Direktive gerade noch als verborgen
 * gilt. Gebraucht beim Auslösen durch den Poller: der stempelt `benachrichtigtAt` erst NACH dem
 * Versand (damit ein Fehlschlag erneut versucht wird), sodass die eben zugestellte Nachricht für
 * Millisekunden noch unter den Verborgenen läge und das Badge um eins zu tief stünde.
 */
async function visibleUnreadRows(
  scope: InboxScope,
  alsoVisible: (string | null)[] = [],
): Promise<{ id: string }[]> {
  // Leere Träger-Liste = garantiert leeres Ergebnis (siehe `InboxScope`).
  if (scope.subjectUserIds.length === 0) return [];
  const rows = await prisma.message.findMany({
    // Über `messageWhere`, nicht von Hand: Zähler und Liste müssen denselben Ausschnitt meinen. Eine
    // zweite Abbildung Scope → Where liefe beim nächsten Filter-Feld lautlos auseinander.
    where: messageWhere(scope, { unreadOnly: true }),
    // Nur, was über die Sichtbarkeit entscheidet — kein Text, kein Zeitstempel: dieser Pfad läuft
    // im Header auf JEDER Dashboard-Seite. `bodyKey` ist Teil davon, seit die Verwerfungs-Meldung
    // anders verschwindet als die Feststellung auf derselben Referenz; `subjectUserId`, seit der
    // Referenz-Schlüssel den Träger trägt (siehe `refKey`).
    select: { id: true, subjectUserId: true, bodyKey: true, refEntityType: true, refEntityId: true },
  });
  if (rows.length === 0) return [];

  // Kein Sonderfall für den Keyholder: `hiddenRefKeys` liefert für ihn eine leere Menge, der Filter
  // läuft durch und gibt alles zurück. Die Regel steht an EINER Stelle, nicht an jeder Abzweigung.
  const forced = new Set(alsoVisible.filter((id): id is string => Boolean(id)));
  const hidden = await hiddenRefKeys(rows, scope);
  return rows.filter((row) => {
    if (forced.has(row.id)) return true;
    const key = keyOf(row);
    return !(key && hidden.has(key));
  });
}

/**
 * Ungelesene Nachrichten. Zählt NUR Nachrichten — nicht offene Pflichten: beides in eine Zahl zu
 * mischen machte sie wertlos, sie stünde auf 0, während eine Kontrolle läuft.
 *
 * Immer frisch — für JEDEN Aufruf NACH einem Schreibvorgang der richtige Weg.
 */
export async function unreadCount(scope: InboxScope, alsoCount: (string | null)[] = []): Promise<number> {
  // Leere Träger-Liste = garantiert leeres Ergebnis (siehe `InboxScope`).
  if (scope.subjectUserIds.length === 0) return 0;
  // Wo nichts zu verbergen ist, ist der Zähler eine ZÄHLUNG: `count` beantwortet sie aus dem
  // deckenden Index, statt jede ungelesene Zeile samt Sichtbarkeits-Spalten zu materialisieren und
  // davon nur `.length` zu nehmen. `alsoCount` braucht dieser Zweig nicht — es holt ausschliesslich
  // Zeilen zurück, die der Verbergen-Filter entfernt hätte, und der läuft hier gar nicht.
  if (!hidesFromReader(scope)) {
    return prisma.message.count({ where: messageWhere(scope, { unreadOnly: true }) });
  }
  return (await visibleUnreadRows(scope, alsoCount)).length;
}

/**
 * Derselbe Zähler, aber pro Request memoisiert — für das RENDERN.
 *
 * Der Header steht im Dashboard- UND im Admin-Layout und fragt den Wert auf jeder Seite; ruft die
 * Seite selbst ihn auch (Posteingang), liefe er im selben Request zweimal. Bewusst NICHT für Aufrufe
 * nach einem Schreibvorgang: dort wäre die Memoisierung genau falsch und lieferte den Stand von
 * vorher.
 *
 * Eine BENANNTE Funktion und nicht `cache(unreadCount)` mit einem Scope-Argument: `cache()` schlägt
 * über die IDENTITÄT der Argumente nach — ein frisch gebauter Scope träfe nie denselben Eintrag und
 * die Memoisierung liefe ins Leere. Deshalb nimmt diese Fassung die primitive Id und baut den Scope
 * selbst.
 */
export const unreadCountCached = cache(
  (subjectUserId: string): Promise<number> => unreadCount(subInbox(subjectUserId)),
);

/**
 * Schreibt die Nachricht und liefert den Badge-Wert dazu — der gebündelte Auftakt der drei
 * „reichen" Melde-Pfade (Kontroll-, Verschluss-, Orgasmus-Anforderung), die ihre mehrzeiligen Mails
 * selbst bauen und deshalb bewusst NICHT über `notifyUser` laufen.
 *
 * Gebündelt, weil die Reihenfolge ein stiller Vertrag ist: erst schreiben, dann zählen — und zwar
 * MIT der eben geschriebenen id (siehe `visibleUnreadRows`). Wer das beim vierten Pfad umdreht,
 * bekommt ein um eins zu tiefes Badge und keinen Fehler.
 *
 * Wirft NIE: der Zähler ist Beiwerk am Push, die Meldung selbst ist es nicht — ein Lesefehler auf
 * der Nachrichten-Tabelle darf nicht den Versand einer Kontroll-Frist verschlucken. `undefined`
 * heisst „keine Zahl mitsenden", und das lässt ein bestehendes Badge unangetastet.
 *
 * Nur für den SUB-Kanal — und `audience` ist deshalb aus dem Parameter-Typ AUSGESCHLOSSEN statt bloss
 * unerwähnt: der Zähler unten ist der des `subjectUserId`, für eine Keyholder-Zeile wäre er der
 * Stand des jeweiligen LESERS und bräuchte dessen Sub-Liste. Ein Aufrufer kann das damit nicht
 * falsch machen; die Keyholder-Zeile schreibt `notifyControllers` direkt über
 * {@link recordSystemMessage} — bewusst ohne Badge, aus genau diesem Grund.
 */
export async function recordMessageAndBadge(p: Omit<RecordMessageParams, "audience">): Promise<number | undefined> {
  const messageId = await recordSystemMessage(p);
  try {
    return await unreadCount(subInbox(p.subjectUserId), [messageId]);
  } catch (err) {
    console.error("[messages] badge count failed", err);
    return undefined;
  }
}

/**
 * Markiert EINE Nachricht als gelesen. Gelesen wird nur durch das Öffnen der einzelnen Nachricht —
 * nicht durch das Öffnen der Liste, nicht durch den Push-Tap: ein Teil dieser Nachrichten löst
 * Pflichten mit Fristen aus, „gelesen" ist damit eine Behauptung mit Konsequenz.
 *
 * Der SCOPE ist Pflichtparameter und Teil der Suche (nie `findUnique({ where: { id } })`), sonst
 * quittiert eine geratene ID die Nachricht eines fremden Nutzers — bzw. beim Keyholder die eines
 * Trägers, den er gar nicht kontrolliert.
 */
export async function setRead(scope: InboxScope, messageId: string, read: boolean): Promise<boolean> {
  // `audience` mitgeprüft, aus demselben Grund wie beim Löschen: es gibt Zeilen zum selben Sub, die
  // nicht ihm gehören (die seiner Keyholder) — und umgekehrt.
  const message = await prisma.message.findFirst({
    where: { id: messageId, subjectUserId: subjectFilter(scope), audience: scope.audience },
    select: { id: true },
  });
  if (!message) return false;
  // KANONISCH: Das Kennzeichen trägt den LESER (`MessageRead.userId`), nicht den Träger. Quittiert
  // ein Keyholder, bleibt die geteilte Zeile für die anderen ungelesen — und genau deshalb kommt
  // der Keyholder-Kanal ohne eine Zeile je Empfänger aus. Jede andere Stelle, die das erwähnt,
  // zeigt hierher, statt die Begründung zu wiederholen.
  if (read) {
    await markRowsRead(scope.readerId, [messageId]);
  } else {
    await prisma.messageRead.deleteMany({ where: { messageId, userId: scope.readerId } });
  }
  return true;
}

/**
 * Grenzt eine Id-Liste auf die Zeilen des Scopes ein — die Vorstufe jedes Mengen-Vorgangs.
 *
 * `audience` und `subjectUserId` stehen in JEDER Where-Klausel: eine fremde id in der Liste trifft
 * damit nichts, statt den Aufruf scheitern zu lassen. Der Aufrufer erfährt über die Zahl der
 * getroffenen Zeilen, ob seine Auswahl noch aktuell war, ohne dass eine veraltete Zeile den ganzen
 * Vorgang kippt.
 *
 * Nötig, weil `messageRead` keine `subjectUserId` kennt: ein `upsert` auf rohe Ids setzte sonst
 * Lese-Kennzeichen auf fremden Zeilen.
 */
async function scopedMessageIds(scope: InboxScope, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.message.findMany({
    where: { id: { in: ids }, subjectUserId: subjectFilter(scope), audience: scope.audience },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Löscht Nachrichten aus dem Posteingang.
 *
 * Nur die Posteingangs-Zeile: das Bezugsobjekt (StrafeRecord, KontrollAnforderung, …) bleibt
 * unberührt — eine Nachricht ist die Zustellung, nicht der Vorgang. `MessageRead` hängt am
 * `onDelete: Cascade` und geht mit.
 *
 * Der Scope ist Teil der SUCHE, nicht nur des Aufrufs: eine geratene Id findet damit nichts, statt
 * die Nachricht eines fremden Nutzers zu löschen.
 *
 * KANONISCH — ACHTUNG bei `audience: "keyholders"`: dort gibt es EINE Zeile je Sub für ALLE seine
 * Keyholder, wer löscht, löscht sie für die anderen mit. Das ist die bewusste Kehrseite der
 * geteilten Zeile (ein Gelesen-Stand je Leser, aber nur ein Datensatz). Wer das nicht will, blendet
 * in der Anzeige aus, statt zu löschen; ein „nur für mich löschen" bräuchte eine eigene Spalte.
 * Andere Stellen zeigen auf diesen Absatz, statt ihn zu wiederholen.
 */
export async function deleteMessages(scope: InboxScope, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.message.deleteMany({
    where: { id: { in: ids }, subjectUserId: subjectFilter(scope), audience: scope.audience },
  });
  return count;
}

/**
 * Wie viele Lese-Kennzeichen HÖCHSTENS in einer Transaktion stehen — und wie viele ungelesene Zeilen
 * {@link markAllRead} am Stück holt.
 *
 * Der SQLite-Connector fährt mit `connection_limit=1`: eine laufende Schreib-Transaktion hält JEDE
 * andere Anfrage der Instanz an. Bei einer Handvoll Ids ist das unmerklich, bei Tausenden — ein
 * globaler Admin drückt nach Monaten „alle als gelesen" — wäre es eine Pause für die ganze App.
 * Deshalb in Blöcken: dieselbe Arbeit, aber jede Transaktion ist kurz und lässt andere Anfragen
 * dazwischen.
 */
const MESSAGE_READ_CHUNK = 200;

/**
 * Setzt Lese-Kennzeichen für mehrere Nachrichten.
 *
 * EINE Transaktion je Block statt einer je Id: der SQLite-Connector fährt mit `connection_limit=1`,
 * ein `Promise.all` über einzelne `upsert` erzeugt also nur den ANSCHEIN von Nebenläufigkeit —
 * tatsächlich waren es bei 100 Ids 100 eigene Schreib-Transaktionen mit 100 Commits. Die Blockgrösse
 * begrenzt die Gegenrichtung: EINE Transaktion über alles hielte die einzige Verbindung beliebig
 * lange (siehe {@link MESSAGE_READ_CHUNK}).
 *
 * Einzelne `upsert` statt `createMany`: liest der Nutzer im zweiten Tab eine der Zeilen, liefe
 * `createMany` in den Unique-Index und der ganze Aufruf schlüge fehl, obwohl der Zustand danach der
 * gewünschte wäre. (SQLite kennt kein `skipDuplicates` — Prisma 5 bietet die Option dort gar nicht
 * erst an.)
 */
async function markRowsRead(readerId: string, messageIds: string[]): Promise<void> {
  for (let i = 0; i < messageIds.length; i += MESSAGE_READ_CHUNK) {
    const chunk = messageIds.slice(i, i + MESSAGE_READ_CHUNK);
    await prisma.$transaction(
      chunk.map((messageId) =>
        prisma.messageRead.upsert({
          where: { messageId_userId: { messageId, userId: readerId } },
          create: { messageId, userId: readerId },
          update: {},
        }),
      ),
    );
  }
}

/** Mehrere auf einmal; liefert die Zahl der wirklich getroffenen Zeilen ({@link scopedMessageIds}). */
export async function setReadMany(scope: InboxScope, ids: string[], read: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  if (!read) {
    // Der Scope steht in der Where-Klausel statt in einer Vorabfrage — `messageRead` kennt keine
    // `subjectUserId`, also führt der Weg über die Nachricht.
    const { count } = await prisma.messageRead.deleteMany({
      where: {
        userId: scope.readerId,
        messageId: { in: ids },
        message: { subjectUserId: subjectFilter(scope), audience: scope.audience },
      },
    });
    return count;
  }
  const own = await scopedMessageIds(scope, ids);
  await markRowsRead(scope.readerId, own);
  return own.length;
}

/**
 * Höchstens so viele Blöcke je Aufruf — die Obergrenze der Arbeit, die EIN Klick auslösen darf
 * ({@link MESSAGE_READ_CHUNK} × dies). Wird sie erreicht, liefert der Aufruf einen Rest-Stand > 0
 * zurück statt 0; ein zweiter Klick macht weiter. Ein Posteingang dieser Grösse ist ohnehin ein
 * Ausnahmefall — eine ehrliche Restzahl ist dort der bessere Ausgang als eine Anfrage, die minutenlang
 * die einzige DB-Verbindung hält.
 */
const MARK_ALL_MAX_CHUNKS = 50;

/**
 * Alle SICHTBAREN als gelesen — bewusste Handlung mit Rückfrage in der Oberfläche, nie ein
 * Nebeneffekt. Liefert den neuen Ungelesen-Stand (0, solange nichts Verborgenes wartet).
 *
 * ZWEI Wege, aus demselben Grund wie beim Zähler ({@link unreadCount}): wo nichts zu verbergen ist
 * (Keyholder), muss auch nichts aufgelöst werden — dann läuft die Arbeit blockweise über die
 * indizierte Ungelesen-Abfrage, statt jede Zeile des Posteingangs erst in den Speicher zu holen.
 * Beim TRÄGER bleibt es bei {@link visibleUnreadRows}: dort entscheidet die Sichtbarkeit mit, und ein
 * blockweiser Lauf käme an den verborgenen Zeilen nie vorbei — sie bleiben ungelesen und stünden im
 * nächsten Block wieder da.
 */
export async function markAllRead(scope: InboxScope): Promise<number> {
  // Leere Träger-Liste = garantiert leeres Ergebnis (siehe `InboxScope`).
  if (scope.subjectUserIds.length === 0) return 0;

  if (!hidesFromReader(scope)) {
    const where = messageWhere(scope, { unreadOnly: true });
    for (let block = 0; block < MARK_ALL_MAX_CHUNKS; block++) {
      // Nur die Ids, nur ein Block: die quittierten Zeilen fallen aus DIESER Bedingung heraus, der
      // nächste Durchlauf holt also den nächsten Block statt derselben Zeilen noch einmal.
      const rows = await prisma.message.findMany({ where, select: { id: true }, take: MESSAGE_READ_CHUNK });
      if (rows.length === 0) break;
      await markRowsRead(scope.readerId, rows.map((m) => m.id));
      if (rows.length < MESSAGE_READ_CHUNK) break;
    }
    return unreadCount(scope);
  }

  const unread = await visibleUnreadRows(scope);
  if (unread.length === 0) return 0;
  await markRowsRead(scope.readerId, unread.map((m) => m.id));
  // Frisch gezählt statt hart 0: sichtbare Nachrichten sind jetzt quittiert, aber der Zähler ist
  // die einzige ehrliche Quelle dafür — verborgene Zeilen bleiben stehen.
  return unreadCount(scope);
}

/** Löscht EINE Zeile; `false`, wenn sie nicht im Scope liegt (geratene Id, fremder Träger). Nur die
 *  Zustellung, nie das Bezugsobjekt — siehe {@link deleteMessages}. */
export async function deleteMessage(scope: InboxScope, messageId: string): Promise<boolean> {
  return (await deleteMessages(scope, [messageId])) > 0;
}

/**
 * Der Keyholder-Zähler, pro Request memoisiert — für das RENDERN (Kopfzeile in BEIDEN Bereichen,
 * dazu die Seite selbst).
 *
 * Die Sub-Liste löst diese Fassung SELBST auf, statt einen fertigen Scope entgegenzunehmen: `cache()`
 * schlägt über die Identität der Argumente nach, ein frisch gebautes Objekt träfe also nie denselben
 * Eintrag und die Memoisierung liefe ins Leere. Mit `(readerId, role)` greift sie — und
 * `getControllableSubsCached` hält die Zuordnung selbst nur einmal, geteilt mit dem Seiten-Guard
 * `assertController()`.
 *
 * Bewusst NICHT für Aufrufe nach einem Schreibvorgang — dieselbe Warnung wie bei
 * {@link unreadCountCached}.
 */
export const unreadCountForKeyholderCached = cache(
  async (readerId: string, role: string | undefined): Promise<number> =>
    unreadCount(keyholderInbox(readerId, await getControllableSubsCached(readerId, role))),
);
