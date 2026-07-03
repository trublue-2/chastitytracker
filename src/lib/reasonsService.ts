import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ORGASMUS_ARTEN,
  OEFFNEN_GRUENDE,
  ORGASMUS_ART_I18N_KEYS,
  GRUND_I18N_KEYS,
  parseOrgasmusArtBase,
  orgasmusArtLabel,
  ART_SEP,
} from "@/lib/constants";

// ART_SEP ist die zentrale Konstante in constants.ts (K4); hier re-exportiert für bestehende Importeure.
export { ART_SEP };

/** Zerlegt einen Orgasmus-Text (`Hauptart – Unterart` oder blanke Hauptart) am kanonischen Trennzeichen. */
export function splitOrgasmusArt(text: string): { mainToken: string; subLabel: string } {
  const sepAt = text.indexOf(ART_SEP);
  return sepAt === -1
    ? { mainToken: text, subLabel: "" }
    : { mainToken: text.slice(0, sepAt), subLabel: text.slice(sepAt + ART_SEP.length) };
}
/**
 * Eingebaute Orgasmus-Standardliste als volle Kombinationen (Hauptart + Unterart) — bewahrt die
 * bisherigen Unterarten. Codes = diese Strings (bestehende Einträge matchen weiterhin). Text VOR
 * dem Trennzeichen = Hauptart, danach = Unterart.
 */
export const DEFAULT_ORGASM_ARTEN = [
  `Orgasmus${ART_SEP}Masturbation`,
  `Orgasmus${ART_SEP}Geschlechtsverkehr`,
  `Orgasmus${ART_SEP}durch andere Person`,
  `Orgasmus${ART_SEP}durch Technik`,
  "ruinierter Orgasmus",
  "feuchter Traum",
] as const;

/**
 * Per-User anpassbare Auswahllisten (Orgasmus-Arten + Öffnungsgründe). Jede Liste ist ein geordnetes
 * Array `{code,label?}` als JSON-String auf dem User gespeichert. `null`/leer = eingebaute Standardliste
 * (Bestandsnutzer byte-identisch). `code` = stabile, in `Entry` gespeicherte Identität; `label` =
 * optionaler Anzeige-Override (fehlt → Built-in-i18n → roher Code). Der Öffnungsgrund `REINIGUNG` ist
 * ein geschützter Built-in: sein Code ist fix, er ist nie entfernbar (Re-Injektion beim Speichern);
 * nur sein Label ist umbenennbar. Die gesamte Reinigungs-Logik keyt weiter auf `oeffnenGrund === "REINIGUNG"`.
 */

export type ReasonKind = "orgasm" | "opening";
export interface ReasonEntry { code: string; label?: string }
/** Anzeigefertiger Eintrag (Label bereits aufgelöst) für Select-Optionen und Zeilen. */
export interface ResolvedReason { code: string; label: string }

const MAX_ENTRIES = 12;
const LABEL_MAX = 40;
/** Öffnungsgrund, an dem echte Logik hängt — immer vorhanden, Code eingefroren. */
export const PROTECTED_OPENING_CODE = "REINIGUNG";
/** Custom-Codes folgen diesem Muster (server-generiert). */
const CUSTOM_CODE_RE = /^c_[0-9a-f]{8,}$/;
/** Steuerzeichen (C0 + DEL), die aus Labels entfernt werden. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp("[\u0000-\u001F\u007F]", "g");

function reservedCodes(kind: ReasonKind): readonly string[] {
  // Orgasmus: sowohl die Kombinations-Codes (Standardliste) als auch die blanken Hauptarten gelten
  // als stabile Built-in-Codes (Backward-Compat mit Alt-Einträgen ohne Unterart).
  return kind === "orgasm" ? [...DEFAULT_ORGASM_ARTEN, ...ORGASMUS_ARTEN] : OEFFNEN_GRUENDE;
}

/** Trennzeichen-Normalisierung für Orgasmus-Labels: `–` sowie umleertes `-` → kanonisches ` – `.
 *  `/` und `|` bleiben bewusst Literale (kämen in echten Labels vor, z.B. „Partner/Partnerin"). */
