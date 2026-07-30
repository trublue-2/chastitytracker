import { readFile } from "fs/promises";
import { join, basename } from "path";
import sharp from "sharp";
import { visionMaxImagePx, type Rotation } from "@/lib/constants";
import { structuredLog, redactDigits } from "@/lib/serverLog";
import { IMAGE_MEDIA_TYPES } from "@/lib/imageUtils";
import { visionComplete, visionConfigured, visionProvider } from "@/lib/vision";
import { parseJsonObject } from "@/lib/vision/parse";
import { localReadDigits } from "@/lib/ocr";

/** Beschreibung der zulaessigen Code-Quellen — wird in beiden Vision-Prompts verwendet
 *  damit Vokabular nicht zwischen verifyKontrolleCodeDetailed und detectSealNumber driftet. */
const SEAL_VOCAB = `plastic security seal or numbered tag (e.g. coloured strip — yellow, red, blue, white — with a round locking head, a barcode and digits; often used to seal chastity devices). The seal may appear in any orientation — upside down, sideways or angled — read it as it would read when held upright. Preserve any leading zeros.`;

/** In beiden Vision-Prompts identisch — als Konstante gehalten (wie SEAL_VOCAB), damit die
 *  Handschrift-Warnung nicht zwischen Einzel- und Dual-Modus driftet. */
const HANDWRITING_NOTE = `Note: in handwriting "1" often looks like "7" and vice versa — read carefully.`;

/** „Genau N Ziffern, sonst null" — die einzige Stelle, an der die erwartete Stellenzahl im Prompt
 *  steht (in BEIDEN Modi gleich formuliert, damit derselbe handgeschriebene Code nicht je nach
 *  aktivem Siegel unterschiedlich stark eingeschärft wird). Ohne diese Angabe hat das Modell keinen
 *  Anhaltspunkt, wie viele Ziffern zusammengehören, und meldet regelmässig eine zu viel oder zu
 *  wenig (Nutzer-Rückmeldung 07/2026: „erkennt einen 6-stelligen Code, obwohl er 5-stellig ist").
 *  Der Prompt-Hinweis SENKT die Fehl-Lesungen; die Garantie ist das Gate in `evaluateDetected`. */
function digitCountNote(what: string, len: number): string {
  return `The ${what} has exactly ${len} digits — report null rather than guessing if you cannot read exactly ${len} digits.`;
}

/** Baut den Vision-Prompt für die Code-Verifikation. Ohne `effectiveSeal` (kein aktives Siegel oder
 *  Legacy-Zeile Siegel==Code) die Einzel-Prüfung, sonst die Dual-Prüfung (Kontroll-Code UND
 *  Siegel-Nummer). Nur der jeweils benötigte Prompt wird gebaut.
 *  Zeilenweise als Array — der Prompt ist der eigentliche „Quelltext" dieser Erkennung, und als
 *  einzeiliges Literal mit eingebetteten \n war eine Änderung daran im Diff nicht mehr lesbar. */
function buildVerifyPrompt(expectedCode: string, effectiveSeal: string | null): string {
  if (!effectiveSeal) {
    return [
      `Look for the specific number ${expectedCode} in this image. Only this number matters — ignore other numbers, barcodes, prices, or device serials that may also be visible.`,
      `The target number may appear in any of these forms:`,
      `• handwritten on a slip of paper or card,`,
      `• printed/typed on a tag, sticker or label,`,
      `• printed on a ${SEAL_VOCAB}`,
      HANDWRITING_NOTE,
      digitCountNote("target number", expectedCode.length),
      `Reply with JSON only: {"detected": "<the target number if you found it, else null>", "match": true if the number matches ${expectedCode} else false}.`,
      `If you find a different number than ${expectedCode}, set detected to that other number and match to false.`,
    ].join("\n");
  }
  return [
    `Look for TWO specific numbers in this image. Only these two numbers matter — ignore other numbers, barcodes, prices, or device serials that may also be visible.`,
    `1. CONTROL CODE ${expectedCode}: may be handwritten on a slip of paper or card, or printed/typed on a tag, sticker or label.`,
    `2. SEAL NUMBER ${effectiveSeal}: printed on a ${SEAL_VOCAB}`,
    HANDWRITING_NOTE,
    digitCountNote("control code", expectedCode.length),
    digitCountNote("seal number", effectiveSeal.length),
    `The two numbers are separate — never merge digits from one into the other.`,
    `Reply with JSON only: {"detectedCode": "<the control code you found, else null>", "matchCode": true if it matches ${expectedCode} else false, "detectedSeal": "<the seal number you found, else null>", "matchSeal": true if it matches ${effectiveSeal} else false}.`,
    `If you find different numbers than expected, set the detected fields to those other numbers and the match fields to false.`,
  ].join("\n");
}

