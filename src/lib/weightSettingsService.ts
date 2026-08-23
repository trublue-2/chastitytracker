import { prisma } from "@/lib/prisma";
import { mapServiceError, serviceErrors, serviceFail, type ServiceResult } from "@/lib/serviceResult";
import { NO_FIELDS_TO_UPDATE } from "@/lib/constants";
import { weighingWindowsProblem, parseWeighingWindows } from "@/lib/weightWindows";
import { WEIGHT_USER_SELECT } from "@/lib/weightService";
import { OFFENSE_RULE_CHANGE_SELECT } from "@/lib/offenseRulesService";
import { offenseRuleResolver } from "@/lib/offenseRules";
import { heightProblem, isUnitSystem, weightProblem, HEIGHT_EPOCH, type UnitSystem } from "@/lib/weight";

/**
 * Schreibpfad der Gewichts-Einstellungen. Zwei Türen, weil zwei Rollen verschiedene Felder setzen:
 *
 * - {@link setWeightSettingsSelf} — der Sub: Körpergrösse, Einheit, **sein** Zielgewicht
 * - {@link setWeightSettingsKeyholder} — die Keyholderin: Freischaltung, Wiege-Fenster und **ihr**
 *   Zielgewicht (das wirksame, solange sie eines führt)
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
  unitSystem?: unknown;
  /** `null`/`""` nimmt das Ziel zurück. */
  targetWeightKg?: unknown;
  changedBy?: string | null;
  now?: Date;
}

/** Was die Keyholderin am Sub setzt. */
export interface KeyholderWeightParams {
  enabled?: unknown;
  /** Username der Keyholderin — landet in der Regel-Historie, wenn das Abschalten die Meldepflicht
   *  mitnimmt. */
  changedBy?: string | null;
  now?: Date;
  weighingWindows?: unknown;
  /** `null`/`""` nimmt ihr Ziel zurück — dann gilt wieder das des Trägers. */
  targetWeightKeyholderKg?: unknown;
}

/**
 * Wurf- und Fang-Seite an EINER Tabelle: `fail()` akzeptiert nur Codes, die unten auch gemappt
 * werden — ein Tippfehler ist damit ein Compile-Fehler statt eines stillen 500. Die Schlüssel SIND
 * die Codes, die `weightProblem`/`heightProblem` liefern, sodass ihr Ergebnis ohne
 * Übersetzungstabelle in `fail()` wandert.
 */
const { table: ERRORS, fail } = serviceErrors({
  USER_NOT_FOUND: { status: 404, error: "USER_NOT_FOUND" },
  WEIGHT_OUT_OF_RANGE: { status: 400, error: "WEIGHT_OUT_OF_RANGE" },
  HEIGHT_OUT_OF_RANGE: { status: 400, error: "HEIGHT_OUT_OF_RANGE" },
});

/** Eine optionale Zahl aus dem Body: `null`/`""` löscht die Grenze, alles andere muss eine Zahl
 *  sein. `undefined` heisst „nicht mitgeschickt" und lässt die Spalte in Ruhe. */
function optionalNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Was ein Ziel-Wechsel an Feldern schreibt — `undefined`, wenn sich nichts bewegt.
 *
 * **Der Zeitstempel bewegt sich nur bei einer echten Änderung.** An ihm hängt der Startwert des
 * Fortschritts; ein Speichern, das dieselbe Zahl noch einmal schreibt, würde den Bezugspunkt sonst
 * auf heute ziehen und die bereits geschaffte Strecke aus der Rechnung nehmen.
 *
 * Modul-privat: beide Schreibwege — Oberfläche wie MCP (`set_weight_tracking`) — kommen über
 * {@link setWeightSettingsKeyholder} bzw. {@link setWeightSettingsSelf} hierher.
 */
function targetPatch(
  current: number | null, next: number | null, now: Date,
): { kg: number | null; setAt: Date | null } | undefined {
  if (next === current) return undefined;
  return { kg: next, setAt: next === null ? null : now };
}