const SEP_RE = /\s*–\s*|\s+-\s+/g;
function normalizeSeparators(s: string): string {
  return s.replace(SEP_RE, ART_SEP);
}

function builtinI18nKey(code: string, kind: ReasonKind): string | undefined {
  return kind === "orgasm" ? ORGASMUS_ART_I18N_KEYS[code] : (GRUND_I18N_KEYS as Record<string, string>)[code];
}

/** Eingebaute Standardliste (bei `null`-Config) — Codes = Konstanten, kein Label-Override. */
function defaultConfig(kind: ReasonKind): ReasonEntry[] {
  const codes = kind === "orgasm" ? DEFAULT_ORGASM_ARTEN : OEFFNEN_GRUENDE;
  return codes.map((code) => ({ code }));
}

/** Trimmt/entfernt Steuerzeichen, normalisiert (bei Orgasmus) Trennzeichen, kappt auf LABEL_MAX; leer → undefined. */
function sanitizeLabel(raw: unknown, kind: ReasonKind): string | undefined {
  if (typeof raw !== "string") return undefined;
  let clean = raw.replace(CONTROL_CHARS_RE, "");
  if (kind === "orgasm") clean = normalizeSeparators(clean);
  clean = clean.trim().slice(0, LABEL_MAX);
  return clean.length > 0 ? clean : undefined;
}

/** Kollisionsfreier Custom-Code `c_<hex>` (nie ein reservierter Built-in-Code). */
export function generateReasonCode(existing: Set<string>, kind: ReasonKind): string {
  const reserved = new Set(reservedCodes(kind));
  for (;;) {
    const code = `c_${crypto.randomBytes(5).toString("hex")}`;
    if (!existing.has(code) && !reserved.has(code)) return code;
  }
}

/**
 * Parst + normalisiert eine Reason-Config tolerant (JSON-String ODER Array; Müll → Standardliste):
 * sanitisiert Labels, dedupliziert nach Code, kappt auf MAX_ENTRIES. Bestehende Codes bleiben stabil
 * (reservierte Built-ins + Custom-Codes im `c_`-Muster); Zeilen ohne gültigen Code bekommen einen frisch
 * generierten. Für `kind==="opening"` wird REINIGUNG garantiert (Label erhalten, sonst re-injiziert).
 */
export function parseReasonConfig(raw: unknown, kind: ReasonKind): ReasonEntry[] {
  if (raw == null) return defaultConfig(kind);

  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return defaultConfig(kind); }
  }
  if (!Array.isArray(arr)) return defaultConfig(kind);

  const reserved = new Set(reservedCodes(kind));
  const used = new Set<string>();
  const out: ReasonEntry[] = [];

  for (const item of arr) {
    if (out.length >= MAX_ENTRIES) break;
    const rawCode = (item as { code?: unknown })?.code;
    const label = sanitizeLabel((item as { label?: unknown })?.label, kind);
    // Code übernehmen, wenn reserviert ODER gültiges Custom-Muster; sonst frisch generieren.
    const code = typeof rawCode === "string" && (reserved.has(rawCode) || CUSTOM_CODE_RE.test(rawCode))
      ? rawCode
      : generateReasonCode(used, kind);
    if (used.has(code)) continue; // Dedup (erster gewinnt)
    used.add(code);
    out.push(label ? { code, label } : { code });
  }

  // REINIGUNG-Invariante: für Öffnungsgründe immer vorhanden (Label erhalten, sonst vorne re-injizieren).
  if (kind === "opening" && !used.has(PROTECTED_OPENING_CODE)) {
    out.unshift({ code: PROTECTED_OPENING_CODE });
  }

  return out.length > 0 ? out : defaultConfig(kind);
}