/** Erkennt „das Modell meldet KEINE Erkennung": mal als JSON-null/undefined, mal als Wort-Sentinel
 *  ("null"/"none") IM String. Für die Auswertung selbst genügt `digitsOf` (Sentinels enthalten keine
 *  Ziffern); gebraucht wird die Unterscheidung nur noch dort, wo „nichts gelesen" und „unbrauchbar
 *  gelesen" getrennt geloggt werden (`no_detection` vs. `invalid_format` in `detectSealDigits`). */
function normalizeDetected(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  return ["null", "none"].includes(raw.trim().toLowerCase()) ? null : raw;
}

/** Die blanken Ziffern einer Modell-Antwort, `""` wenn keine da sind. Für die VERIFIKATION gegen
 *  einen bekannten Erwartungswert: dort ist grosszügiges Strippen ungefährlich, weil das Ergebnis
 *  anschliessend Ziffer für Ziffer gegen den Erwartungswert geprüft wird — was nicht passt, fällt
 *  ohnehin durch. Deckt die Sentinels ("null"/"none") mit ab: sie enthalten keine Ziffern → `""`.
 *
 *  NICHT für die ENTDECKUNG einer unbekannten Nummer verwenden (Siegel/Zahlenschloss) — dort gibt
 *  es keinen Abgleich, der eine Fehl-Extraktion auffangen würde. Dafür `sealDigitsFromReply`. */
function digitsOf(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : "";
}

/** Die gelesene Nummer aus einer ENTDECKUNGS-Antwort (unbekannte Siegel-/Schloss-Nummer), oder
 *  `null`, wenn die Antwort keine saubere Ziffernfolge der erwarteten Länge ist. Exportiert für Tests.
 *
 *  Hier wird NUR Whitespace normalisiert — Modelle setzen dieselbe Nummer mal als "0067321", mal als
 *  " 00673 21 ". Alles andere (Buchstaben, Fliesstext) lässt die Antwort durchfallen. Der Unterschied
 *  zu `digitsOf` ist bewusst und sicherheitsrelevant: bei der Entdeckung gibt es keinen
 *  Erwartungswert, gegen den sich eine Fehl-Lesung prüfen liesse — was hier zurückkommt, WIRD die
 *  Siegel-Nummer. Würde man wie bei der Verifikation alle Nicht-Ziffern strippen, ergäbe eine Antwort
 *  wie „Serial No. AB1234567" (Modell hat den Geräte-Barcode statt der Plombe gelesen) die
 *  scheinbar saubere Nummer „1234567" — und damit einen Manipulations-Nachweis, der keiner ist. */
export function sealDigitsFromReply(raw: unknown, minLen: number, maxLen: number): string | null {
  if (typeof raw !== "string") return null;
  const compact = raw.replace(/\s/g, "");
  return new RegExp(`^\\d{${minLen},${maxLen}}$`).test(compact) ? compact : null;
}

/** Verify-spezifischer Logger — `[verify]`-Prefix fuer grepbare Container-Logs.
 *  WICHTIG: der erwartete Auth-Code wird bewusst NICHT geloggt (er ist die
 *  Authentifizierung der Kontrolle). Nur Laenge, Filename, mediaType, bytes,
 *  redacted previews. Niemals den API-Key oder rohe Bilddaten. */
