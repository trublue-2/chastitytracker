import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import type { ServiceResult } from "@/lib/serviceResult";
import {
  ORGASMUS_ARTEN,
  OEFFNEN_GRUENDE,
  ORGASMUS_ART_I18N_KEYS,
  GRUND_I18N_KEYS,
} from "@/lib/constants";

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
  return kind === "orgasm" ? ORGASMUS_ARTEN : OEFFNEN_GRUENDE;
}

function builtinI18nKey(code: string, kind: ReasonKind): string | undefined {
  return kind === "orgasm" ? ORGASMUS_ART_I18N_KEYS[code] : (GRUND_I18N_KEYS as Record<string, string>)[code];
}

/** Eingebaute Standardliste (bei `null`-Config) — Codes = Konstanten, kein Label-Override. */
function defaultConfig(kind: ReasonKind): ReasonEntry[] {
  return reservedCodes(kind).map((code) => ({ code }));
}

/** Trimmt/entfernt Steuerzeichen und kappt auf LABEL_MAX; leeres Ergebnis → undefined. */
function sanitizeLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const clean = raw.replace(CONTROL_CHARS_RE, "").trim().slice(0, LABEL_MAX);
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
    const label = sanitizeLabel((item as { label?: unknown })?.label);
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

export function effectiveOrgasmusArten(cfgRaw: unknown): ReasonEntry[] {
  return parseReasonConfig(cfgRaw, "orgasm");
}
export function effectiveOeffnenGruende(cfgRaw: unknown): ReasonEntry[] {
  return parseReasonConfig(cfgRaw, "opening");
}

/** Menge der für diesen User gültigen Codes (Built-ins bei `null`) — für die Payload-Validierung. */
export function validOrgasmusCodes(cfgRaw: unknown): Set<string> {
  return new Set(effectiveOrgasmusArten(cfgRaw).map((e) => e.code));
}
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

/** Löst eine ganze Config zu anzeigefertigen `{code,label}` auf (Select-Optionen + Zeilen). */
export function resolveReasonList(
  cfg: ReasonEntry[],
  kind: ReasonKind,
  t: (key: string) => string,
): ResolvedReason[] {
  return cfg.map((e) => ({ code: e.code, label: resolveReasonLabel(e.code, cfg, kind, t) }));
}

/** Speichert eine Reason-Config (validiert/normalisiert via parseReasonConfig). Geteilt von der
 *  PATCH-Route. Für Öffnungsgründe ist REINIGUNG nach der Normalisierung garantiert enthalten. */
export async function setReasonConfig(userId: string, kind: ReasonKind, raw: unknown): Promise<ServiceResult<null>> {
  const normalized = parseReasonConfig(raw, kind);
  const field = kind === "orgasm" ? "orgasmusArtenConfig" : "oeffnenGruendeConfig";
  await prisma.user.update({ where: { id: userId }, data: { [field]: JSON.stringify(normalized) } });
  return { ok: true, data: null };
}
