import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bodyKeysOfCategory, bodyKeysOutsideSystem, type MessageFilter, type MessageSenderKind } from "@/lib/messageCategories";
import { isSubVisibleJudgment } from "@/lib/offenseTypes";
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
  "penaltyTaskMessage",
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
  "taskChangedMessage",
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

/** Objekt-Typen, auf die eine Nachricht zeigen kann. Namensschema wie `NoteRef.entityType`. */
export type MessageRefType = "offense" | "control" | "lockRequest" | "orgasmDirective" | "task";
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
  /** ZIEL dieser Kontrolle (`categoryId`, null = KG). Muss mit in den Link: ohne ihn landet eine
   *  Trage-Kontrolle auf dem KG-Formular, und die Einreichung beantwortet sie nicht (v5.0.1). */
  refActionCategoryId: string | null;
  /** Referenz gesetzt, Objekt aber nicht (mehr) auflösbar. Muster: `unknownRef` in lib/mcp/notes.ts. */
  refMissing: boolean;
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
 * benachrichtigtAt}`-Paar (siehe delayedTrigger.ts) — Strafen, Orgasmus-Anweisungen und Aufgaben
 * können nicht terminiert sein und sind deshalb nie verborgen. Genau deshalb fragt diese Funktion
 * ZWEI Tabellen, nicht eine je Referenz-Art: sie ist der heisse Pfad (Header, jede Dashboard-Seite).
 * Wer eine Referenz-Art ergänzt, prüft zuerst, ob sie terminierbar ist — nur dann gehört sie hierher.
 *
 * Immer auf den Sub eingegrenzt — eine Referenz auf die Zeile eines anderen Nutzers findet nichts,
 * statt sie preiszugeben.
 */
async function hiddenRefKeys(rows: RefRow[], subjectUserId: string): Promise<Set<string>> {
  const controlIds = idsOfType(rows, "control");
  const lockRequestIds = idsOfType(rows, "lockRequest");
  const offenseIds = idsOfType(rows, "offense");

  const scoped = { wirksamAb: true, benachrichtigtAt: true, id: true } as const;
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
    offenseIds.length
      ? prisma.strafeRecord.findMany({ where: { id: { in: offenseIds }, userId: subjectUserId }, select: { id: true, status: true } })
      : [],
  ]);

  const hidden = new Set<string>();
  for (const c of controls) if (isHiddenFromSub(c)) hidden.add(refKey("control", c.id));
  for (const l of lockRequests) if (isHiddenFromSub(l)) hidden.add(refKey("lockRequest", l.id));
  for (const o of offenses) if (!isSubVisibleJudgment(o)) hidden.add(refKey("offense", o.id));
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
  /** Nur bei Kontrollen: das Ziel für den Formular-Link (null = KG bzw. keine Handlung offen). */
  actionCategoryId?: string | null;
  hidden: boolean;
};

/** Freitext + Link-Ziel je Referenz — nur für die ANZEIGE, deshalb getrennt von {@link hiddenRefKeys}:
 *  der Zähler braucht keinen einzigen dieser Texte. */
async function refDetails(rows: RefRow[], subjectUserId: string): Promise<Map<string, RefDetail>> {
  const [offenseIds, controlIds, lockIds, orgasmIds, taskIds] =
    (["offense", "control", "lockRequest", "orgasmDirective", "task"] as const).map((t) => idsOfType(rows, t));

  const [offenses, controls, lockRequests, orgasmDirectives, tasks] = await Promise.all([
    // `status` mitlesen: ein verworfenes Urteil darf den Sub gar nicht erst erreichen — siehe
    // `isSubVisibleJudgment`. Ohne diese Spalte zeigte eine alte „Strafe verhängt"-Nachricht nach
    // einer Korrektur auf PUNISHED→DISMISSED die VERWERFUNGS-Begründung.
    offenseIds.length ? prisma.strafeRecord.findMany({ where: { id: { in: offenseIds }, userId: subjectUserId }, select: { id: true, reason: true, status: true } }) : [],
    // Mehr als der Kommentar: aus Code + Zustand entsteht das Link-Ziel (siehe unten).
    controlIds.length ? prisma.kontrollAnforderung.findMany({
      where: { id: { in: controlIds }, userId: subjectUserId },
      // `categoryId`: das Ziel gehört zum Link (siehe refActionCategoryId).
      select: { id: true, kommentar: true, code: true, categoryId: true, entryId: true, withdrawnAt: true, deadline: true, wirksamAb: true, benachrichtigtAt: true, autoMarkedRemovedAt: true },
    }) : [],
    // wirksamAb/benachrichtigtAt mitlesen: dieselbe Zeile beantwortet Text UND Sichtbarkeit — sonst
    // fragte der Listen-Pfad diese Tabelle zweimal (einmal hier, einmal über hiddenRefKeys).
    lockIds.length ? prisma.verschlussAnforderung.findMany({ where: { id: { in: lockIds }, userId: subjectUserId }, select: { id: true, nachricht: true, wirksamAb: true, benachrichtigtAt: true } }) : [],
    orgasmIds.length ? prisma.orgasmusAnforderung.findMany({ where: { id: { in: orgasmIds }, userId: subjectUserId }, select: { id: true, nachricht: true } }) : [],
    // Die BESCHREIBUNG, nicht der Titel: sie ist der Freitext der Keyholderin — die eigentliche
    // Anweisung („die Wohnung, nicht nur das Wohnzimmer"). Sie stand im Posteingang bisher gar
    // nicht, und ohne sie ist eine Aufgabe dort nicht nachlesbar, sondern nur benannt.
    taskIds.length ? prisma.task.findMany({ where: { id: { in: taskIds }, userId: subjectUserId }, select: { id: true, description: true } }) : [],
  ]);

  const now = new Date();
  const details = new Map<string, RefDetail>();
  for (const o of offenses) details.set(refKey("offense", o.id), { text: o.reason, actionCode: null, hidden: !isSubVisibleJudgment(o) });
  for (const c of controls) {
    // Ein Ziel gibt es NUR bei der offenen Kontrolle — dort steht eine Handlung an. Erfüllt,
    // abgelaufen, zurückgezogen oder noch nicht ausgelöst: kein Ziel, das etwas beiträgt. Der
    // Zustand kommt aus `mapAnforderungStatus` statt aus einer zweiten Handableitung.
    const open = mapAnforderungStatus(c, null, now) === "open";
    details.set(refKey("control", c.id), {
      text: c.kommentar,
      actionCode: open ? c.code : null,
      actionCategoryId: open ? c.categoryId : null,
      hidden: isHiddenFromSub(c),
    });
  }
  for (const l of lockRequests) details.set(refKey("lockRequest", l.id), { text: l.nachricht, actionCode: null, hidden: isHiddenFromSub(l) });
  for (const d of orgasmDirectives) details.set(refKey("orgasmDirective", d.id), { text: d.nachricht, actionCode: null, hidden: false });
  // `hidden: false`: eine Aufgabe kennt keine Terminierung — sie gilt ab dem Stellen, es gibt keinen
  // Überraschungs-Zeitpunkt zu schützen (siehe `delayedTrigger.ts`, das nur Kontrolle und Verschluss
  // betrifft).
  for (const t of tasks) details.set(refKey("task", t.id), { text: t.description, actionCode: null, hidden: false });
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
function messageWhere(subjectUserId: string, filter: MessageFilter = {}): Prisma.MessageWhereInput {
  return {
    subjectUserId,
    audience: "sub",
    ...(filter.unreadOnly ? { reads: { none: { userId: subjectUserId } } } : {}),
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
 * BEKANNTE UNSCHÄRFE: `total` zählt in der Datenbank, der Sichtbarkeits-Filter greift erst auf der
 * geladenen Seite. Eine verborgene Nachricht zählt also mit, ohne zu erscheinen — eine Seite kann
 * kürzer sein als `MESSAGE_PAGE_SIZE`. Der genaue Weg hiesse, für jede Zählung den ganzen
 * Posteingang samt seiner Bezugsobjekte aufzulösen; verborgene Zeilen sind selten (terminierte
 * Direktiven, verworfene Urteile), und der Preis stünde in keinem Verhältnis.
 */
export async function listMessagesFor(
  subjectUserId: string,
  opts: { page?: number; filter?: MessageFilter } = {},
): Promise<MessagePage> {
  const where = messageWhere(subjectUserId, opts.filter);
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
      bodyKey: true,
      bodyParams: true,
      body: true,
      refEntityType: true,
      refEntityId: true,
      reads: { where: { userId: subjectUserId }, select: { id: true } },
    },
  });

  // Eine Auflösung für beides: `refDetails` liefert Text, Ziel UND Sichtbarkeit. `hiddenRefKeys`
  // bleibt die schlanke Variante für den Zähler (Header-Pfad), der keinen Text braucht.
  const details = await refDetails(rows, subjectUserId);

  const messages: InboxMessage[] = [];
  for (const row of rows) {
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
      refActionCategoryId: key ? details.get(key)?.actionCategoryId ?? null : null,
      refMissing: key !== null && !details.has(key),
      read: row.reads.length > 0,
    });
  }
  return { messages, page, pageCount };
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
    await markRowsRead(subjectUserId, [messageId]);
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
/**
 * Mehrere Nachrichten auf einmal — löschen bzw. den Gelesen-Zustand setzen.
 *
 * `audience` und `subjectUserId` stehen in JEDER Where-Klausel, wie bei den Einzel-Fassungen: eine
 * fremde id in der Liste trifft damit nichts, statt den Aufruf scheitern zu lassen. Das Ergebnis ist
 * die Zahl der tatsächlich getroffenen Zeilen — der Aufrufer erfährt so, ob seine Auswahl noch
 * aktuell war, ohne dass eine veraltete Zeile den ganzen Vorgang kippt.
 *
 * Die Ids werden vorher auf die eigenen eingegrenzt: `messageRead` kennt keine `subjectUserId`, ein
 * `deleteMany` auf rohe Ids räumte sonst fremde Lese-Kennzeichen ab.
 */
async function ownMessageIds(subjectUserId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.message.findMany({
    where: { id: { in: ids }, subjectUserId, audience: "sub" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function deleteMessages(subjectUserId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.message.deleteMany({
    where: { id: { in: ids }, subjectUserId, audience: "sub" },
  });
  return count;
}

/**
 * Setzt Lese-Kennzeichen für mehrere Nachrichten.
 *
 * EINE Transaktion statt N: der SQLite-Connector fährt mit `connection_limit=1`, ein `Promise.all`
 * über einzelne `upsert` erzeugt also nur den ANSCHEIN von Nebenläufigkeit — tatsächlich waren es
 * bei 100 Ids 100 eigene Schreib-Transaktionen mit 100 Commits.
 *
 * Einzelne `upsert` statt `createMany`: liest der Nutzer im zweiten Tab eine der Zeilen, liefe
 * `createMany` in den Unique-Index und der ganze Aufruf schlüge fehl, obwohl der Zustand danach der
 * gewünschte wäre. (SQLite kennt kein `skipDuplicates`.)
 */
async function markRowsRead(subjectUserId: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  await prisma.$transaction(
    messageIds.map((messageId) =>
      prisma.messageRead.upsert({
        where: { messageId_userId: { messageId, userId: subjectUserId } },
        create: { messageId, userId: subjectUserId },
        update: {},
      }),
    ),
  );
}

export async function setReadMany(subjectUserId: string, ids: string[], read: boolean): Promise<number> {
  if (ids.length === 0) return 0;
  if (!read) {
    // Der Scope steht in der Where-Klausel statt in einer Vorabfrage — `messageRead` kennt keine
    // `subjectUserId`, also führt der Weg über die Nachricht.
    const { count } = await prisma.messageRead.deleteMany({
      where: { userId: subjectUserId, messageId: { in: ids }, message: { subjectUserId, audience: "sub" } },
    });
    return count;
  }
  const own = await ownMessageIds(subjectUserId, ids);
  await markRowsRead(subjectUserId, own);
  return own.length;
}

export async function deleteMessage(subjectUserId: string, messageId: string): Promise<boolean> {
  return (await deleteMessages(subjectUserId, [messageId])) > 0;
}

/**
 * Alle SICHTBAREN als gelesen — bewusste Handlung mit Rückfrage in der Oberfläche, nie ein
 * Nebeneffekt. Liefert den neuen Ungelesen-Stand (0, solange nichts Verborgenes wartet).
 */
export async function markAllRead(subjectUserId: string): Promise<number> {
  const unread = await visibleUnreadRows(subjectUserId);
  if (unread.length === 0) return 0;
  await markRowsRead(subjectUserId, unread.map((m) => m.id));
  // Frisch gezählt statt hart 0: sichtbare Nachrichten sind jetzt quittiert, aber der Zähler ist
  // die einzige ehrliche Quelle dafür — und bleibt es, wenn Etappe 2 weitere Leser einführt.
  return unreadCountFor(subjectUserId);
}