function vlog(label: string, fields: Record<string, unknown>) {
  structuredLog("verify", label, fields);
}

async function loadImageBuffer(
  imageUrl: string,
  rotation: Rotation
): Promise<{ base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" } | null> {
  const filename = basename(imageUrl);
  if (!filename || filename.includes("..") || filename.includes("/")) {
    vlog("loadImageBuffer:reject_filename", { filename, imageUrl });
    return null;
  }
  const fullPath = join(process.cwd(), "data", "uploads", filename);
  let raw: Buffer;
  try {
    raw = await readFile(fullPath);
  } catch (e) {
    vlog("loadImageBuffer:read_failed", { fullPath, error: (e as Error).message });
    return null;
  }
  // Vor dem Vision-Call runterskalieren — spart Vision-Tokens/Latenz drastisch (v.a. lokale Modelle).
  const maxPx = visionMaxImagePx();
  let buffer: Buffer;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  try {
    buffer = await sharp(raw)
      .rotate(rotation || 0)
      .resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    mediaType = "image/jpeg";
  } catch (e) {
    vlog("loadImageBuffer:sharp_failed", { filename, rotation, rawBytes: raw.length, error: (e as Error).message });
    buffer = raw; // Fallback: Original ohne Skalierung
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    mediaType = IMAGE_MEDIA_TYPES[ext] ?? "image/jpeg";
  }
  const base64 = buffer.toString("base64");
  vlog("loadImageBuffer:ok", { filename, mediaType, bytes: buffer.length, rotation });
  return { base64, mediaType };
}

/** Ziffernweiser Vergleich mit Toleranz für die klassischen Handschrift-Verwechslungen.
 *  Vorbedingung: gleich lange Ziffernfolgen — die `every`-Schleife allein würde ein kürzeres `a`
 *  als Präfix-Treffer durchgehen lassen, deshalb bleibt der Längen-Guard hier stehen, auch wenn
 *  der einzige Aufrufer die Länge bereits geprüft hat. */
function fuzzyMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const similar: Record<string, string> = { "1": "7", "7": "1", "0": "6", "6": "0" };
  return a.split("").every((ch, i) => ch === b[i] || similar[ch] === b[i]);
}

// VerifyReason + its i18n formatting live in verifyReason.ts (client-safe — no sharp/fs/next-headers)
// so client components can import the formatter without bundling this server-only vision module.
export type { VerifyReason } from "@/lib/verifyReason";
import type { VerifyReason } from "@/lib/verifyReason";

export type VerifyDetailedResult = {
  detected: string | null;
  match: boolean;
  reason: VerifyReason | null;
  /** Nur bei Dual-Prüfung (aktives Siegel) gesetzt: erkannte Siegel-Nummer + Teil-Ergebnis. */
  sealDetected?: string | null;
  sealMatch?: boolean;
  /** Observability: Modell meldete match=false, die Ziffern stimmten aber (2026-05-Befund). */
  overridden?: boolean;
  /** Observability: gelesene Stellenzahl VOR dem Stellenzahl-Gate (0 = nichts gelesen). Weicht sie
   *  von der erwarteten Länge ab, hat das Modell falsch viele Ziffern gelesen und die Erkennung
   *  wurde verworfen — nach dem Gate wäre das aus `detected` nicht mehr erkennbar. `sealRawLen`
   *  ist `null`, wenn gar keine Siegel-Prüfung lief (≠ 0 = geprüft, nichts gelesen). */
  rawLen?: number;
  sealRawLen?: number | null;
  error?: "policy" | true;
};

