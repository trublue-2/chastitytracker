/**
 * Die Zeitzonen-Historie eines Trägers — dritter Nutzer von {@link effectiveAt} nach den
 * Reinigungs- und den Vergehens-Regeln.
 *
 * WARUM ES SIE BRAUCHT. Die Zone ist keine Regel der Keyholderin, aber sie entscheidet mit: ob eine
 * Reinigungsöffnung im erlaubten Fenster lag, und an welchem Kalendertag sie auf das Tageskontingent
 * zählte. Beides beantwortet das Strafbuch LIVE aus den Einträgen. Ohne Historie las es die HEUTIGE
 * Zone — eine Umstellung beurteilte damit rückwirkend die ganze Vergangenheit neu, und weil der
 * Träger die Zone selbst setzen darf, war das eine selbstbediente Neubeurteilung.
 *
 * Die Alternative wäre gewesen, das Ergebnis einzufrieren. Sie ist falsch: das Strafbuch ist bewusst
 * abgeleitet, damit ein nachgetragener oder korrigierter Eintrag alles Nachgelagerte von selbst
 * repariert. Eingefroren wird hier deshalb die EINGABE, nicht das Urteil — dieselbe Entscheidung wie
 * bei `cleaningRules.ts`.
 *
 * WO SIE NICHT GILT: alles, was JETZT beantwortet wird — „darf ich gerade öffnen", der Tagesplan der
 * Auto-Kontrollen, jede Anzeige. Dort ist die heutige Zone die richtige, und der Resolver hat nichts
 * verloren.
 */
import { prisma } from "@/lib/prisma";
import { APP_TZ, effectiveAt } from "@/lib/utils";
import { isValidTimezone } from "@/lib/timezones";

/** Eine Zeile aus `TimezoneChange` — genau die Felder, die der Resolver liest. */
export interface TimezoneChangeRow {
  timezone: string;
  effectiveFrom: Date;
}

/** Prisma-Select genau dieser Felder, damit Abfrage und Zeilentyp nicht getrennt veralten. */
export const TIMEZONE_CHANGE_SELECT = { timezone: true, effectiveFrom: true } as const;

/**
 * `effectiveFrom` der Grundzeile: die Ausgangszone gilt „seit jeher".
 *
 * Ein echter Zeitpunkt (etwa `User.createdAt`) wäre eine Behauptung, die niemand belegen kann, und
 * liesse eine Lücke, in die eine Öffnung fallen könnte. Gleiche Regel wie `CLEANING_RULES_EPOCH`.
 */
export const TIMEZONE_EPOCH = new Date(0);

/** Die für einen Zeitpunkt geltende Zone. */
export type TimezoneResolver = (at: Date) => string;

/** Der Resolver aus Historie + heutiger Zone. `current` ist nur so lange die richtige Antwort, wie
 *  es keine frühere Fassung gibt — sobald umgestellt wird, schreibt der Schreibpfad die Grundzeile mit. */
export function timezoneRulesFrom(
  changes: TimezoneChangeRow[],
  current: string | null | undefined,
): TimezoneResolver {
  const fallback = { timezone: current ?? APP_TZ };
  return (at) => effectiveAt(changes, at, fallback).timezone;
}

/** Ein Resolver, der überall dieselbe Zone liefert — für Aufrufer ohne Historie (Tests, Live-Sichten). */
export const fixedTimezone = (tz: string): TimezoneResolver => () => tz;

/**
 * Stellt die Zone um und hält die Umstellung fest — der einzige Schreibweg.
 *
 * Lesen, Historie schreiben und Spalte setzen in EINER Transaktion, aus demselben Grund wie bei
 * `setCleaningSettings`: bräche sie nach der Spalten-Änderung ab, stünde die neue Zone ohne Historie
 * da, und das Strafbuch beurteilte die Vergangenheit wieder nach dem heutigen Stand — also genau der
 * Fehler, gegen den die Tabelle gebaut ist.
 *
 * Eine Umstellung, die nichts bewegt, schreibt keine Zeile: eine Historie hält Änderungen fest, nicht
 * Klicks (gleiche Regel wie in `setCleaningSettings` und `setOffenseRule`).
 */
export async function setUserTimezone(
  userId: string,
  timezone: string,
  opts: { now?: Date; changedBy?: string | null } = {},
): Promise<void> {
  if (!isValidTimezone(timezone)) throw new Error(`invalid timezone: ${timezone}`);
  const now = opts.now ?? new Date();

  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const previous = before?.timezone ?? APP_TZ;
    if (previous !== timezone) {
      const hasHistory = await tx.timezoneChange.count({ where: { userId } }) > 0;
      await tx.timezoneChange.createMany({
        data: [
          // Die Ausgangszone hat niemand gesetzt — `changedBy` bleibt leer.
          ...(hasHistory ? [] : [{ userId, timezone: previous, effectiveFrom: TIMEZONE_EPOCH, changedBy: null }]),
          { userId, timezone, effectiveFrom: now, changedBy: opts.changedBy ?? null },
        ],
      });
    }
    await tx.user.update({ where: { id: userId }, data: { timezone } });
  });
}