/** Built-in-Hauptart → ihre Standard-Unterart-Kombis (nur Hauptarten, die überhaupt Unterarten haben). */
const ORGASM_MAIN_WITH_SUBS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const code of DEFAULT_ORGASM_ARTEN) {
    const sepAt = code.indexOf(ART_SEP);
    if (sepAt === -1) continue;
    (m[code.slice(0, sepAt)] ??= []).push(code);
  }
  return m;
})();

/**
 * Einmalige DB-Migration für gespeicherte `orgasmusArtenConfig`: expandiert eine blanke
 * Built-in-Hauptart MIT Standard-Unterarten (z.B. `Orgasmus`) und OHNE Custom-Label in ihre
 * Kombis (`Orgasmus – …`) — damit die Unterarten wieder als volle Codes in der DB stehen und im
 * Formular als abhängiges Dropdown erscheinen. Nötig für Configs, die vor der Unterarten-Version
 * gespeichert wurden (nur Hauptarten). Idempotent: bereits expandierte / rein custom / `null`
 * Configs bleiben unverändert. Rückgabe: neuer JSON-String bei Änderung, sonst `null` (nichts zu tun).
 */
export function backfillOrgasmusArtenConfig(raw: unknown): string | null {
  if (raw == null) return null;
  let arr: unknown = raw;
  if (typeof raw === "string") { try { arr = JSON.parse(raw); } catch { return null; } }
  if (!Array.isArray(arr)) return null;

  const seen = new Set<string>();
  const out: ReasonEntry[] = [];
  let changed = false;
  for (const item of arr) {
    const code = (item as { code?: unknown })?.code;
    const rawLabel = (item as { label?: unknown })?.label;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    if (typeof code === "string" && !label && ORGASM_MAIN_WITH_SUBS[code]) {
      for (const combo of ORGASM_MAIN_WITH_SUBS[code]) {
        if (!seen.has(combo)) { seen.add(combo); out.push({ code: combo }); }
      }
      changed = true;
      continue;
    }
    if (typeof code === "string" && !seen.has(code)) {
      seen.add(code);
      out.push(label ? { code, label } : { code });
    }
  }
  return changed ? JSON.stringify(out) : null;
}

export function effectiveOrgasmusArten(cfgRaw: unknown): ReasonEntry[] {
  return parseReasonConfig(cfgRaw, "orgasm");
}
export function effectiveOeffnenGruende(cfgRaw: unknown): ReasonEntry[] {
  return parseReasonConfig(cfgRaw, "opening");
}

/** Menge der für diesen User gültigen Öffnungsgründe-Codes (Built-ins bei `null`) — für die Validierung.
 *  (Orgasmus nutzt `orgasmusValueAllowed`, weil dort auch blanke Hauptarten gültig sind.) */
export function validOeffnenCodes(cfgRaw: unknown): Set<string> {
  return new Set(effectiveOeffnenGruende(cfgRaw).map((e) => e.code));
}

/** Anzeige-Label eines Codes: Custom-Label → Built-in-i18n → roher Code (wirft nie). */
export function resolveReasonLabel(
  code: string,
  cfg: ReasonEntry[],
  kind: ReasonKind,
  t: (key: string) => string,
): string {
  const entry = cfg.find((e) => e.code === code);
  if (entry?.label) return entry.label;
  const key = builtinI18nKey(code, kind);
  return key ? t(key) : code;
}

/** Anzeige-Label eines gespeicherten `orgasmusArt` (Basis-Code plus optionalem " – Detail"-Suffix):
 *  löst die Basis über die Config auf und hängt das Detail unverändert wieder an. `null`/leer → null. */
