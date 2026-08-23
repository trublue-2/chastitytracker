"use client";

import FormError from "@/app/components/FormError";
import { isUnderweightTarget, parseDecimalInput, weightInputToKg, type UnitSystem } from "@/lib/weight";

/**
 * Der Hinweis unter einem Zielgewichts-Feld, sobald die eingetippte Zahl den Träger unter BMI 18,5
 * führen würde — und nichts, solange sie es nicht tut.
 *
 * **Die Komponente trägt die REGEL, nicht nur die Kachel.** Beide Ziel-Felder (der Träger in seinen
 * Einstellungen, die Keyholderin in seinen) rechneten sonst dieselbe Kette aus Eingabe parsen,
 * in Kilogramm umrechnen und gegen die Schwelle prüfen — und seit die Nur-Weiten-Regel gestrichen
 * ist, ist diese Warnung die einzige Bremse im Feature. Zwei Fassungen davon dürfen nicht
 * auseinanderlaufen.
 *
 * `heightCm` ist immer die Grösse DES TRÄGERS: der BMI einer Zahl, die die Keyholderin für ihn
 * setzt, hat mit ihrer eigenen Statur nichts zu tun. `unit` dagegen ist die Anzeige-Einheit dessen,
 * der gerade tippt — er tippt ja in seiner.
 *
 * Der Text kommt von aussen: die beiden Seiten sagen dasselbe in verschiedener Anrede („dein Ziel"
 * / „dieses Ziel liegt für ihn"), und der Namensraum unterscheidet sich ohnehin.
 */
export default function UnderweightNote({ input, unit, heightCm, message }: {
  /** Der ROHE Feld-Inhalt, so wie er im Eingabefeld steht — inklusive Komma und Leerzeichen. */
  input: string;
  unit: UnitSystem;
  heightCm: number | null;
  message: string;
}) {
  const value = parseDecimalInput(input);
  if (value === null || !isUnderweightTarget(weightInputToKg(value, unit), heightCm)) return null;
  return <FormError message={message} />;
}
