import type { CleaningUserFields } from "@/lib/cleaningService";
import type { CleaningPermissionUser } from "@/lib/queries";
import { effectiveAt, type CleaningPauseAllowance } from "@/lib/utils";

/**
 * Der vollständige Reinigungs-Stand eines Subs zu EINEM Zeitpunkt — die vier Werte, die darüber
 * entscheiden, ob eine Reinigungsöffnung erlaubt war und ab wann sie zu viel oder zu lang wurde.
 *
 * Vollständig und nicht als Delta, weil die Frage immer für einen Zeitpunkt gestellt wird: „was galt
 * am 13.08. um 09:41". Ein Delta müsste die Antwort erst wieder über die ganze Historie
 * zusammensetzen — an jeder Aufrufstelle.
 */
export interface CleaningSettings extends CleaningPauseAllowance {
  /** 0 = unbegrenzt (der Spalten-Default), siehe `maxPausesPerDaySentinel`. */
  maxPerDay: number;
  /** Roh wie `User.cleaningWindows`: JSON-String oder null. Die Leser parsen selbst
   *  (`parseCleaningWindows`, `cleaningWindowOpen`) — hier wird nichts vorverdaut, damit die
   *  gespeicherte Zeile bitgleich das ist, was die Spalte trug. */
  windows: string | null;
}

/** Eine Zeile aus `CleaningRuleChange` — genau die Felder, die der Resolver liest. */
export interface CleaningRuleChangeRow extends CleaningSettings {
  effectiveFrom: Date;
}

/** Prisma-Select genau dieser Felder — eine Konstante für jeden Leser der Historie, damit Abfrage
 *  und Zeilentyp nicht getrennt voneinander veralten (Vorbild: `CHANGE_SELECT` in
 *  `offenseRulesService.ts`). Kein `orderBy`: der Resolver sortiert selbst. */
export const CLEANING_RULE_CHANGE_SELECT = {
  allowed: true, maxMinutes: true, maxPerDay: true, windows: true, effectiveFrom: true,
} as const;

/** Die für einen Zeitpunkt geltende Fassung. */
export type CleaningSettingsResolver = (at: Date) => CleaningSettings;

/**
 * `effectiveFrom` der Grundzeile: der Ausgangsstand gilt „seit jeher".
 *
 * Ein echter Zeitpunkt (etwa `User.createdAt`) wäre eine Behauptung, die niemand belegen kann — vor
 * der ersten Änderung ist bloss bekannt, DASS diese Werte galten, nicht seit wann. Epoch sagt genau
 * das und lässt keine Lücke, in die eine Öffnung fallen könnte.
 */
export const CLEANING_RULES_EPOCH = new Date(0);

/** Der heutige Stand aus den User-Spalten — die Ausweichantwort des Resolvers und zugleich das, was
 *  der Schreibpfad als Grundzeile festhält. Die Fallbacks sind dieselben wie in
 *  `buildCleaningView`: fehlt die Spalte, gilt der Spalten-Default. */
export function cleaningSettingsFromUser(user: Partial<CleaningUserFields> | null | undefined): CleaningSettings {
  return {
    allowed: user?.cleaningAllowed ?? false,
    maxMinutes: user?.cleaningMaxMinutes ?? 15,
    maxPerDay: user?.cleaningMaxPerDay ?? 0,
    windows: normalizeWindows(user?.cleaningWindows),
  };
}

/** Die Fenster als das, was in der Spalte steht: ein JSON-String. Aus der DB kommt genau der; eine
 *  bereits geparste Liste (In-Memory-Aufrufer, Tests) wird zurückverwandelt, statt sie zu verwerfen —
 *  `parseCleaningWindows` auf der Lese-Seite nimmt beides, der Vergleich zweier Fassungen und die
 *  TEXT-Spalte der Historie brauchen aber eine Form. */
function normalizeWindows(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/** True, wenn sich an den vier Werten überhaupt etwas ändert — der Schreibpfad legt sonst keine
 *  Zeile an (dieselbe Regel wie `setOffenseRule`: eine Historie hält Änderungen fest, nicht Klicks). */
export function cleaningSettingsEqual(a: CleaningSettings, b: CleaningSettings): boolean {
  return a.allowed === b.allowed && a.maxMinutes === b.maxMinutes
    && a.maxPerDay === b.maxPerDay && a.windows === b.windows;
}

/**
 * Der Resolver aus Historie + heutigem Stand — die eine Zusammensetzung, die jeder Leser braucht.
 *
 * `current` (die User-Spalten) ist nur so lange die richtige Antwort, wie es keine frühere Fassung
 * gibt: sobald geändert wird, schreibt der Schreibpfad die Grundzeile mit (siehe
 * {@link CLEANING_RULES_EPOCH}), und die Vergangenheit landet nicht mehr dort.
 */
export function cleaningRulesFrom(
  changes: CleaningRuleChangeRow[],
  user: Partial<CleaningUserFields> | null | undefined,
): CleaningSettingsResolver {
  return cleaningSettingsResolver(changes, cleaningSettingsFromUser(user));
}

/** Wie {@link cleaningRulesFrom}, nur mit schon aufbereitetem Ausgangsstand — für Tests und
 *  Aufrufer, die den heutigen Stand nicht aus einer User-Zeile haben. */
export function cleaningSettingsResolver(
  changes: CleaningRuleChangeRow[],
  current: CleaningSettings,
): CleaningSettingsResolver {
  return (at) => effectiveAt(changes, at, current);
}

/**
 * Der Resolver in der Form, die das Session-Modell versteht (`CleaningRules` in `utils.ts`).
 *
 * Zwei Formen, weil zwei Schichten: die Historie führt alle vier Werte, `buildPairs` interessieren
 * nur „erlaubt" und die Höchstdauer. Die Umrechnung steht hier statt an jeder Lade-Stelle.
 */
export function cleaningRulesAt(resolve: CleaningSettingsResolver): (at: Date) => CleaningPauseAllowance {
  return (at) => {
    const s = resolve(at);
    return { allowed: s.allowed, maxMinutes: s.maxMinutes };
  };
}

/**
 * Die drei Felder, die `cleaningBlockReason` prüft, in der Fassung von `at`.
 *
 * Geteilt von Strafbuch und Dashboard, weil beide dieselbe Frist derselben Pause beantworten — das
 * Dashboard als Countdown, das Strafbuch als Vergehen. Nahmen sie die Felder aus verschiedenen
 * Fassungen (Erlaubnis von damals, Fenster von heute), liefen die beiden Antworten auseinander.
 * Die Zeitzone gehört nicht dazu: sie ist eine Eigenschaft des Subs, keine Regel der Keyholderin.
 */
export function cleaningPermissionUserAt(settings: CleaningSettings, timezone: string): CleaningPermissionUser {
  return { cleaningAllowed: settings.allowed, cleaningWindows: settings.windows, timezone };
}
