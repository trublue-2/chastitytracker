import { prisma } from "@/lib/prisma";
import type { PrismaTx } from "@/lib/queries";

/** Stable slug for the built-in KG category — referenced by buildPairs gating, API
 *  validation, and admin UI to identify "the KG category" reliably regardless of name. */
export const KG_BUILTIN_SLUG = "kg";

/** Default visual identity for the built-in KG category (per UI Designer spec). */
const KG_BUILTIN_COLOR = "cat-steel";
const KG_BUILTIN_ICON = "Lock";

/**
 * Der Anzeigename der eingebauten Kategorie — der Wert, der beim Anlegen in die Datenbank geht.
 *
 * Hiess bis v6 „KG“ und damit genauso wie die Abkürzung, die die Oberfläche für den ganzen
 * Sachverhalt benutzt. Das fiel auf, weil `CategoryGoalsLive` diesen Namen unmittelbar NEBEN
 * Kategorien rendert, die der Nutzer selbst benannt hat: dort stand eine Abkürzung zwischen
 * ausgeschriebenen Wörtern.
 *
 * Warum „Chastity Device“ und nicht „Belt“ oder „Cage“: die Herleitung steht in
 * `docs/design/begriffe.md`, Kapitel 1. Kurz: das Unterscheidende dieser Kategorie ist nicht die
 * Bauform, sondern die Erfassung (`KG_ENTRY_TYPES` gegen `WEAR_ENTRY_TYPES`).
 *
 * **Der Wert ist eine VORGABE, kein fester Name.** Er steht als Datensatz in jeder Instanz und
 * ist vom Nutzer umbenennbar; die Migration `20260827080000_builtin_category_name` zieht ihn nur dort
 * nach, wo noch exakt „KG“ steht.
 */
export const KG_BUILTIN_NAME = "Chastity Device";

/** Die KG-Kategorie als Pillen-/Varianten-Eintrag — EINE Quelle für alle Umschalter (Tragekalender,
 *  Device-Nutzung), damit ein Re-Skin von KG nicht an drei Stellen nachgezogen werden muss.
 *
 *  ACHTUNG: `name` ist hier der VORGABE-Name, nicht der der Instanz. Diese Meta-Zeile beschreibt
 *  die Kategorie ohne Datenbank-Zugriff (Umschalter, Legenden); wo der Name eines konkreten
 *  Nutzers gemeint ist, muss er aus der `DeviceCategory`-Zeile kommen — sonst zeigt die Anzeige
 *  „Chastity Device“, während die Verwaltung den selbst gewählten Namen führt. */
export const KG_CATEGORY_META = {
  id: KG_BUILTIN_SLUG,
  name: KG_BUILTIN_NAME,
  color: KG_BUILTIN_COLOR,
  icon: KG_BUILTIN_ICON,
} as const;

/** Builds the deterministic ID used for KG built-in categories (matches the migration backfill).
 *  Stable across deploys so application code can reference KG without an extra query. */
export function kgCategoryId(userId: string): string {
  return `kgcat_${userId}`;
}

/** Idempotently creates the user's KG built-in category if missing.
 *  Uses an upsert by deterministic ID so concurrent calls and re-runs are safe.
 *  Call from every user-creation path (admin create, demo, seed). */
export async function ensureKgCategory(userId: string, tx?: PrismaTx): Promise<void> {
  const client = tx ?? prisma;
  await client.deviceCategory.upsert({
    where: { id: kgCategoryId(userId) },
    update: {},
    create: {
      id: kgCategoryId(userId),
      userId,
      name: KG_BUILTIN_NAME,
      slug: KG_BUILTIN_SLUG,
      color: KG_BUILTIN_COLOR,
      icon: KG_BUILTIN_ICON,
      isBuiltIn: true,
      trackingEnabled: true,
      sortOrder: 0,
    },
  });
}