/** Bewertet EINE erkannte Nummer gegen den Erwartungswert: normalisieren (Whitespace/
 *  Nicht-Ziffern), Stellenzahl-Gate, exakter Vergleich, optionale Fuzzy-Toleranz (1↔7, 0↔6).
 *  Override-Fall: Modell liest die richtigen Ziffern, meldet aber match=false.
 *  `allowFuzzy`: nur für den HANDGESCHRIEBENEN Kontroll-Code (dort ist 1↔7/0↔6-Verwechslung real).
 *  Für die GEDRUCKTE Siegel-Nummer aus → exakter Match, damit ein transponiertes Fremd-Siegel
 *  nicht durchrutscht (die Siegel-Prüfung ist der Manipulations-/Frische-Nachweis).
 *
 *  STELLENZAHL-GATE: eine Lesung mit anderer Ziffernzahl als der Erwartungswert ist ein LESEFEHLER,
 *  keine abweichende Nummer — die Codes sind immer gleich lang. Sie als „erkannt: 123456" zu melden
 *  behauptet fälschlich, DIESE Nummer stehe im Bild; richtig ist „nicht lesbar" (→ codeMissing statt
 *  codeWrong). Deshalb zählt eine längen-abweichende Lesung hier als keine Erkennung.
 *
 *  Damit entfällt auch das blinde Vertrauen in das `match`-Flag des Modells: über die Ziffern
 *  entscheidet ab hier ausschliesslich der Server. Ein `match: true` neben abweichenden oder
 *  unlesbaren Ziffern ist ein Widerspruch des Modells mit sich selbst und darf keine Kontrolle
 *  bestehen lassen. Das Flag dient nur noch der Observability (`overridden`). */
function evaluateDetected(rawDetected: unknown, modelMatch: unknown, expected: string, allowFuzzy: boolean = true): {
  detected: string | null;
  match: boolean;
  overridden: boolean;
  /** Stellenzahl vor dem Gate — hier mitgegeben statt am Log-Aufrufer erneut aus der Rohantwort
   *  geparst, sonst läge die Single-/Dual-Feldnamen-Verzweigung an zwei Stellen. */
  rawLen: number;
} {
  const digits = digitsOf(rawDetected);
  if (digits.length !== expected.length) {
    return { detected: null, match: false, overridden: false, rawLen: digits.length };
  }
  const exact = digits === expected;
  return {
    detected: digits,
    match: exact || (allowFuzzy && fuzzyMatch(digits, expected)),
    overridden: modelMatch !== true && exact,
    rawLen: digits.length,
  };
}

/** Pure Auswertung der Vision-JSON-Antwort (Single- oder Dual-Modus) → Verify-Ergebnis.
 *  Dual (sealCode gesetzt): match nur, wenn Kontroll-Code UND Siegel-Nummer passen; der
 *  Grund benennt den fehlenden Teil, falls das Modell keinen liefert. Exportiert für Tests. */
export function evaluateVerifyResponse(
  parsed: Record<string, unknown>,
  expectedCode: string,
  sealCode: string | null,
): VerifyDetailedResult {
  if (!sealCode) {
    const code = evaluateDetected(parsed.detected, parsed.match, expectedCode);
    return {
      detected: code.detected,
      match: code.match,
      reason: code.match ? null : (code.detected ? "codeWrong" : "codeMissing"),
      overridden: code.overridden,
      rawLen: code.rawLen,
      sealRawLen: null,
    };
  }

  const code = evaluateDetected(parsed.detectedCode, parsed.matchCode, expectedCode);
  // Siegel-Nummer ist gedruckt → exakter Match (kein Fuzzy), sonst würde ein transponiertes
  // Fremd-Siegel (0↔6/1↔7) als gültig durchgehen und den Siegel-Nachweis aushebeln.
  const seal = evaluateDetected(parsed.detectedSeal, parsed.matchSeal, sealCode, false);
  const match = code.match && seal.match;
  // Grund spiegelt die Card-Auswahl im Form (seal-first: `sealMatch === false → sealMismatch`):
  // scheitert das Siegel, ein Siegel-Grund; sonst (Siegel ok, also Code schuld) ein Code-Grund. So
  // stimmen Card-Titel und Grund-Zeile auch im Fall überein, dass BEIDE fehlschlagen.
  const reason: VerifyReason | null = match
    ? null
    : !seal.match ? (seal.detected ? "sealWrong" : "sealMissing")
    : (code.detected ? "codeWrong" : "codeMissing");
  return {
    detected: code.detected,
    match,
    reason,
    overridden: code.overridden || seal.overridden,
    sealDetected: seal.detected,
    sealMatch: seal.match,
    rawLen: code.rawLen,
    sealRawLen: seal.rawLen,
  };
}