export async function setWeightSettingsSelf(userId: string, params: SelfWeightParams): Promise<ServiceResult<null>> {
  const data: {
    heightCm?: number; unitSystem?: UnitSystem;
    targetWeightKg?: number | null; targetWeightSetAt?: Date | null;
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

  // `weightProblem` fängt NaN selbst ab (`!Number.isFinite`) — eine eigene isNaN-Zeile davor wäre
  // dieselbe Prüfung mit demselben Code.
  const target = optionalNumber(params.targetWeightKg);
  if (typeof target === "number" || Number.isNaN(target)) {
    const problem = weightProblem(target);
    if (problem) return serviceFail(400, problem);
  }

  if (Object.keys(data).length === 0 && target === undefined) {
    return serviceFail(400, NO_FIELDS_TO_UPDATE);
  }

  const now = params.now ?? new Date();

  // Lesen, prüfen und schreiben in EINER Transaktion — dieselbe Begründung wie bei
  // `setReinigungSettings`: die Oberfläche schickt je Feld einen eigenen PATCH, zwei davon können
  // sich überlappen. Ausserhalb der Transaktion sähen beide denselben Bestand und schrieben zwei
  // Grundzeilen in die Grössen-Historie.
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT });
      if (!before) throw fail("USER_NOT_FOUND");

      const patch = target === undefined ? undefined : targetPatch(before.targetWeightKg, target, now);
      if (patch) {
        data.targetWeightKg = patch.kg;
        data.targetWeightSetAt = patch.setAt;
      }

      // Grössen-Protokoll fortschreiben — nur bei einer echten Änderung, und IMMER als neue Zeile:
      // die Rückfrage „Korrektur oder Änderung?" ist gestrichen, weil der Wert nirgends historisch
      // gelesen wird (Begründung: docs/gewicht-konzept.md, Abschnitt 3.2).
      //
      // `before.heightCm === null` erkennt die erste Zeile ohne zweite Abfrage: diese Funktion ist
      // der EINZIGE Schreiber von `User.heightCm`, und die Tabelle kam leer aus der Migration —
      // keine Grösse heisst also kein Protokoll. Ein `count` auf der Tabelle wäre nicht nur ein
      // Roundtrip mehr, sondern im Ausnahmefall auch falsch: gäbe es je eine Grösse ohne Zeile,
      // stempelte er den NEUEN Wert als „seit jeher" und behauptete damit, der alte habe nie gegolten.
      if (data.heightCm !== undefined && data.heightCm !== before.heightCm) {
        await tx.heightChange.create({
          data: {
            userId,
            heightCm: data.heightCm,
            // Die erste bekannte Grösse gilt „seit jeher" — davor gibt es nichts, was gegolten hätte.
            effectiveFrom: before.heightCm === null ? HEIGHT_EPOCH : now,
            changedBy: params.changedBy ?? null,
          },
        });
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
  const now = params.now ?? new Date();
  const data: {
    weightTrackingEnabled?: boolean; weighingWindows?: string;
    targetWeightKeyholderKg?: number | null; targetWeightKeyholderSetAt?: Date | null;
  } = {};

  if (params.enabled !== undefined) data.weightTrackingEnabled = Boolean(params.enabled);

  if (params.weighingWindows !== undefined) {
    const problem = weighingWindowsProblem(params.weighingWindows);
    if (problem) return serviceFail(400, problem.code);
    data.weighingWindows = JSON.stringify(parseWeighingWindows(params.weighingWindows));
  }

  const target = optionalNumber(params.targetWeightKeyholderKg);
  if (typeof target === "number" || Number.isNaN(target)) {
    const problem = weightProblem(target);
    if (problem) return serviceFail(400, problem);
  }

  if (Object.keys(data).length === 0 && target === undefined) {
    return serviceFail(400, NO_FIELDS_TO_UPDATE);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: WEIGHT_USER_SELECT });
      if (!before) throw fail("USER_NOT_FOUND");

      // Kein Vergleich mit dem Ziel des Trägers: sie darf ihres frei setzen, und ihres gilt. Seines
      // bleibt daneben stehen, damit beide sehen, worüber sie sich einig sind.
      const patch = target === undefined ? undefined : targetPatch(before.targetWeightKeyholderKg, target, now);
      if (patch) {
        data.targetWeightKeyholderKg = patch.kg;
        data.targetWeightKeyholderSetAt = patch.setAt;
      }

      await tx.user.update({ where: { id: userId }, data });

      // ABSCHALTEN NIMMT DIE MELDEPFLICHT MIT.
      //
      // Das Strafbuch leitet das Versäumnis LIVE aus den Lücken zwischen den erfassten Tagen ab.
      // Bliebe die Vergehensregel scharf, während der Träger nichts mehr eintragen kann, zählte
      // jeder Tag der Aus-Zeit als versäumte Meldung — für etwas, das ihm die App verwehrt.
      //
      // In derselben Transaktion wie das Umlegen des Schalters: bräche es dazwischen ab, stünde
      // genau dieser Zustand da. Und als eigene Historie-Zeile statt als stiller Sonderfall in der
      // Ableitung, damit die Vergangenheit unangetastet bleibt — was vor dem Ausschalten versäumt
      // wurde, bleibt versäumt.
      //
      // Der Weg zurück ist bewusst NICHT automatisch: wer das Feature wieder einschaltet, hat damit
      // noch keine Meldepflicht bestellt. Sie ist ein eigener Schalter und bleibt einer.
      if (data.weightTrackingEnabled === false) {
        const changes = await tx.offenseRuleChange.findMany({
          where: { userId, offenseType: "missed_weight_report" },
          select: OFFENSE_RULE_CHANGE_SELECT,
        });
        if (offenseRuleResolver(changes)("missed_weight_report", now) !== "off") {
          await tx.offenseRuleChange.create({
            data: {
              userId, offenseType: "missed_weight_report", mode: "off",
              effectiveFrom: now, changedBy: params.changedBy ?? "system",
            },
          });
        }
      }
    });
  } catch (e) {
    const mapped = mapServiceError(e, ERRORS);
    if (mapped) return mapped;
    throw e;
  }

  return { ok: true, data: null };
}
