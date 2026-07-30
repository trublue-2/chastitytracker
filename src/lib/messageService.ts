import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isHiddenFromSub } from "@/lib/delayedTrigger";
import { mapAnforderungStatus } from "@/lib/utils";

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
  // Kontrolle
  "inspectionRequestedMessage",
  "inspectionConfirmedMessage",
  "inspectionRejectedMessage",
  "inspectionResolvedWithdrawnMessage",
  "inspectionReminderMessage",
  "inspectionReminderMessageNoCode",
  "inspectionAutoRemovedMessageSub",
  "inspectionAutoRemovedMessageSubNoCode",
  "inspectionAutoRemovedMessageKeyholder",
  "inspectionAutoRemovedMessageKeyholderNoCode",
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
  "taskChangedMessage",
  "taskWithdrawnMessage",
  "taskAwaitingMessage",
  "taskDoneMessage",
  "taskFailedMessage",
  "taskDoneMessageKeyholder",
  "taskFailedMessageKeyholder",
] as const;

export type MessageBodyKey = (typeof MESSAGE_BODY_KEYS)[number];

/** Objekt-Typen, auf die eine Nachricht zeigen kann. Namensschema wie `NoteRef.entityType`. */
export type MessageRefType = "offense" | "control" | "lockRequest" | "orgasmDirective";
export interface MessageRef {
  type: MessageRefType;
  id: string;
}

/** Wer getippt hat. Zwei Achsen wie im Bestand (`StrafeRecord.judgedBy` / `KeyholderActionLog.source`):
 *  `kind` ist der Absender, nicht die Autorität. */
export type MessageSenderKind = "system" | "keyholder" | "ai";

/**
 * Autoritäts-Achse (`StrafeRecord.judgedBy`, `KeyholderActionLog.source`) → Absender-Achse.
 * Hier statt am Aufrufer, weil Etappe 2/3 dieselbe Abbildung für den Action-Log braucht — und weil
 * die App die KI nicht verheimlicht: dass sie geurteilt hat, steht an der Nachricht.
 */
export function senderKindOf(judgedBy: string | null | undefined): MessageSenderKind {
  return judgedBy === "ai" ? "ai" : judgedBy === "admin" ? "keyholder" : "system";
}