export async function verifyKontrolleCodeDetailed(
  imageUrl: string,
  expectedCode: string,
  rotation: Rotation = 0,
  /** Aktive Siegel-Nummer → Dual-Prüfung: Code UND Siegel müssen im Foto lesbar sein.
   *  Gleich wie expectedCode (Legacy-Kontrollen, Siegel = Code) → normale Einzel-Prüfung. */
  sealCode: string | null = null,
): Promise<VerifyDetailedResult | null> {
  const codeLen = expectedCode.length;
  const effectiveSeal = sealCode && sealCode !== expectedCode ? sealCode : null;
  // Handschrift → kein lokales OCR-Fallback (Tesseract kann das nicht zuverlässig). Ohne
  // konfigurierten Vision-Provider bleibt die Verifikation manuell (Keyholder).
  if (!visionConfigured()) {
    vlog("verify:not_configured", { imageUrl, codeLen });
    return null;
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog("verify:image_load_null", { imageUrl, codeLen, rotation });
      return null;
    }

    vlog("verify:vision_call", { codeLen, mediaType: img.mediaType, rotation, sealChecked: !!effectiveSeal });
    const response = await visionComplete({
      task: "code-verify",
      maxTokens: effectiveSeal ? 200 : 150,
      content: [
        { type: "image", mediaType: img.mediaType, base64: img.base64 },
        { type: "text", text: buildVerifyPrompt(expectedCode, effectiveSeal) },
      ],
    });

    const text = response.text;
    vlog("verify:vision_response", { requestId: response.requestId, stopReason: response.stopReason, textPreview: redactDigits(text.slice(0, 200)) });

    // Policy-Refusal ist eine ANTHROPIC-Eigenheit (verweigert explizitere Fotos). Ein lokales Modell
    // kennt das nicht — ein „I cannot read…" ist dort ein normaler Lesefehler, kein Policy-Block.
    if (visionProvider() === "anthropic") {
      const policyKeywords = ["I'm unable", "I cannot", "I can't", "inappropriate", "violates", "policy", "explicit", "sorry, I"];
      if (!text.includes("{") && policyKeywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))) {
        vlog("verify:policy_block", { textPreview: redactDigits(text.slice(0, 200)) });
        return { detected: null, match: false, reason: null, error: "policy" };
      }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      vlog("verify:no_json_in_response", { textPreview: redactDigits(text.slice(0, 200)) });
      return { detected: null, match: false, reason: null };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      vlog("verify:json_parse_failed", { jsonRawLen: jsonMatch[0].length, error: (e as Error).message });
      return { detected: null, match: false, reason: null };
    }
    // Normalisierung/Fuzzy/Override (Modell liest richtige Ziffern, meldet aber match=false —
    // beobachtet 2026-05) stecken zentral in evaluateVerifyResponse/evaluateDetected.
    const result = evaluateVerifyResponse(parsed, expectedCode, effectiveSeal);
    vlog("verify:result", {
      codeLen,
      hasDetected: result.detected !== null,
      // Rohe Stellenzahlen VOR dem Gate: weichen sie von codeLen/sealLen ab, hat das Modell falsch
      // viele Ziffern gelesen und die Erkennung wurde verworfen. Der Marker für Fehl-Lesungen im
      // Log — `detected` ist danach entweder passend lang oder null und zeigt es nicht mehr.
      rawLen: result.rawLen ?? 0,
      sealRawLen: result.sealRawLen ?? null,
      isMatch: result.match,
      claudeOverridden: result.overridden ?? false,
      sealChecked: !!effectiveSeal,
      sealMatch: result.sealMatch ?? null,
      hasSealDetected: result.sealDetected != null,
      reason: result.reason,
    });
    return result;
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog("verify:exception", { imageUrl, codeLen, name: err.name, status: err.status, message: err.message });
    return null;
  }
}

