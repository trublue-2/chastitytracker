import { NextResponse } from "next/server";
import { requireKeyholderOrAdminActor, sessionActor } from "@/lib/authGuards";
import { setHealthHold } from "@/lib/healthHold";
import { serviceResponse } from "@/lib/serviceResult";

/**
 * Setzt oder hebt den Gesundheits-Halt eines Trägers: `{ active, reason }`.
 *
 * EIGENE Route statt eines Felds an `PATCH /api/admin/users/[id]`, obwohl der Abschnitt in derselben
 * Einstellungs-Seite steht: der Halt ist keine Spalte am Benutzer, sondern eine eigene Tabelle mit
 * Historie — und sein Schreibvorgang zieht Kontrollen zurück, rückt Aufgaben-Fristen nach und meldet
 * dem Träger. Als Feld in der Sammel-Route hinge diese Wirkung an einem `if` inmitten von zwanzig
 * anderen Feldern.
 *
 * Derselbe Guard wie die übrigen Sub-Einstellungen, in der Actor-Variante: die Meldung an den Träger
 * nennt, wer die Pause gesetzt hat.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = await params;

  const actor = await requireKeyholderOrAdminActor(userId);
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));

  return serviceResponse(await setHealthHold({
    userId,
    // Nur ein ausdrückliches `true` schaltet ein — alles andere hebt auf. Die Richtung ist die
    // sichere: ein kaputter Body darf keine Pause SETZEN, die niemand wollte.
    active: body.active === true,
    reason: typeof body.reason === "string" ? body.reason : null,
    actor: sessionActor(actor),
  }));
}
