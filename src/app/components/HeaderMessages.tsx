import MessageBell from "@/app/components/MessageBell";
import AppBadgeSync from "@/app/components/AppBadgeSync";
import { unreadCountCached, unreadCountForKeyholderCached } from "@/lib/messageService";
import { isController, type OwnTrackerActor } from "@/lib/ownTracker";
import type { MessageScope } from "@/lib/messageScope";

/**
 * Glocke + App-Badge als EIN Kopfzeilen-Element — geteilt von `Header` (Träger) und `AdminHeader`
 * (Keyholder).
 *
 * Zusammen, weil beide denselben Zähler brauchen und er nur einmal gelesen werden soll; der Badge
 * rendert nichts und darf deshalb neben der Glocke stehen. Getrennt eingebaut hiesse: zwei Aufrufer
 * halten von Hand fest, dass der Badge dieselbe Zahl bekommt wie die Glocke — und ein Kopf, der die
 * Glocke bekommt, aber den Badge vergisst, zeigt am App-Symbol still eine veraltete Zahl.
 *
 * ZWEI ZÄHLER, EIN BADGE: Die Glocke zeigt den Posteingang des Bereichs, in dem man steht — im
 * grünen Kopf den eigenen, im blauen den über die eigenen Träger. Das App-Badge zeigt in BEIDEN
 * Bereichen die SUMME. Sonst kippte die Zahl am App-Symbol beim blossen Wechsel des Bereichs hin und
 * her, und ein Badge, das je nach zuletzt besuchter Seite etwas anderes meint, ist keine Auskunft
 * mehr, sondern Rauschen.
 *
 * DAS IST SO GEWOLLT — bitte nicht „reparieren": im GRÜNEN Bereich zählt das Badge auch die
 * Keyholder-Nachrichten mit, die die grüne Glocke daneben nicht öffnen kann. Das Badge beantwortet
 * „wartet insgesamt etwas auf mich?", nicht „was liegt in diesem Bereich?" — die Tür dorthin ist der
 * Bereichswechsel, sie fehlt nicht. Ein Badge je Bereich wurde ausdrücklich VERWORFEN: die Zahl am
 * App-Symbol spränge dann bei jedem Wechsel um, und genau das macht sie wertlos.
 *
 * Der Gegenfall, in dem es tatsächlich um Unerreichbarkeit geht, steht unten an
 * `ownInboxReachable`: dort sind die Nachrichten für diese Person ÜBERHAUPT nicht erreichbar (kein
 * eigener Tracker — der Proxy wirft von `/dashboard/*` zurück), es gibt also gar keinen Bereich, in
 * dem sie sich wegklicken liessen. Deshalb fallen sie dort aus dem Badge heraus, hier nicht.
 *
 * Für einen einfachen Träger kostet der Keyholder-Teil KEINE Abfrage: dass er keine Subs
 * kontrolliert, steht schon in der Session — dieselbe Vorprüfung, mit der `ownTrackerHidden()` sich
 * den Grossteil des `/dashboard`-Verkehrs spart.
 *
 * Der Zähler darf die Hülle nicht mitreissen: dieses Element steht in JEDEM Dashboard- und
 * Admin-Layout. Fehlt die Tabelle noch (Instanz zieht das Update gerade erst), zeigt die Glocke
 * keine Zahl — statt dass jede Seite 500t.
 */
export default async function HeaderMessages({
  actor,
  scope,
  ownInboxReachable = true,
}: {
  /** Genau der Ausschnitt der Session, aus dem sich beide Zähler beantworten lassen — derselbe Typ
   *  wie bei `ownTrackerHidden()`, damit jeder Aufrufer sein `session.user` unverändert
   *  hereinreicht. Ohne `id` gibt es nichts zu zählen: das Element rendert dann gar nicht. */
  actor: OwnTrackerActor;
  scope: MessageScope;
  /**
   * Ob der EIGENE Posteingang für diese Person überhaupt erreichbar ist. `false` bei „kein eigener
   * Tracker": dort verbirgt der grüne Kopf seine Glocke und der Proxy wirft von `/dashboard/*`
   * zurück. Der eigene Stand darf dann auch nicht ins Badge — sonst stünde am App-Symbol eine Zahl,
   * zu der es keine Tür gibt und die niemand mehr wegklicken kann. Genau die Sorte Badge, die dieses
   * Bauteil abschaffen sollte.
   */
  ownInboxReachable?: boolean;
}) {
  const actorId = actor.id;
  if (!actorId) return null;
  const [own, keyholder] = await Promise.all([
    ownInboxReachable ? safeCount(() => unreadCountCached(actorId)) : 0,
    isController(actor) ? safeCount(() => unreadCountForKeyholderCached(actorId, actor.role)) : 0,
  ]);

  return (
    <>
      <MessageBell unread={scope === "keyholder" ? keyholder : own} scope={scope} />
      <AppBadgeSync unread={own + keyholder} />
    </>
  );
}

async function safeCount(read: () => Promise<number>): Promise<number> {
  try {
    return await read();
  } catch (err) {
    console.error("[messages] unread count failed", err);
    return 0;
  }
}