/**
 * Gemeinsames Gerüst der Ziffern-Erkennung aus einem Code-/Siegelbild: ohne Vision-Provider
 * lokales OCR (min..max Ziffern), sonst visionComplete (task seal-detect) → JSON {detected}
 * → Längen-/Format-Validierung. Genutzt von detectSealNumber (Plombe) und detectLockboxCode (Dial).
 */
async function detectSealDigits(
  imageUrl: string,
  rotation: Rotation,
  opts: { minLen: number; maxLen: number; prompt: string; logPrefix: string },
): Promise<string | null> {
  const { minLen, maxLen, prompt, logPrefix } = opts;

  if (!visionConfigured()) {
    // Kein Vision-Provider → lokales OCR (gedruckte Ziffern). Kein Datenabfluss; Dials oft schwach → ggf. null.
    vlog(`${logPrefix}:no_provider_local_ocr`, { imageUrl });
    return localReadDigits(imageUrl, { rotation, minLen, maxLen });
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog(`${logPrefix}:image_load_null`, { imageUrl, rotation });
      return null;
    }

    const response = await visionComplete({
      task: "seal-detect",
      maxTokens: 100,
      content: [
        { type: "image", mediaType: img.mediaType, base64: img.base64 },
        { type: "text", text: prompt },
      ],
    });

    const text = response.text;
    vlog(`${logPrefix}:vision_response`, { requestId: response.requestId, stopReason: response.stopReason, textPreview: redactDigits(text.slice(0, 200)) });

    const result = parseJsonObject<{ detected?: unknown }>(text);
    if (!result) {
      vlog(`${logPrefix}:no_json`, { textPreview: redactDigits(text.slice(0, 200)) });
      return null;
    }
    if (normalizeDetected(result.detected) === null) {
      vlog(`${logPrefix}:no_detection`, { detectedType: typeof result.detected });
      return null;
    }
    const detected = sealDigitsFromReply(result.detected, minLen, maxLen);
    if (detected === null) {
      vlog(`${logPrefix}:invalid_format`, { rawLen: digitsOf(result.detected).length });
      return null;
    }
    return detected;
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog(`${logPrefix}:exception`, { imageUrl, name: err.name, status: err.status, message: err.message });
    return null;
  }
}

/**
 * Tries to detect a 5–8 digit numbered seal (Plombe) from an image.
 * Returns the detected number string, or null if none found.
 * @param rotation  Clockwise rotation in degrees applied before sending to the vision model.
 */
export async function detectSealNumber(imageUrl: string, rotation: Rotation = 0): Promise<string | null> {
  const detected = await detectSealDigits(imageUrl, rotation, {
    minLen: 5,
    maxLen: 8,
    logPrefix: "seal",
    prompt: `Look for a ${SEAL_VOCAB}\nThe number is usually 5–8 digits.\nReply with JSON only: {"detected": "<number with leading zeros or null>"}. If no seal or number is visible, use null.`,
  });
  // Guard gegen Halluzinationen: strikt fortlaufende (01234567) oder gleichförmige (00000000)
  // „Nummern" sind praktisch nie echte Plomben-Nummern. Als nicht erkannt behandeln, statt einen
  // Platzhalter als Siegel zu speichern. NUR für die Plombe — Zahlenschloss-Codes (detectLockboxCode)
  // dürfen fortlaufend sein (z.B. 1234), daher greift der Guard dort bewusst nicht.
  if (isImplausibleSeal(detected)) {
    vlog("seal:implausible_rejected", { detectedLen: detected?.length });
    return null;
  }
  return detected;
}

/** True für strikt fortlaufende (auf-/absteigende) oder gleichförmige Ziffernfolgen — klassische
 *  Platzhalter-/Halluzinations-Muster (01234567, 76543210, 00000000), die nie echte Siegel sind. */
