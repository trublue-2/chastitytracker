import { getTranslations } from "next-intl/server";
import type { InboxMessage, MessageSenderKind } from "@/lib/messageService";
import { messageCategory, type MessageCategory } from "@/lib/messageCategories";
import { inspectionHref } from "@/lib/entryFormRoute";
import { offenseCanonicalFromNameKey } from "@/lib/offenseLabels";
import { loadStatementGates, loadStatements, statementBlockedReason } from "@/lib/offenseStatementService";

/** Eine anzeigefertige Nachricht: alle Texte aufgelöst, keine i18n-Schlüssel mehr. */
export interface PresentedMessage {
  id: string;
  createdAt: string;
  /** Der Meldungstext, in der Sprache des LESERS gerendert. */
  text: string;
  /** Freitext des Bezugsobjekts (Straftext, Kommentar, Anforderungs-Nachricht) — oder null. */
  refText: string | null;
  /** Bezug gesetzt, Objekt nicht mehr auflösbar (gelöscht) — die Zeile sagt das statt zu schweigen. */
  refMissing: boolean;
  /** Worum es geht — trägt die Kennzeichnung der Zeile. Abgeleitet, nicht gespeichert. */
  category: MessageCategory;
  /** Ziel, falls es eine Seite gibt, die etwas dazu sagt (heute: offene Kontrolle). */
  refHref: string | null;
  /** UM WEN es geht — nur im Keyholder-Posteingang gesetzt (er spannt über mehrere Träger), im
   *  Posteingang des Trägers `null`. Ein NAME, kein Schlüssel: er wird nie übersetzt. */
  subjectUsername: string | null;
  senderKind: MessageSenderKind;
  /** WER geschrieben hat, wo ein Mensch dahintersteht — sonst null. Ein NAME, kein Schlüssel: er
   *  wird nie übersetzt, wie `subjectUsername`. */
  senderName: string | null;
  read: boolean;
  /**
   * Die Stellungnahme des Trägers zu dem Vergehen, über das diese Zeile berichtet — `null`, wo es
   * keines gibt (jede andere Meldung) oder wo sie abgeschaltet ist.
   *
   * `editable` sagt, ob der LESER dieser Zeile sie schreiben darf: der Träger in seinem eigenen
   * Posteingang, solange niemand geurteilt hat. Die Keyholderin liest denselben Text und bekommt
   * kein Feld — sie urteilt darüber, sie verfasst ihn nicht.
   */
  statement: {
    refId: string;
    /** Die kanonische Art, für den Schreibweg — aus dem Namens-Schlüssel der Meldung zurückgelesen. */
    offenseType: string;
    text: string | null;
    editable: boolean;
    /** Gesetzt, wenn der Text nach dem ersten Absenden geändert wurde. */
    editedAt: string | null;
  } | null;
}

/**
 * Der Name der Vergehensart steht als i18n-SCHLÜSSEL in den Parametern, nicht als fertiger Text.
 *
 * Grund: die Nachricht wird in der Sprache gelesen, die beim ÖFFNEN gilt — nicht in der, die beim
 * Schreiben galt. Ein zur Schreibzeit übersetzter Name bliebe für immer deutsch, auch wenn der
 * Träger später auf Englisch umstellt. Aufgelöst wird er deshalb hier, wo ohnehin die Lesersprache
 * bekannt ist.
 *
 * Ein unbekannter Schlüssel (zurückgebaute Vergehensart, Handeintrag) darf die Zeile nicht als
 * rohen Pfad zeigen — `t.has()` beantwortet das, ohne den Fehlerkanal zu bemühen. Dasselbe Muster
 * wie `useApiError()` für unbekannte Fehler-Codes.
 */
function withOffenseName(
  params: Record<string, string | number> | null,
  tOffenses: { (key: string): string; has(key: string): boolean },
): Record<string, string | number> | undefined {
  if (!params || params.offenseKey === undefined) return params ?? undefined;
  const { offenseKey, ...rest } = params;
  const key = String(offenseKey);
  return { ...rest, offense: tOffenses.has(key) ? tOffenses(key) : key };
}

