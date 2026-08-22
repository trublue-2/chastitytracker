import { prisma } from "@/lib/prisma";
import { mapServiceError, serviceErrors, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { isValidImageUrl } from "@/lib/constants";
import { APP_TZ } from "@/lib/utils";
import { inWeighingWindow } from "@/lib/weightWindows";
import { weightDayKey, weightProblem } from "@/lib/weight";

/**
 * Das Erfassen einer Messung — der eine Schreibweg, den Formular, Keyholder-Aktion und (später) der
 * MCP teilen.
 *
 * Warum ein Dienst und nicht Logik in der Route: der Tagesschlüssel, das Fenster-Urteil und die
 * Foto-Pflicht sind Regeln des Features, nicht der HTTP-Schicht. Stünden sie in der Sub-Route, hätte
 * die Keyholder-Route sie ein zweites Mal — und die erste Abweichung wäre eine Messung, die beim
 * einen Weg im Fenster liegt und beim anderen nicht.
 */

/** Wer die Zeile anlegt. Bestimmt die Foto-Pflicht: nur der Träger steht vor der Waage. */
export type WeightSource = "user" | "keyholder" | "agent";

export interface RecordWeightParams {
  /** Immer metrisch — die Umrechnung passiert in der Oberfläche (`weight.ts`). */
  weightKg: number;
  measuredAt: Date;
  imageUrl?: string | null;
  imageExifTime?: Date | null;
  /** Was die Waagen-Erkennung gelesen hat. Etappe 7; bis dahin immer `null`. */
  detectedKg?: number | null;
  note?: string | null;
  source: WeightSource;
  /** Username des Erfassenden (bzw. `ai`), wenn es nicht der Träger selbst war. */
  createdById?: string | null;
  now?: Date;
}

export interface RecordWeightResult {
  id: string;
  dayKey: string;
  inWindow: boolean;
  /** Wahr, wenn für diesen Tag schon ein Wert stand und überschrieben wurde. */
  replaced: boolean;
}

const { table: ERRORS, fail } = serviceErrors({
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND" },
  WEIGHT_TRACKING_DISABLED: { status: 403, error: "WEIGHT_TRACKING_DISABLED" },
  WEIGHT_OUT_OF_RANGE: { status: 400, error: "WEIGHT_OUT_OF_RANGE" },
  WEIGHT_PROOF_REQUIRED: { status: 400, error: "WEIGHT_PROOF_REQUIRED" },
  WEIGHT_IN_FUTURE: { status: 400, error: "WEIGHT_IN_FUTURE" },
  INVALID_IMAGE_URL: { status: 400, error: "INVALID_IMAGE_URL" },
});

/** Ab wann eine Messzeit „in der Zukunft" liegt. Ein paar Minuten Luft, weil die Uhr des Handys
 *  gegenüber der des Servers vorgehen darf — eine Stunde wäre keine Luft mehr, sondern eine Lücke. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Schreibt die Messung des Tages. **Ein Wert je Kalendertag des Trägers** — eine zweite Messung
 * desselben Tages ersetzt die erste, statt eine zweite Zeile anzulegen.
 *
 * Der Tag ist der SEINE: `weightDayKey` mit seiner Zeitzone. Wer um 23:50 Uhr auf der Waage steht, hat
 * an diesem Tag gewogen — nicht an dem, den UTC gerade zählt.
 */
export async function recordWeight(
  userId: string,
  params: RecordWeightParams,
): Promise<ServiceResult<RecordWeightResult>> {
  const problem = weightProblem(params.weightKg);
  if (problem) return serviceFail(400, problem);
  if (!isValidImageUrl(params.imageUrl)) return serviceFail(400, "INVALID_IMAGE_URL");

  const now = params.now ?? new Date();
  if (params.measuredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return serviceFail(400, "WEIGHT_IN_FUTURE");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { weightTrackingEnabled: true, timezone: true, weighingWindows: true },
      });
      if (!user) throw fail("USER_NOT_FOUND");
      // Der Schalter der Keyholderin gilt für JEDEN Schreibweg, nicht nur für die Oberfläche —
      // sonst schriebe der MCP weiter, während der Träger nichts mehr sieht. Der Instanz-Schalter
      // sitzt eine Ebene höher (`weightTrackingGate` in den Routen), weil er ein 404 verlangt.
      if (!user.weightTrackingEnabled) throw fail("WEIGHT_TRACKING_DISABLED");

      const note = params.note?.trim() || null;
      // Foto-Pflicht — aber mit Ventil: wer unterwegs ist oder eine Waage ohne beleuchtete Anzeige
      // hat, meldet MIT NOTIZ und die Zeile bleibt beleglos (`imageUrl` null). Ein harter Riegel
      // ohne Ausweg erzeugt genau die Lücke, die er verhindern soll — nämlich gar keine Meldung.
      // Für die Keyholderin und die KI gilt sie nicht: die stehen nicht vor seiner Waage.
      if (params.source === "user" && !params.imageUrl && !note) throw fail("WEIGHT_PROOF_REQUIRED");

      const tz = user.timezone || APP_TZ;
      const dayKey = weightDayKey(params.measuredAt, tz);
      // Zum Erfassungs-Zeitpunkt festgeschrieben: die Fenster sind nicht historisiert, weil genau
      // dieses Feld die Frage später beantwortet, statt sie neu zu stellen.
      const inWindow = inWeighingWindow(user.weighingWindows, params.measuredAt, tz);

      // Bewusst Nachschlagen statt `upsert`: der Aufrufer soll dem Nutzer sagen können, dass er
      // einen bestehenden Wert ERSETZT hat. Ein `upsert` erledigt dasselbe in einer Abfrage,
      // verschweigt aber genau diese Unterscheidung — und „gespeichert" für ein stilles
      // Überschreiben ist die Meldung, die den Nutzer glauben lässt, er habe jetzt zwei Werte.
      const existing = await tx.weightEntry.findUnique({
        where: { userId_dayKey: { userId, dayKey } },
        select: { id: true },
      });

      const data = {
        dayKey,
        measuredAt: params.measuredAt,
        weightKg: params.weightKg,
        inWindow,
        imageUrl: params.imageUrl ?? null,
        imageExifTime: params.imageExifTime ?? null,
        detectedKg: params.detectedKg ?? null,
        note,
        source: params.source,
        createdById: params.createdById ?? null,
      };

      const row = existing
        ? await tx.weightEntry.update({
            where: { id: existing.id },
            // `version` treibt die OCC der MCP-Schreibwege — eine Korrektur ist eine neue Fassung.
            data: { ...data, version: { increment: 1 } },
            select: { id: true },
          })
        : await tx.weightEntry.create({ data: { userId, ...data }, select: { id: true } });

      return { id: row.id, dayKey, inWindow, replaced: !!existing };
    });
    return { ok: true, data: result };
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }
}

/** Die letzte Messung vor `before` — Grundlage der Sprung-Nachfrage im Formular.
 *
 *  Ohne eigenen Schalter-Check: die Freischaltung prüfen die Aufrufer, bevor sie überhaupt hierher
 *  kommen. Eine Lese-Funktion, die bei abgeschaltetem Feature still `null` liefert, wäre von „noch
 *  nie gewogen" nicht zu unterscheiden — und genau daran hinge dann die Sprung-Nachfrage. */
export async function lastWeightBefore(userId: string, before: Date): Promise<number | null> {
  const row = await prisma.weightEntry.findFirst({
    where: { userId, measuredAt: { lt: before } },
    orderBy: { measuredAt: "desc" },
    select: { weightKg: true },
  });
  return row?.weightKg ?? null;
}
