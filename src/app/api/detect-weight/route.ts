import { NextRequest, NextResponse } from "next/server";
import { requireApi, weightTrackingGate } from "@/lib/authGuards";
import { detectScaleReading } from "@/lib/verifyCode";
import { checkRateLimit } from "@/lib/rate-limit";
import { isValidImageUrl, VALID_ROTATIONS, type Rotation } from "@/lib/constants";
import { weightInputToKg, weightProblem, type UnitSystem } from "@/lib/weight";

/**
 * Liest die Anzeige einer Waage aus einem hochgeladenen Foto — Muster und Grenzen wie
 * `/api/detect-seal`, von dem diese Route abstammt.
 *
 * Antwort ist ein VORSCHLAG für das Formular: `{ detectedKg, unitFromDisplay }`. Der Wert wird
 * NICHT gespeichert; das tut erst `/api/weight`, wenn der Mensch bestätigt hat.
 *
 * `unit` im Body ist die Anzeige-Einheit dessen, der fotografiert — sie gilt nur, wenn die Waage
 * selbst keine nennt. Zeigt das Display „lb", schlägt das den Wunsch des Nutzers: die Zahl auf der
 * Anzeige bedeutet, was dort steht.
 */
export async function POST(req: NextRequest) {
  const session = await requireApi();
  if (session instanceof NextResponse) return session;

  const gate = await weightTrackingGate(session.user.id);
  if (gate) return gate;

  // Jeder Aufruf kostet einen Vision-Durchgang — dieselbe Schranke wie bei der Siegel-Erkennung.
  const rl = await checkRateLimit(`weight-detect:${session.user.id}`, 10, 60_000);
  if (rl.limited) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const { imageUrl, rotation, unit } = await req.json();
  if (!imageUrl || !isValidImageUrl(imageUrl)) return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
  const safeRotation: Rotation = VALID_ROTATIONS.includes(rotation) ? rotation : 0;

  const reading = await detectScaleReading(imageUrl, safeRotation);
  if (!reading) return NextResponse.json({ detectedKg: null, unitFromDisplay: null });

  // Die abgelesene Einheit gewinnt; ohne eine gilt die des Nutzers.
  const effective: UnitSystem = reading.unit === "lb" ? "imperial" : (reading.unit === "kg" ? "metric" : (unit === "imperial" ? "imperial" : "metric"));
  const kg = weightInputToKg(reading.value, effective);
  // Dieselbe Plausibilitätsgrenze wie beim Speichern: was dort abgewiesen würde, soll das Formular
  // gar nicht erst vorschlagen.
  if (weightProblem(kg)) return NextResponse.json({ detectedKg: null, unitFromDisplay: reading.unit });

  return NextResponse.json({ detectedKg: kg, unitFromDisplay: reading.unit });
}