/**
 * Löst Nachrichten für die Anzeige auf — die EINE Stelle, an der aus `bodyKey` + `bodyParams` Text
 * wird. Geteilt von der Seite (erste Seite, serverseitig) und der GET-Route (Nachladen), damit beide
 * Wege dieselbe Zeile liefern.
 *
 * Die Render-Regel hängt an der Feld-Identität, nicht an einem Flag: `bodyKey` ⇒ übersetzen,
 * `body` ⇒ roh übernehmen (Menschentext wird nie übersetzt und nie interpoliert).
 */
export async function presentMessages(
  messages: InboxMessage[],
  locale: string,
  /** Wessen Posteingang das ist — nur der TRÄGER darf hier schreiben. Fehlt die Angabe (Keyholder-
   *  Sicht), erscheint die Stellungnahme als Text ohne Feld. */
  statementFor?: { userId: string } | null,
): Promise<PresentedMessage[]> {
  const offenseRefs = statementFor
    ? [...new Set(messages.flatMap((m) => (m.offenseRefId ? [m.offenseRefId] : [])))]
    : [];
  const [t, tOffenses, statements, gates] = await Promise.all([
    getTranslations({ locale, namespace: "emails" }),
    getTranslations({ locale, namespace: "offenses" }),
    loadStatements(offenseRefs),
    statementFor ? loadStatementGates(statementFor.userId, offenseRefs) : new Map(),
  ]);
  return messages.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    text: m.bodyKey ? t(m.bodyKey, withOffenseName(m.bodyParams, tOffenses)) : (m.body ?? ""),
    refText: m.refText,
    refMissing: m.refMissing,
    category: messageCategory(m.bodyKey),
    // Die offene Kontrolle führt auf ihre Handlung: das Prüfungs-Formular mit vorbelegtem Code.
    // Über `inspectionHref`, damit auch diese Stelle am zentralen Bauplatz hängt — der Helfer kam
    // parallel dazu und konnte den Posteingang noch nicht kennen.
    // Mit dem ZIEL (v5.0.1): ohne `categoryId` führte der Link einer Trage-Kontrolle aufs
    // KG-Formular, und die Einreichung von dort erfüllt sie nicht.
    refHref: m.refActionCode ? inspectionHref(m.refActionCode, { categoryId: m.refActionCategoryId }) : null,
    subjectUsername: m.subjectUsername,
    senderKind: m.senderKind,
    senderName: m.senderName,
    read: m.read,
    statement: statementOf(m, statements, gates),
  }));
}

/**
 * Die Stellungnahme-Spalte einer Zeile — Text, Schreibrecht und die Art, unter der geschrieben wird.
 *
 * `null` bleibt sie, wo es kein Vergehen gibt, wo die Art nicht mehr auflösbar ist (dann wüsste der
 * Schreibweg nicht, worunter er speichern soll) und im Keyholder-Posteingang, solange dort weder
 * Text noch Recht vorliegen — eine leere Hülle wäre für die Anzeige dasselbe wie gar keine.
 */
function statementOf(
  m: InboxMessage,
  statements: Map<string, { text: string; createdAt: Date; updatedAt: Date }>,
  gates: Map<string, { allowed: boolean; judgedBy: string | null }>,
): PresentedMessage["statement"] {
  const refId = m.offenseRefId;
  if (!refId) return null;
  const offenseType = offenseCanonicalFromNameKey(m.bodyParams?.offenseKey as string | undefined);
  if (!offenseType) return null;
  const row = statements.get(refId) ?? null;
  const gate = gates.get(refId);
  const editable = gate ? statementBlockedReason(gate) === null : false;
  if (!row && !editable) return null;
  return {
    refId,
    offenseType,
    text: row?.text ?? null,
    editable,
    // Nur wo wirklich nachgebessert wurde: `updatedAt` steht bei jeder Zeile, auch der unberührten.
    editedAt: row && row.updatedAt.getTime() !== row.createdAt.getTime() ? row.updatedAt.toISOString() : null,
  };
}
