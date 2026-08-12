import { prisma } from "@/lib/prisma";

/** Die Felder, aus denen sich „kann diese Person die Einstellung überhaupt haben?" beantworten
 *  lässt — genau der Ausschnitt der Session, den alle Aufrufer ohnehin in der Hand halten. Die
 *  Typen sind so weit gefasst, dass jeder von ihnen sein `session.user` unverändert hereinreicht;
 *  müsste einer erst ein Objekt zurechtbauen, wäre genau das die Stelle, an der sich der nächste
 *  Aufrufer vertippt. */
export interface OwnTrackerActor {
  id?: string | null;
  role?: string;
  controlsSubs?: boolean;
}

/**
 * Kontrolliert diese Person Träger — als Keyholder oder qua Admin-Rolle?
 *
 * DIE eine Schreibweise für `role === "admin" || controlsSubs === true`. Sie stand an fünf Stellen
 * ausgeschrieben, und jede einzelne konnte den Admin-Zweig vergessen: ein globaler Admin OHNE
 * `AdminUserRelationship`-Zeile trägt `controlsSubs: false` und wäre dann plötzlich kein
 * Kontrolleur mehr — auf der Instanz, die er betreibt.
 *
 * Beide Felder kommen aus der Session (`auth.ts` legt `controlsSubs` auf den JWT), es kostet also
 * keine Abfrage. `=== true` statt `!!`: das Feld ist optional, und ein fehlender Wert heisst „nein",
 * nicht „unbekannt".
 */
export function isController(actor: OwnTrackerActor | undefined): boolean {
  return actor?.role === "admin" || actor?.controlsSubs === true;
}

/**
 * Hat diese Person „kein eigener Tracker" gesetzt?
 *
 * DIE Antwort auf diese Frage — vorher stand sie zweimal getrennt da, und genau daran ist sie
 * auseinandergelaufen: `proxy.ts` wirft solche Nutzer von `/dashboard/*` nach `/admin` zurück, aber
 * die Kopfzeile fragte gar nicht erst und zeigte auf `/dashboard/settings` (einer der Ausnahmepfade,
 * die der Proxy durchlässt) eine Glocke, die beim Klick genau diesen Rauswurf auslöste. Ein Knopf,
 * der einen wegwirft, ist kein Schönheitsfehler — er sieht bis zum Klick völlig normal aus.
 *
 * Die Rollen-Vorprüfung ist nicht bloss Sparsamkeit, sie gehört zur Antwort: den Schalter bekommt
 * nur zu sehen, wer Subs kontrolliert oder Admin ist (Gate `showStartPage`). Wer das nicht ist,
 * KANN die Einstellung nicht gesetzt haben — und das ist der Grossteil des `/dashboard`-Verkehrs,
 * der sich die Abfrage damit spart.
 *
 * Bewusst frisch aus der DB statt aus dem Token: ein Umschalten der Einstellung soll bei der
 * nächsten Navigation greifen, nicht erst beim nächsten Login.
 *
 * NICHT für Aufrufer, die den Nutzer ohnehin laden (`landing.ts`, `getSettingsProps.ts`): die lesen
 * `hideOwnTracker` als ein Feld ihrer eigenen Zeile mit und bekämen hier eine zweite Abfrage.
 */
export async function ownTrackerHidden(actor: OwnTrackerActor | undefined): Promise<boolean> {
  if (!actor?.id) return false;
  if (!isController(actor)) return false;

  const row = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { hideOwnTracker: true },
  });
  return row?.hideOwnTracker ?? false;
}
