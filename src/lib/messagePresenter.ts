import { getTranslations } from "next-intl/server";
import type { InboxMessage, MessageSenderKind } from "@/lib/messageService";
import { messageCategory, type MessageCategory } from "@/lib/messageCategories";
import { inspectionHref } from "@/lib/entryFormRoute";
import { offenseCanonicalFromNameKey, withOffenseName } from "@/lib/offenseLabels";
import { withMessageDefaults } from "@/lib/messageDefaults";
import { loadStatementGates, loadStatements, statementBlockedReason, type LoadedStatement } from "@/lib/offenseStatementService";

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
    text: string | null;
    editable: boolean;
  } | null;
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
  // IMMER laden, nicht nur im eigenen Posteingang: die Keyholderin liest denselben Text, sie bekommt
  // nur kein Feld dazu. An `statementFor` gehängt blieb ihre Sicht leer — und damit auch die Zeile,
  // die dem Urteil vorausgehen soll.
  const offenseRefs = [...new Set(messages.flatMap((m) => (m.offenseRefId ? [m.offenseRefId] : [])))];
  const [t, tOffenses, statements, gates] = await Promise.all([
    getTranslations({ locale, namespace: "emails" }),
    getTranslations({ locale, namespace: "offenses" }),
    loadStatements(offenseRefs),
    statementFor ? loadStatementGates(statementFor.userId, offenseRefs) : new Map(),
  ]);
  return messages.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    text: m.bodyKey ? t(m.bodyKey, withOffenseName(withMessageDefaults(m.bodyKey, m.bodyParams), tOffenses)) : (m.body ?? ""),
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
 * Die Stellungnahme-Spalte einer Zeile — Text und Schreibrecht.
 *
 * `null` bleibt sie, wo es kein Vergehen gibt, wo die Meldung keine auflösbare Art trägt und im
 * Keyholder-Posteingang, solange dort weder Text noch Recht vorliegen — eine leere Hülle wäre für
 * die Anzeige dasselbe wie gar keine.
 *
 * Die Art wird hier nur GEPRÜFT, nicht ausgeliefert: der Schreibweg liest sie selbst aus derselben
 * Meldung (`announcedOffenseType`). Wo sie fehlt, antwortete er mit 404 — ein Feld anzubieten hiesse
 * dort, ein Versprechen zu geben, das der Server ablehnt.
 */
function statementOf(
  m: InboxMessage,
  statements: Map<string, LoadedStatement>,
  gates: Map<string, { allowed: boolean; judgedBy: string | null }>,
): PresentedMessage["statement"] {
  const refId = m.offenseRefId;
  if (!refId) return null;
  if (!offenseCanonicalFromNameKey(m.bodyParams?.offenseKey as string | undefined)) return null;
  const row = statements.get(refId) ?? null;
  const gate = gates.get(refId);
  const editable = gate ? statementBlockedReason(gate) === null : false;
  if (!row && !editable) return null;
  return { refId, text: row?.text ?? null, editable };
}
