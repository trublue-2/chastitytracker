import { userRowCached } from "@/lib/dashboardData";
import { NOTICE_VERSION } from "@/lib/notice";
import ChangeoverNotice from "@/app/components/ChangeoverNotice";

/**
 * Entscheidet, OB der Umstellungs-Hinweis erscheint (Issue #87).
 *
 * **Keine eigene Abfrage.** `userRowCached` liest die Benutzerzeile, die der Träger-Bereich über
 * `viewerLayout` ohnehin lädt — der Merker reist als Spalte in `BLOCK_USER_SELECT` mit. Ein
 * eigenes `findUnique` daneben kostete gemessene ~215 µs pro Seitenaufruf, dauerhaft und für
 * jeden, auch lange nachdem alle den Hinweis quittiert haben. Die zusätzliche Spalte kostet
 * innerhalb der Messgenauigkeit nichts, weil SQLite die Zeile ohnehin liest.
 *
 * Die Trennung in ein Server-Gate und eine Client-Komponente ist nicht Zierde: der Merker ist
 * Datenbank-Zustand, das Wegklicken ist Interaktion. Ohne den Schnitt müsste die aufrufende Seite
 * zum Client werden.
 *
 * **Nach dem Ende der Umstellung entfernen.** Im Träger-Bereich ist die Abfrage gratis (die Zeile
 * wird ohnehin geladen); im Keyholder-Bereich ist sie eine echte zusätzliche Abfrage auf JEDER
 * Unterseite, weil das Layout dort nur `hideOwnTracker` liest und dafür einen eigenen, engen
 * `findUnique` fährt. Das ist der Preis dafür, jeden Einstieg zu erreichen, und er ist für ein
 * paar Wochen richtig — dauerhaft nicht. Wenn `NOTICE_VERSION` in Rente geht, gehen die beiden
 * Einhängungen, dieses Bauteil und der `notice`-Namensraum mit.
 */
export default async function ChangeoverNoticeGate({ userId }: { userId: string }) {
  const user = await userRowCached(userId);
  if (user?.noticeSeenVersion === NOTICE_VERSION) return null;
  return <ChangeoverNotice />;
}