export function resolveOrgasmusArtDisplay(
  orgasmusArt: string | null | undefined,
  cfg: ReasonEntry[],
  t: (key: string) => string,
): string | null {
  if (!orgasmusArt) return null;
  // Voller Code zuerst: eine umbenannte Kombi- oder Custom-Art trägt ihr Label am VOLLEN Code
  // (z.B. `{code:"Orgasmus – Masturbation", label:"Höhepunkt"}`) — sonst würde die Basis-Auflösung
  // („Orgasmus") das Override ignorieren.
  const full = cfg.find((e) => e.code === orgasmusArt);
  if (full?.label) return full.label;
  const base = parseOrgasmusArtBase(orgasmusArt);
  if (!base) return orgasmusArt;
  const baseLabel = resolveReasonLabel(base, cfg, "orgasm", t);
  const detail = orgasmusArt.slice(base.length);
  return baseLabel + detail;
}

/** Haupt-Token (Text vor ` – `) eines Orgasmus-Eintrags — stabile Identität für Kaskade-Gruppierung
 *  und den „keine Unterart"-Fall. Für Kombi-Codes aus dem Code, sonst aus dem Custom-Label. */
export function orgasmMainToken(e: ReasonEntry): string {
  return (e.label ?? e.code).split(ART_SEP)[0];
}

/** Gültiger gespeicherter `orgasmusArt`-Wert? Erlaubt sind alle vollen Codes der Liste UND alle
 *  Haupt-Tokens (Wahl nur der Hauptart ohne Unterart / „keine Angabe"). `null`-Config → Standardliste. */
export function orgasmusValueAllowed(value: string, cfgRaw: unknown): boolean {
  const cfg = effectiveOrgasmusArten(cfgRaw);
  return cfg.some((e) => e.code === value) || cfg.some((e) => orgasmMainToken(e) === value);
}

/** Eine Auswahl-Option fürs abhängige Orgasmus-Dropdown: stabiler Wert (`code` bei Unterart, sonst
 *  `mainToken`), plus aufgelöste Anzeige-Labels für Haupt- und Unterart. */
export interface OrgasmusOption { code: string; mainToken: string; mainLabel: string; subLabel: string }

/** Löst die Orgasmus-Config in Kaskaden-Optionen auf: Haupt-Label (Built-in übersetzt, Override roh)
 *  + Unterart-Label (roh; leer wenn keine Unterart). Der Sub baut daraus die zwei abhängigen Dropdowns. */
export function resolveOrgasmusOptions(cfg: ReasonEntry[], t: (key: string) => string): OrgasmusOption[] {
  return cfg.map((e) => {
    const { mainToken, subLabel } = splitOrgasmusArt(e.label ?? e.code);
    // Hauptart-Anzeige: Override roh übernehmen, sonst Built-in-i18n der Hauptart.
    const mainLabel = e.label ? mainToken : orgasmusArtLabel(mainToken, t);
    return { code: e.code, mainToken, mainLabel, subLabel };
  });
}

/** Löst eine ganze Config zu anzeigefertigen `{code,label}` auf (Select-Optionen + Zeilen). */
export function resolveReasonList(
  cfg: ReasonEntry[],
  kind: ReasonKind,
  t: (key: string) => string,
): ResolvedReason[] {
  return cfg.map((e) => ({ code: e.code, label: resolveReasonLabel(e.code, cfg, kind, t) }));
}

/** Speichert eine Reason-Config (validiert/normalisiert via parseReasonConfig). Geteilt von der
 *  PATCH-Route. Für Öffnungsgründe ist REINIGUNG nach der Normalisierung garantiert enthalten. Gibt die
 *  normalisierte Liste zurück (u.a. server-generierte Custom-Codes) — der Editor re-seedet damit, sonst
 *  bekämen neu angelegte Zeilen bei jedem weiteren Speichern erneut einen Code (Duplikate). */
export async function setReasonConfig(userId: string, kind: ReasonKind, raw: unknown): Promise<ReasonEntry[]> {
  const normalized = parseReasonConfig(raw, kind);
  const field = kind === "orgasm" ? "orgasmusArtenConfig" : "oeffnenGruendeConfig";
  await prisma.user.update({ where: { id: userId }, data: { [field]: JSON.stringify(normalized) } });
  return normalized;
}
