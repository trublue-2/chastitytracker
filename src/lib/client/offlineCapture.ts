/**
 * Offline erfasste Einträge — die eine Auslegung der zwei Client-Felder, geteilt von beiden
 * Erfassungs-Routen (`/api/entries`, `/api/weight`).
 *
 * Ein Eintrag, den der Träger ohne Netz gestellt hat, wird von der Warteschlange (`useOfflineQueue`)
 * gespeichert und später nachgereicht. Damit der REALE Moment nicht verloren geht, legt der Client
 * beim Einreihen `capturedOffline: true` und `capturedAt` (seine Uhr im Moment der Handlung) in den
 * Rumpf. Diese Funktion liest beide zurück.
 *
 * **Das ist die bewusst akzeptierte Vertrauens-Lockerung.** Auf dem Sub-Pfad gilt sonst strikt die
 * Server-Uhr, damit sich niemand aus einer Frist herausdatiert (siehe `entryFulfilment.ts`). Nur das
 * Offline-Flag öffnet den EINEN Pfad, auf dem eine Client-Zeit als Stichtag zählt — für einen
 * offline erfassten Eintrag ist der Zeitpunkt der Erfassung der ehrliche Bezug, nicht der der
 * (u.U. Tage späteren) Zustellung. Eine NORMALE Online-Übermittlung ohne das Flag bleibt unberührt.
 *
 * `capturedAt` ist client-gesteuert und wird deshalb nie in die ZUKUNFT gelassen (ein vordatierter
 * Wert nützte ohnehin niemandem, aber eine offline erfasste Zukunft ist unsinnig). Fehlt das Flag
 * oder ist die Zeit unlesbar, ist das Ergebnis „nicht offline" — dann greift wieder die Server-Uhr.
 */
import { parseTriggerAt } from "@/lib/delayedTrigger";

export interface OfflineCapture {
  capturedOffline: boolean;
  /** Die Client-Erfassungszeit, wenn (und nur wenn) offline erfasst UND lesbar. Nie in der Zukunft. */
  capturedAt: Date | null;
}

export function parseOfflineCapture(
  body: { capturedOffline?: unknown; capturedAt?: unknown },
  // Optional statt `= new Date()`: der Default würde die Uhr auf JEDEM (meist online) Aufruf
  // allozieren, obwohl der Frühausstieg sie nie liest. Der heisse `POST /api/entries`-Pfad.
  now?: Date,
): OfflineCapture {
  if (body.capturedOffline !== true) return { capturedOffline: false, capturedAt: null };

  // Client-Datum lesen über den geteilten Parser (NaN-Wache inklusive) — `"invalid"`/`null` heisst
  // „keine brauchbare Zeit", dann fällt der Aufrufer auf die Server-Uhr zurück.
  const parsed = parseTriggerAt(typeof body.capturedAt === "string" ? body.capturedAt : null);
  if (parsed === null || parsed === "invalid") return { capturedOffline: true, capturedAt: null };

  // Client-Uhr geht vor? Auf die Server-Uhr klemmen — eine offline „in der Zukunft" erfasste
  // Handlung gibt es nicht, und ein vordatierter Stichtag soll nicht durchrutschen.
  const clock = now ?? new Date();
  return { capturedOffline: true, capturedAt: parsed.getTime() > clock.getTime() ? clock : parsed };
}
