import { getTranslations } from "next-intl/server";
import type { InboxMessage, MessageSenderKind } from "@/lib/messageService";
import { messageCategory, type MessageCategory } from "@/lib/messageCategories";
import { inspectionHref } from "@/lib/entryFormRoute";

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
  senderKind: MessageSenderKind;
  read: boolean;
}

/**
 * Löst Nachrichten für die Anzeige auf — die EINE Stelle, an der aus `bodyKey` + `bodyParams` Text
 * wird. Geteilt von der Seite (erste Seite, serverseitig) und der GET-Route (Nachladen), damit beide
 * Wege dieselbe Zeile liefern.
 *
 * Die Render-Regel hängt an der Feld-Identität, nicht an einem Flag: `bodyKey` ⇒ übersetzen,
 * `body` ⇒ roh übernehmen (Menschentext wird nie übersetzt und nie interpoliert).
 */
export async function presentMessages(messages: InboxMessage[], locale: string): Promise<PresentedMessage[]> {
  const t = await getTranslations({ locale, namespace: "emails" });
  return messages.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    text: m.bodyKey ? t(m.bodyKey, m.bodyParams ?? undefined) : (m.body ?? ""),
    refText: m.refText,
    refMissing: m.refMissing,
    category: messageCategory(m.bodyKey),
    // Die offene Kontrolle führt auf ihre Handlung: das Prüfungs-Formular mit vorbelegtem Code.
    // Über `inspectionHref`, damit auch diese Stelle am zentralen Bauplatz hängt — der Helfer kam
    // parallel dazu und konnte den Posteingang noch nicht kennen.
    // Mit dem ZIEL (v5.0.1): ohne `categoryId` führte der Link einer Trage-Kontrolle aufs
    // KG-Formular, und die Einreichung von dort erfüllt sie nicht.
    refHref: m.refActionCode ? inspectionHref(m.refActionCode, { categoryId: m.refActionCategoryId }) : null,
    senderKind: m.senderKind,
    read: m.read,
  }));
}
