import { NextResponse } from "next/server";
import { requireKeyholderOrAdminActor } from "@/lib/authGuards";
import { setOffenseRule } from "@/lib/offenseRulesService";
import { errorResponse, serviceResponse } from "@/lib/serviceResult";

/**
 * Legt EINE Vergehens-Regel eines Subs um: `{ userId, offenseType, mode }`.
 *
 * Eine Zeile je Aufruf statt eines Sammel-Patches — jede Änderung ist ein eigener Zeitpunkt in der
 * Historie (`OffenseRuleChange`), und ein Formular, das alle Arten gebündelt schickt, würde für
 * unveränderte Arten entweder Zeilen erfinden oder sie stillschweigend übergehen.
 *
 * Der Guard ist derselbe wie bei den übrigen Sub-Einstellungen (`requireKeyholderOrAdminApi` in
 * PATCH /api/admin/users/[id]) — hier nur in der Actor-Variante, weil `changedBy` den Handelnden
 * festhält.
 */
export async function PATCH(req: Request) {
  const body = await req.json();
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!userId) return errorResponse(400, "USER_ID_REQUIRED");

  const actor = await requireKeyholderOrAdminActor(userId);
  if (actor instanceof NextResponse) return actor;

  return serviceResponse(await setOffenseRule({
    userId,
    // Roh durchreichen — der Service prüft Art UND Modus gegen `OFFENSE_RULE_MODES`. Ein fehlendes
    // Feld wird zum Leerstring und fällt damit in dieselbe Absage wie ein unbekannter Wert.
    offenseType: typeof body.offenseType === "string" ? body.offenseType : "",
    mode: typeof body.mode === "string" ? body.mode : "",
    changedBy: actor.user.name ?? "?",
  }));
}