export interface RecordMessageParams {
  subjectUserId: string;
  bodyKey: MessageBodyKey;
  params?: Record<string, string | number>;
  senderKind?: MessageSenderKind;
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
 * Schreibt eine Maschinen-Nachricht (i18n-Schlüssel + Parameter). Die einzige Factory dieser Etappe
 * — sie ist der Grund, warum `body` und `bodyKey` sich nicht gegenseitig überschreiben können: es
 * gibt keinen Aufrufer, der beides setzen könnte (SQLite kennt den Constraint nicht).
 *
 * Fire-and-forget-tauglich: wirft nicht. Eine fehlgeschlagene Nachricht darf die auslösende
 * Direktive nicht mitreissen. Liefert die id der Nachricht (null, wenn das Schreiben scheiterte) —
 * gebraucht für `unreadCountFor({ alsoCount })`.
 */
export async function recordSystemMessage(p: RecordMessageParams): Promise<string | null> {
  try {
    if (p.once && p.ref) {
      const existing = await prisma.message.findFirst({
        where: {
          subjectUserId: p.subjectUserId,
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
        senderKind: p.senderKind ?? "system",
        audience: "sub",
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
  bodyKey: string | null;
  bodyParams: Record<string, string | number> | null;
  body: string | null;
  /** Freitext des Bezugsobjekts (Straftext, Kommentar, Anforderungs-Nachricht) — frisch gelesen. */
  refText: string | null;
  /** Code der offenen Kontrolle, falls die Nachricht auf eine zeigt — der Presenter macht daraus
   *  das Ziel. Sonst null: es gibt keine Seite, die etwas beiträgt. */
  refActionCode: string | null;
  /** Referenz gesetzt, Objekt aber nicht (mehr) auflösbar. Muster: `unknownRef` in lib/mcp/notes.ts. */
  refMissing: boolean;
  read: boolean;
}

const MAX_PAGE_SIZE = 50;

function parseParams(raw: string | null): Record<string, string | number> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string | number>) : null;
  } catch {
    return null;
  }
}

/** Das Minimum, um über die Sichtbarkeit einer Nachricht zu entscheiden. */
type RefRow = { id: string; refEntityType: string | null; refEntityId: string | null };

const refKey = (type: string, id: string) => `${type}:${id}`;

/** Die Referenz-Ids eines Nachrichten-Stapels je Objekt-Typ. */
function idsOfType(rows: RefRow[], type: MessageRefType): string[] {
  return rows.filter((r) => r.refEntityType === type && r.refEntityId).map((r) => r.refEntityId!);
}

function keyOf(row: RefRow): string | null {
  return row.refEntityType && row.refEntityId ? refKey(row.refEntityType, row.refEntityId) : null;
}

/**
 * Die Referenz-Schlüssel, die für den Sub VERBORGEN sind.
 *
 * Nur `KontrollAnforderung` und `VerschlussAnforderung` tragen überhaupt das `{wirksamAb,
 * benachrichtigtAt}`-Paar (siehe delayedTrigger.ts) — Strafen und Orgasmus-Anweisungen können nicht
 * terminiert sein und sind deshalb nie verborgen. Genau deshalb fragt diese Funktion zwei Tabellen
 * und nicht vier: sie ist der heisse Pfad (Header, jede Dashboard-Seite).
 *
 * Immer auf den Sub eingegrenzt — eine Referenz auf die Zeile eines anderen Nutzers findet nichts,
 * statt sie preiszugeben.
 */
async function hiddenRefKeys(rows: RefRow[], subjectUserId: string): Promise<Set<string>> {
  const controlIds = idsOfType(rows, "control");
  const lockRequestIds = idsOfType(rows, "lockRequest");

  const scoped = { wirksamAb: true, benachrichtigtAt: true, id: true } as const;
  const [controls, lockRequests] = await Promise.all([
    // Leere `in`-Liste = garantiert leeres Ergebnis: die Abfrage gar nicht erst stellen.
    controlIds.length
      ? prisma.kontrollAnforderung.findMany({ where: { id: { in: controlIds }, userId: subjectUserId }, select: scoped })
      : [],
    lockRequestIds.length
      ? prisma.verschlussAnforderung.findMany({ where: { id: { in: lockRequestIds }, userId: subjectUserId }, select: scoped })
      : [],
  ]);

  const hidden = new Set<string>();
  for (const c of controls) if (isHiddenFromSub(c)) hidden.add(refKey("control", c.id));
  for (const l of lockRequests) if (isHiddenFromSub(l)) hidden.add(refKey("lockRequest", l.id));
  return hidden;
}

/** Was ein Bezugsobjekt für die Anzeige beiträgt: sein Freitext und — falls es eine Seite gibt, die
 *  etwas dazu sagt — das Ziel dorthin. */
type RefDetail = {
  text: string | null;
  /** Code der offenen Kontrolle — daraus baut der Presenter das Ziel. Der Service kennt keine
   *  Router-Pfade: `category` und Link sitzen dann beide in der Anzeige-Schicht. */
  actionCode: string | null;
  /** Für den Sub verborgen (terminierte, noch nicht ausgelöste Direktive). */
  hidden: boolean;
};

/** Freitext + Link-Ziel je Referenz — nur für die ANZEIGE, deshalb getrennt von {@link hiddenRefKeys}:
 *  der Zähler braucht keinen einzigen dieser Texte. */
async function refDetails(rows: RefRow[], subjectUserId: string): Promise<Map<string, RefDetail>> {
  const [offenseIds, controlIds, lockIds, orgasmIds] =
    (["offense", "control", "lockRequest", "orgasmDirective"] as const).map((t) => idsOfType(rows, t));

  const [offenses, controls, lockRequests, orgasmDirectives] = await Promise.all([
    offenseIds.length ? prisma.strafeRecord.findMany({ where: { id: { in: offenseIds }, userId: subjectUserId }, select: { id: true, reason: true } }) : [],
    // Mehr als der Kommentar: aus Code + Zustand entsteht das Link-Ziel (siehe unten).
    controlIds.length ? prisma.kontrollAnforderung.findMany({
      where: { id: { in: controlIds }, userId: subjectUserId },
      select: { id: true, kommentar: true, code: true, entryId: true, withdrawnAt: true, deadline: true, wirksamAb: true, benachrichtigtAt: true, autoMarkedRemovedAt: true },
    }) : [],
    // wirksamAb/benachrichtigtAt mitlesen: dieselbe Zeile beantwortet Text UND Sichtbarkeit — sonst
    // fragte der Listen-Pfad diese Tabelle zweimal (einmal hier, einmal über hiddenRefKeys).
    lockIds.length ? prisma.verschlussAnforderung.findMany({ where: { id: { in: lockIds }, userId: subjectUserId }, select: { id: true, nachricht: true, wirksamAb: true, benachrichtigtAt: true } }) : [],
    orgasmIds.length ? prisma.orgasmusAnforderung.findMany({ where: { id: { in: orgasmIds }, userId: subjectUserId }, select: { id: true, nachricht: true } }) : [],
  ]);

  const now = new Date();
  const details = new Map<string, RefDetail>();
  for (const o of offenses) details.set(refKey("offense", o.id), { text: o.reason, actionCode: null, hidden: false });
  for (const c of controls) {
    // Ein Ziel gibt es NUR bei der offenen Kontrolle — dort steht eine Handlung an. Erfüllt,
    // abgelaufen, zurückgezogen oder noch nicht ausgelöst: kein Ziel, das etwas beiträgt. Der
    // Zustand kommt aus `mapAnforderungStatus` statt aus einer zweiten Handableitung.
    const open = mapAnforderungStatus(c, null, now) === "open";
    details.set(refKey("control", c.id), {
      text: c.kommentar,
      actionCode: open ? c.code : null,
      hidden: isHiddenFromSub(c),
    });
  }
  for (const l of lockRequests) details.set(refKey("lockRequest", l.id), { text: l.nachricht, actionCode: null, hidden: isHiddenFromSub(l) });
  for (const d of orgasmDirectives) details.set(refKey("orgasmDirective", d.id), { text: d.nachricht, actionCode: null, hidden: false });
  return details;
}

/**
 * Nachrichten des Subs, absteigend nach Zeit, ohne die verborgenen.
 *
 * Der Filter steht bewusst hier und nicht in der Anzeige: eine Nachricht zu einer terminierten, noch
 * nicht ausgelösten Direktive verriete genau die Überraschung, die der Sinn der Terminierung ist —
 * und sie zu rendern und dann auszublenden hiesse, sie schon ausgeliefert zu haben.
 */
export async function listMessagesFor(
  subjectUserId: string,
  opts: { take?: number; cursor?: string } = {},
): Promise<{ messages: InboxMessage[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(opts.take ?? MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const rows = await prisma.message.findMany({
    where: { subjectUserId, audience: "sub" },
    // Zweites Sortierfeld: `createdAt` allein ist nicht eindeutig, und der Cursor ist die id —
    // zwei Nachrichten mit derselben Sekunde an einer Seitengrenze würden sonst doppelt oder gar
    // nicht ausgeliefert.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // Eins mehr als angefragt: nur so ist "gibt es noch weitere?" beantwortbar, ohne separat zu zählen.
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      senderKind: true,
      bodyKey: true,
      bodyParams: true,
      body: true,
      refEntityType: true,
      refEntityId: true,
      reads: { where: { userId: subjectUserId }, select: { id: true } },
    },
  });

  const page = rows.slice(0, take);
  const nextCursor = rows.length > take ? page[page.length - 1].id : null;
  // Eine Auflösung für beides: `refDetails` liefert Text, Ziel UND Sichtbarkeit. `hiddenRefKeys`
  // bleibt die schlanke Variante für den Zähler (Header-Pfad), der keinen Text braucht.
  const details = await refDetails(page, subjectUserId);

  const messages: InboxMessage[] = [];
  for (const row of page) {
    const key = keyOf(row);
    if (key && details.get(key)?.hidden) continue;
    messages.push({
      id: row.id,
      createdAt: row.createdAt,
      senderKind: row.senderKind as MessageSenderKind,
      bodyKey: row.bodyKey,
      bodyParams: parseParams(row.bodyParams),
      body: row.body,
      refText: key ? details.get(key)?.text ?? null : null,
      refActionCode: key ? details.get(key)?.actionCode ?? null : null,
      refMissing: key !== null && !details.has(key),
      read: row.reads.length > 0,
    });
  }
  return { messages, nextCursor };
}

/**
 * Die ungelesenen Nachrichten, die der Sub SEHEN darf — die eine Stelle, an der die
 * Sichtbarkeitsregel für den Ungelesen-Zustand steht.
 *
 * Geteilt von {@link unreadCountFor} und {@link markAllRead}: quittierte „Alle als gelesen" auch die
 * verborgenen, käme die Nachricht einer terminierten Direktive beim Auslösen bereits gelesen an —
 * ohne Punkt, ohne Fettschrift, ohne Badge. Genau der Fall, für den es den Posteingang gibt.
 *
 * `alsoVisible` zählt genannte Nachrichten mit, auch wenn ihre Direktive gerade noch als verborgen
 * gilt. Gebraucht beim Auslösen durch den Poller: der stempelt `benachrichtigtAt` erst NACH dem
 * Versand (damit ein Fehlschlag erneut versucht wird), sodass die eben zugestellte Nachricht für
 * Millisekunden noch unter den Verborgenen läge und das Badge um eins zu tief stünde.
 */
async function visibleUnreadRows(
  subjectUserId: string,
  alsoVisible: (string | null)[] = [],
): Promise<{ id: string }[]> {
  const rows = await prisma.message.findMany({
    where: { subjectUserId, audience: "sub", reads: { none: { userId: subjectUserId } } },
    // Nur, was über die Sichtbarkeit entscheidet — kein Text, kein Zeitstempel: dieser Pfad läuft
    // im Header auf JEDER Dashboard-Seite.
    select: { id: true, refEntityType: true, refEntityId: true },
  });
  if (rows.length === 0) return [];

  const forced = new Set(alsoVisible.filter((id): id is string => Boolean(id)));
  const hidden = await hiddenRefKeys(rows, subjectUserId);
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
export async function unreadCountFor(
  subjectUserId: string,
  opts: { alsoCount?: (string | null)[] } = {},
): Promise<number> {
  return (await visibleUnreadRows(subjectUserId, opts.alsoCount)).length;
}

/**
 * Derselbe Zähler, aber pro Request memoisiert — für das RENDERN.
 *
 * Der Header steht im Dashboard-Layout und fragt den Wert auf jeder Seite; ruft die Seite selbst ihn
 * auch (Posteingang), liefe er im selben Request zweimal. Bewusst NICHT für Aufrufe nach einem
 * Schreibvorgang: dort wäre die Memoisierung genau falsch und lieferte den Stand von vorher.
 */
export const unreadCountCached = cache(
  (subjectUserId: string): Promise<number> => unreadCountFor(subjectUserId),
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
 */
export async function recordMessageAndBadge(p: RecordMessageParams): Promise<number | undefined> {
  const messageId = await recordSystemMessage(p);
  try {
    return await unreadCountFor(p.subjectUserId, { alsoCount: [messageId] });
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
 * `subjectUserId` ist Pflichtparameter und Teil der Suche (nie `findUnique({ where: { id } })`),
 * sonst quittiert eine geratene ID die Nachricht eines fremden Nutzers.
 */
export async function setRead(subjectUserId: string, messageId: string, read: boolean): Promise<boolean> {
  // `audience` mitgeprüft, aus demselben Grund wie beim Löschen: ab Etappe 2 gibt es Zeilen zum
  // selben Sub, die nicht ihm gehören.
  const message = await prisma.message.findFirst({ where: { id: messageId, subjectUserId, audience: "sub" }, select: { id: true } });
  if (!message) return false;
  if (read) {
    // upsert statt create: zweimal auf dieselbe Zeile zu tippen ist kein Fehler.
    await prisma.messageRead.upsert({
      where: { messageId_userId: { messageId, userId: subjectUserId } },
      create: { messageId, userId: subjectUserId },
      update: {},
    });
  } else {
    await prisma.messageRead.deleteMany({ where: { messageId, userId: subjectUserId } });
  }
  return true;
}

/**
 * Löscht EINE Nachricht aus dem Posteingang.
 *
 * Nur die Posteingangs-Zeile: das Bezugsobjekt (StrafeRecord, KontrollAnforderung, …) bleibt
 * unberührt — eine Nachricht ist die Zustellung, nicht der Vorgang. `MessageRead` hängt am
 * `onDelete: Cascade` und geht mit.
 *
 * `subjectUserId` ist wie bei {@link setRead} Teil der Suche, nicht nur des Aufrufs: eine geratene
 * ID findet damit nichts, statt die Nachricht eines fremden Nutzers zu löschen.
 */
export async function deleteMessage(subjectUserId: string, messageId: string): Promise<boolean> {
  // EIN `deleteMany` statt Suchen-dann-Löschen: atomar und idempotent. Bei zwei überlappenden
  // Aufrufen (zweiter Tab, Wiederholung nach Netz-Hänger) käme der Verlierer eines Read-then-Write
  // mit Prismas P2025 zurück — ein 500 mit leerem Body, obwohl der gewünschte Zustand längst
  // erreicht ist. `count === 0` heisst hier sauber „gibt es nicht (mehr)" → 404.
  //
  // `audience` wie in jedem Lese-Pfad: ab Etappe 2 tragen auch Nachrichten AN DIE KEYHOLDER die
  // `subjectUserId` des Subs — ohne diese Zeile könnte er sie dann löschen.
  //
  // Bekannte Grenze von „endgültig": das Löschen nimmt der `once`-Sperre (siehe RecordMessageParams)
  // ihren Anker. Bricht ein Poller genau zwischen Versand und `benachrichtigtAt`-Stempel ab UND wird
  // die Nachricht dazwischen gelöscht, legt der nächste Lauf sie neu an. Das Fenster ist ein
  // Absturz/Deploy breit; ein Grabstein-Datensatz dafür wäre teurer als der Fall.
  const { count } = await prisma.message.deleteMany({ where: { id: messageId, subjectUserId, audience: "sub" } });
  return count > 0;
}

/**
 * Alle SICHTBAREN als gelesen — bewusste Handlung mit Rückfrage in der Oberfläche, nie ein
 * Nebeneffekt. Liefert den neuen Ungelesen-Stand (0, solange nichts Verborgenes wartet).
 */
export async function markAllRead(subjectUserId: string): Promise<number> {
  const unread = await visibleUnreadRows(subjectUserId);
  if (unread.length === 0) return 0;
  // Je Zeile einzeln per upsert statt createMany: liest der Nutzer im zweiten Tab eine Nachricht,
  // während die Rückfrage offen steht, liefe createMany in den Unique-Index und der ganze Aufruf
  // schlüge fehl — obwohl der Zustand danach genau der gewünschte wäre. (SQLite kennt kein
  // skipDuplicates.)
  await Promise.all(
    unread.map((m) =>
      prisma.messageRead.upsert({
        where: { messageId_userId: { messageId: m.id, userId: subjectUserId } },
        create: { messageId: m.id, userId: subjectUserId },
        update: {},
      }),
    ),
  );
  // Frisch gezählt statt hart 0: sichtbare Nachrichten sind jetzt quittiert, aber der Zähler ist
  // die einzige ehrliche Quelle dafür — und bleibt es, wenn Etappe 2 weitere Leser einführt.
  return unreadCountFor(subjectUserId);
}
