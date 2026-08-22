import { prisma } from "@/lib/prisma";
import {
  currentOffenseRules,
  isSwitchableOffenseType,
  isValidOffenseMode,
  offenseRuleResolver,
  type OffenseMode,
  type SwitchableOffenseType,
} from "@/lib/offenseRules";
import { serviceFail, type ServiceResult } from "@/lib/serviceResult";

/** Genau die Felder, die `OffenseRuleChangeRow` (offenseRules.ts) verlangt — einmal, damit die
 *  Lese- und die Schreib-Abfrage nicht getrennt voneinander veralten. */
/** Die drei Felder, die `offenseRuleResolver` liest — exportiert, weil ein zweiter Schreibpfad sie
 *  braucht: das Abschalten des Gewichtstrackings nimmt die Meldepflicht mit und liest dafür den
 *  geltenden Stand (`weightSettingsService.ts`). Eine zweite Kopie wäre die dritte im Umlauf. */
export const OFFENSE_RULE_CHANGE_SELECT = { offenseType: true, mode: true, effectiveFrom: true } as const;
const CHANGE_SELECT = OFFENSE_RULE_CHANGE_SELECT;

/** Die aktuell geltende Fassung aller schaltbaren Arten eines Subs — für die Einstellungs-Oberfläche
 *  und jede weitere Lesesicht. Abgeleitet aus der Änderungs-Historie, nicht aus einem Feld gelesen
 *  (Begründung in `offenseRules.ts`). */
export async function getOffenseRules(
  userId: string,
  now: Date = new Date(),
): Promise<Record<SwitchableOffenseType, OffenseMode>> {
  const changes = await prisma.offenseRuleChange.findMany({ where: { userId }, select: CHANGE_SELECT });
  return currentOffenseRules(changes, now);
}

export interface SetOffenseRuleParams {
  userId: string;
  /** Kanonischer Vergehenstyp — roh, der Service prüft ihn gegen `OFFENSE_RULE_MODES`. */
  offenseType: string;
  /** Modus — roh, muss für GENAU diese Art zulässig sein. */
  mode: string;
  /** Username dessen, der umlegt (Audit-Feld `OffenseRuleChange.changedBy`). */
  changedBy: string;
  /** Testbarkeit: der Stichtag, gegen den „gilt schon" geprüft und ab dem die neue Fassung greift. */
  now?: Date;
}

/**
 * Legt die Regel „zählt diese Vergehensart bei diesem Sub?" um — als NEUE Zeile, nie als Update.
 *
 * `effectiveFrom = jetzt`: die Änderung gilt ab sofort und lässt die Vergangenheit unangetastet
 * (Begründung in `offenseRules.ts`). Eine Zeile wird darum auch nie gelöscht oder überschrieben.
 *
 * Gilt der Modus bereits, wird NICHTS geschrieben: eine Historie soll Änderungen festhalten, nicht
 * jeden Klick. Ohne diese Prüfung füllte schon zweimaliges Umlegen hin und zurück die Tabelle mit
 * Zeilen, die nichts aussagen — und `changedBy` würde denjenigen nennen, der zuletzt bestätigt hat,
 * statt denjenigen, der tatsächlich geändert hat.
 */
export async function setOffenseRule(params: SetOffenseRuleParams): Promise<ServiceResult<null>> {
  const { userId, offenseType, mode, changedBy } = params;
  const now = params.now ?? new Date();

  if (!isSwitchableOffenseType(offenseType)) return serviceFail(400, "OFFENSE_TYPE_NOT_SWITCHABLE");
  if (!isValidOffenseMode(offenseType, mode)) return serviceFail(400, "OFFENSE_MODE_INVALID");

  // Nur die Zeilen DIESER Art — der Resolver gruppiert ohnehin je Art, und die Frage lautet allein,
  // was für sie gerade gilt. Über den Resolver statt über ein `findFirst` auf die jüngste Zeile:
  // eine unlesbare Zeile (Handeintrag, zurückgebaute Art) fällt dort auf die vorherige gültige
  // Fassung zurück, statt die Frage „gilt schon?" mit einem Wert zu beantworten, den niemand anwendet.
  const changes = await prisma.offenseRuleChange.findMany({
    where: { userId, offenseType },
    select: CHANGE_SELECT,
  });
  if (offenseRuleResolver(changes)(offenseType, now) === mode) return { ok: true, data: null };

  await prisma.offenseRuleChange.create({
    data: { userId, offenseType, mode, effectiveFrom: now, changedBy },
  });
  return { ok: true, data: null };
}
