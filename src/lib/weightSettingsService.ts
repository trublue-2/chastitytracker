import { prisma } from "@/lib/prisma";
import { mapServiceError, serviceErrors, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { NO_FIELDS_TO_UPDATE } from "@/lib/constants";
import { weighingWindowsProblem, parseWeighingWindows } from "@/lib/weightWindows";
import {
  corridorProblem, heightProblem, isReferenceSex, isUnitSystem, keyholderCorridorProblem,
  HEIGHT_EPOCH, type Corridor, type ReferenceSex, type UnitSystem,
} from "@/lib/weight";

/**
 * Schreibpfad der Gewichts-Einstellungen. Zwei Türen, weil zwei Rollen verschiedene Felder setzen:
 *
 * - {@link setWeightSettingsSelf} — der Sub: Körpergrösse, Einheit, Referenzangabe, **sein**
 *   Zielkorridor
 * - {@link setWeightSettingsKeyholder} — die Keyholderin: Freischaltung, Wiege-Fenster, und ihre
 *   **Nachbesserung** des Korridors
 *
 * Die Trennung ist keine Kosmetik, sondern die Security-Regel aus `CLAUDE.md`: Felder, die der
 * Admin für einen Sub setzt, dürfen nicht über einen Session-Guard erreichbar sein. Zwei Funktionen
 * mit disjunkten Feldmengen machen ein Durchrutschen zum Compile-Fehler statt zu einer Frage der
 * Aufmerksamkeit.
 */

/** Was der Sub an sich selbst ändern darf. Jedes Feld einzeln optional — die Oberfläche schickt je
 *  Zeile einen eigenen PATCH, wie bei den Reinigungs-Einstellungen. */
export interface SelfWeightParams {
  heightCm?: unknown;
  /** `"correct"` schreibt die jüngste Historie-Zeile um („178 statt 187" war nie wahr),
   *  `"change"` legt eine neue an (echtes Wachstum). Vorgabe: `"change"`. */
  heightMode?: "correct" | "change";
  unitSystem?: unknown;
  referenceSex?: unknown;
  targetMinKg?: unknown;
  targetMaxKg?: unknown;
  changedBy?: string | null;
  now?: Date;
}

/** Was die Keyholderin am Sub setzt. */
export interface KeyholderWeightParams {
  enabled?: unknown;
  weighingWindows?: unknown;
  targetMinKeyholderKg?: unknown;
  targetMaxKeyholderKg?: unknown;
}

/**
 * Wurf- und Fang-Seite an EINER Tabelle: `fail()` akzeptiert nur Codes, die unten auch gemappt
 * werden — ein Tippfehler ist damit ein Compile-Fehler statt eines stillen 500. Die Schlüssel SIND
 * die Codes, die `corridorProblem`/`keyholderCorridorProblem` liefern, sodass ihr Ergebnis ohne
 * Übersetzungstabelle in `fail()` wandert.
 */
const { table: ERRORS, fail } = serviceErrors({
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND" },
  WEIGHT_OUT_OF_RANGE: { status: 400, error: "WEIGHT_OUT_OF_RANGE" },
  HEIGHT_OUT_OF_RANGE: { status: 400, error: "HEIGHT_OUT_OF_RANGE" },
  WEIGHT_CORRIDOR_INVERTED: { status: 400, error: "WEIGHT_CORRIDOR_INVERTED" },
  WEIGHT_CORRIDOR_NARROWER: { status: 400, error: "WEIGHT_CORRIDOR_NARROWER" },
});

/** Eine optionale Zahl aus dem Body: `null`/`""` löscht die Grenze, alles andere muss eine Zahl
 *  sein. `undefined` heisst „nicht mitgeschickt" und lässt die Spalte in Ruhe. */
function optionalNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Der Korridor, wie er nach dem Patch aussähe — ungesetzte Felder behalten den Bestand. */
function mergedCorridor(current: Corridor, min: number | null | undefined, max: number | null | undefined): Corridor {
  return {
    minKg: min === undefined ? current.minKg : min,
    maxKg: max === undefined ? current.maxKg : max,
  };
}

export async function setWeightSettingsSelf(userId: string, params: SelfWeightParams): Promise<ServiceResult<null>> {
  const data: {
    heightCm?: number; unitSystem?: UnitSystem; referenceSex?: ReferenceSex | null;
    targetMinKg?: number | null; targetMaxKg?: number | null;
  } = {};

  if (params.heightCm !== undefined) {
    const cm = Number(params.heightCm);
    const problem = heightProblem(cm);
    if (problem) return serviceFail(400, problem);
    data.heightCm = cm;
  }

  if (params.unitSystem !== undefined) {
    if (!isUnitSystem(params.unitSystem)) return serviceFail(400, "INVALID_UNIT_SYSTEM");
    data.unitSystem = params.unitSystem;
  }

  if (params.referenceSex !== undefined) {
    // Leer ist eine gültige Antwort: die Angabe wählt nur eine Referenztabelle aus, sie ist keine
    // Voraussetzung für irgendeine Rechnung.
    const raw = params.referenceSex === "" ? null : params.referenceSex;
    if (raw !== null && !isReferenceSex(raw)) return serviceFail(400, "INVALID_REFERENCE_SEX");
    data.referenceSex = raw;
  }

  const min = optionalNumber(params.targetMinKg);
  const max = optionalNumber(params.targetMaxKg);
  if (Number.isNaN(min) || Number.isNaN(max)) return serviceFail(400, "WEIGHT_OUT_OF_RANGE");

  if (Object.keys(data).length === 0 && min === undefined && max === undefined) {
    return serviceFail(400, NO_FIELDS_TO_UPDATE);
  }

  const now = params.now ?? new Date();

  // Lesen, prüfen und schreiben in EINER Transaktion — dieselbe Begründung wie bei
  // `setReinigungSettings`: die Oberfläche schickt je Feld einen eigenen PATCH, zwei davon können
  // sich überlappen. Ausserhalb der Transaktion sähen beide denselben Bestand und schrieben zwei
  // Grundzeilen in die Grössen-Historie.
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { heightCm: true, targetMinKg: true, targetMaxKg: true },
      });
      if (!before) throw fail("USER_NOT_FOUND");

      if (min !== undefined || max !== undefined) {
        const next = mergedCorridor({ minKg: before.targetMinKg, maxKg: before.targetMaxKg }, min, max);
        const problem = corridorProblem(next);
        if (problem) throw fail(problem);
        data.targetMinKg = next.minKg;
        data.targetMaxKg = next.maxKg;
      }

      // Grössen-Historie fortschreiben — nur bei einer echten Änderung. Ein Speichern, das nichts
      // bewegt, schreibt keine Zeile (dieselbe Regel wie in `setReinigungSettings`).
      if (data.heightCm !== undefined && data.heightCm !== before.heightCm) {
        const latest = await tx.heightChange.findFirst({
          where: { userId },
          orderBy: { effectiveFrom: "desc" },
          select: { id: true },
        });
        if (!latest) {
          // Die erste bekannte Grösse gilt „seit jeher" — davor gibt es nichts, was gegolten hätte.
          await tx.heightChange.create({
            data: { userId, heightCm: data.heightCm, effectiveFrom: HEIGHT_EPOCH, changedBy: params.changedBy ?? null },
          });
        } else if (params.heightMode === "correct") {
          // Eine Korrektur war nie wahr: sie ersetzt den Wert, statt einen Knick in die Kurve zu
          // legen. Ohne diese Unterscheidung wäre jeder Tippfehler ein dauerhaftes Ereignis.
          await tx.heightChange.update({
            data: { heightCm: data.heightCm, changedBy: params.changedBy ?? null },
            where: { id: latest.id },
          });
        } else {
          await tx.heightChange.create({
            data: { userId, heightCm: data.heightCm, effectiveFrom: now, changedBy: params.changedBy ?? null },
          });
        }
      }

      await tx.user.update({ where: { id: userId }, data });
    });
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  return { ok: true, data: null };
}