export function isImplausibleSeal(s: string | null): boolean {
  if (!s) return false;
  const d = s.trim();
  if (d.length < 5 || !/^\d+$/.test(d)) return false;
  if (/^(\d)\1+$/.test(d)) return true;
  const isRun = (step: number) => [...d].every((_, i) => i === 0 || d.charCodeAt(i) === d.charCodeAt(i - 1) + step);
  return isRun(1) || isRun(-1);
}

/**
 * Bildersafe: liest den Code eines ZAHLEN-VORHÄNGESCHLOSSES / einer Schlüsselbox (Dial-/Rolldials),
 * nicht einer Plombe. Typisch 3–4 (bis 8) Ziffern an der Markierungslinie.
 */
export async function detectLockboxCode(imageUrl: string, rotation: Rotation = 0): Promise<string | null> {
  return detectSealDigits(imageUrl, rotation, {
    minLen: 3,
    maxLen: 8,
    logPrefix: "lockbox",
    prompt: `This is a combination padlock or key lockbox with rotating number dials (Zahlenschloss). Read the digits currently set at the indicator — the row aligned with the marker line (often red) / shown in the small windows. Read them in order (top→bottom for stacked dials, left→right for a row). The code is usually 3–4 digits (up to 8). Ignore the partially-visible neighbouring digits above/below the line.\nReply with JSON only: {"detected": "<the digits, with leading zeros, or null>"}. If you cannot read the digits, use null.`,
  });
}

/**
 * Liegt im Sichtfenster der Schlüsselbox ein Schlüssel? Die Box (Heimdall / „Lock Me Box") hat ein
 * transparentes Fenster im Deckel — der Schlüssel ist also auch bei GESCHLOSSENER Box sichtbar.
 * Deshalb genau EINE Frage für beide Anlässe: Verschluss-Foto wie Kontroll-Foto.
 *
 * Bewusst nur eine Anwesenheits-Frage: welcher Schlüssel dort liegt, kann das Modell nicht
 * beurteilen (ein beliebiger Ersatzschlüssel sieht gleich aus). Das Ergebnis ist ein Indiz für die
 * Keyholderin, kein Beweis — es blockiert nichts (wie `deviceCheck`).
 *
 * `null` = nicht geprüft: kein Vision-Provider (es gibt keinen OCR-Fallback für „Schlüssel"),
 * Bild nicht ladbar, Modell nicht auswertbar oder Aufruf gescheitert. Die UI zeigt dann KEINE
 * Pille, statt „kein Schlüssel erkannt" zu behaupten, was niemand geprüft hat.
 */
export async function detectKeyInBox(imageUrl: string, rotation: Rotation = 0): Promise<boolean | null> {
  if (!visionConfigured()) {
    vlog("key:no_provider", { imageUrl });
    return null;
  }
  try {
    const img = await loadImageBuffer(imageUrl, rotation);
    if (!img) {
      vlog("key:image_load_null", { imageUrl, rotation });
      return null;
    }

    const response = await visionComplete({
      task: "key-detect",
      maxTokens: 50,
      content: [
        { type: "image", mediaType: img.mediaType, base64: img.base64 },
        {
          type: "text",
          text:
            `This photo shows a small black key safe with a transparent viewing window in its lid. ` +
            `Through the window you can see the padded compartment inside.\n` +
            `Question: is at least one KEY visible inside the compartment? A key ring or key fob alone ` +
            `does NOT count — the blade of a key must be visible.\n` +
            `Reply with JSON only: {"key": <true|false>}. If the window is empty, too dark or too ` +
            `blurry to tell, use false.`,
        },
      ],
    });

    vlog("key:vision_response", { requestId: response.requestId, stopReason: response.stopReason, textPreview: response.text.slice(0, 200) });

    const parsed = parseJsonObject<{ key?: boolean }>(response.text);
    if (parsed === null || typeof parsed.key !== "boolean") {
      vlog("key:unparsable", { textPreview: response.text.slice(0, 200) });
      return null;
    }
    return parsed.key;
  } catch (e) {
    const err = e as { message?: string; name?: string };
    vlog("key:exception", { error: err.message, name: err.name });
    return null;
  }
}
