import { NextRequest, NextResponse } from "next/server";
import { requireApi, weightTrackingGate } from "@/lib/authGuards";
import { serviceResponse } from "@/lib/serviceResult";
import { setWeightSettingsSelf } from "@/lib/weightSettingsService";

/**
 * Die eigenen Gewichts-Einstellungen des Subs: Körpergrösse, Einheit und SEIN Zielgewicht.
 *
 * Eigene Route statt `userSelfFieldRoute()`: die Körpergrösse schreibt zusätzlich eine Zeile in die
 * Historie, und das Ziel führt seinen Zeitstempel mit — beides passt nicht in den Ein-Feld-Bauplan.
 * Die Felder der Keyholderin (Freischaltung, Wiege-Fenster, ihr Zielgewicht) sind hier bewusst NICHT
 * erreichbar; sie laufen über `/api/admin/users/[id]` hinter `requireKeyholderOrAdminApi()`.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const gate = await weightTrackingGate(session.user.id);
  if (gate) return gate;

  const body = await req.json();
  return serviceResponse(await setWeightSettingsSelf(session.user.id, {
    heightCm: body.heightCm,
    heightMode: body.heightMode === "correct" ? "correct" : "change",
    unitSystem: body.unitSystem,
    targetWeightKg: body.targetWeightKg,
    changedBy: session.user.name ?? null,
  }));
}