export async function setWeightSettingsKeyholder(
  userId: string,
  params: KeyholderWeightParams,
): Promise<ServiceResult<null>> {
  const data: {
    weightTrackingEnabled?: boolean; weighingWindows?: string;
    targetMinKeyholderKg?: number | null; targetMaxKeyholderKg?: number | null;
  } = {};

  if (params.enabled !== undefined) data.weightTrackingEnabled = Boolean(params.enabled);

  if (params.weighingWindows !== undefined) {
    const problem = weighingWindowsProblem(params.weighingWindows);
    if (problem) return serviceFail(400, problem);
    data.weighingWindows = JSON.stringify(parseWeighingWindows(params.weighingWindows));
  }

  const min = optionalNumber(params.targetMinKeyholderKg);
  const max = optionalNumber(params.targetMaxKeyholderKg);
  if (Number.isNaN(min) || Number.isNaN(max)) return serviceFail(400, "WEIGHT_OUT_OF_RANGE");

  if (Object.keys(data).length === 0 && min === undefined && max === undefined) {
    return serviceFail(400, NO_FIELDS_TO_UPDATE);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: {
          targetMinKg: true, targetMaxKg: true,
          targetMinKeyholderKg: true, targetMaxKeyholderKg: true,
        },
      });
      if (!before) throw fail("USER_NOT_FOUND");

      if (min !== undefined || max !== undefined) {
        const next = mergedCorridor(
          { minKg: before.targetMinKeyholderKg, maxKg: before.targetMaxKeyholderKg }, min, max,
        );
        // Die Regel des Nutzers: „ich wiege 90 und möchte 84 — dann kann die KH keine 80 daraus
        // machen, aber 87." Abgewiesen wird mit Begründung, nicht still ignoriert: die Keyholderin
        // soll sehen, warum ihre Zahl nicht durchgeht.
        const problem = keyholderCorridorProblem({ minKg: before.targetMinKg, maxKg: before.targetMaxKg }, next);
        if (problem) throw fail(problem);
        data.targetMinKeyholderKg = next.minKg;
        data.targetMaxKeyholderKg = next.maxKg;
      }

      await tx.user.update({ where: { id: userId }, data });
    });
  } catch (e) {
    const code = (e as Error).message;
    if (code === "USER_NOT_FOUND") return serviceFail(404, "USER_NOT_FOUND");
    if (code === "WEIGHT_CORRIDOR_NARROWER" || code === "WEIGHT_CORRIDOR_INVERTED" || code === "WEIGHT_OUT_OF_RANGE") {
      return serviceFail(400, code);
    }
    throw e;
  }

  return { ok: true, data: null };
}
