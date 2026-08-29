import { readFile } from "fs/promises";
import { join, basename } from "path";
import sharp from "sharp";
import { visionMaxImagePx, type Rotation } from "@/lib/constants";
import { structuredLog, redactDigits } from "@/lib/serverLog";
import { IMAGE_MEDIA_TYPES, type ImageData } from "@/lib/imageUtils";
import { visionComplete, visionConfigured, visionProvider } from "@/lib/vision";
import { parseJsonObject } from "@/lib/vision/parse";
import { localReadDigits } from "@/lib/ocr";
import { randomInt } from "@/lib/utils";

/** Beschreibung der zulaessigen Code-Quellen — wird in beiden Vision-Prompts verwendet
 *  damit Vokabular nicht zwischen verifyKontrolleCodeDetailed und detectSealNumber driftet. */
const SEAL_VOCAB = `plastic security seal or numbered tag (e.g. coloured strip — yellow, red, blue, white — with a round locking head, a barcode and digits; often used to seal chastity devices). The seal may appear in any orientation — upside down, sideways or angled — read it as it would read when held upright. Preserve any leading zeros.`;

/** Der Kontroll-Code darf auch von einem BILDSCHIRM abgelesen werden: die Push-Meldung trägt ihn
 *  im Text (`kontrolleService`), eine gespiegelte Benachrichtigung auf der Smartwatch zeigt ihn
 *  also ohne Zettel. Die Regel verlangte nie ein bestimmtes Medium („muss auf dem Foto erkennbar
 *  sein"), nur der Prompt zählte Papier/Etikett/Plombe auf — und wies daneben an, lieber `null` zu
 *  melden als zu raten. Wie SEAL_VOCAB als Konstante, damit die Quelle nicht zwischen Einzel- und
 *  Dual-Modus driftet.
 *
 *  NUR für den Kontroll-Code. Die Siegel-Nummer bleibt physisch: sie ist der Manipulations-Nachweis,
 *  und ein abfotografierter Bildschirm belegt nicht, dass die Plombe am Gerät sitzt. */
const SCREEN_VOCAB = `shown on a screen — e.g. the app's notification on a phone or smartwatch display`;

/** In beiden Vision-Prompts identisch — als Konstante gehalten (wie SEAL_VOCAB), damit die
 *  Handschrift-Warnung nicht zwischen Einzel- und Dual-Modus driftet.
 *  Benennt die beobachteten Fehl-Lesungen: neben dem klassischen 1/7 vor allem „als Zwei gelesen"
 *  (Nutzer-Rückmeldungen 08/2026: 91578→91528, 83375→83275 — beide Male eine Zwei, wo keine stand). */
const HANDWRITING_NOTE = [
  `Note on handwriting: "1" often looks like "7" and vice versa — read carefully.`,
  `A handwritten "7" or "3" is easily misread as a "2". Before reporting a "2", check the strokes:`,
  `a seven has a straight diagonal from a horizontal top bar, a three has two stacked open arcs,`,
  `a two has a curved top ending in a flat horizontal base.`,
].join("\n");

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
      `• ${SCREEN_VOCAB},`,
      `• printed on a ${SEAL_VOCAB}`,
      HANDWRITING_NOTE,
      digitCountNote("target number", expectedCode.length),
      `Reply with JSON only: {"detected": "<the target number if you found it, else null>", "match": true if the number matches ${expectedCode} else false}.`,
      `If you find a different number than ${expectedCode}, set detected to that other number and match to false.`,
    ].join("\n");
  }
  return [
    `Look for TWO specific numbers in this image. Only these two numbers matter — ignore other numbers, barcodes, prices, or device serials that may also be visible.`,
    `1. CONTROL CODE ${expectedCode}: may be handwritten on a slip of paper or card, printed/typed on a tag, sticker or label, or ${SCREEN_VOCAB}.`,
    `2. SEAL NUMBER ${effectiveSeal}: printed on a ${SEAL_VOCAB}`,
    // Gegenstueck zu SCREEN_VOCAB: der Code darf vom Bildschirm kommen, die Plombe nicht. Ohne
    // diesen Satz liegt die Verallgemeinerung nahe, sobald oben ein Display erlaubt ist.
    `Read the seal number from the physical seal itself — a seal number shown on a screen or written by hand does not count as a seal.`,
    HANDWRITING_NOTE,
    digitCountNote("control code", expectedCode.length),
    digitCountNote("seal number", effectiveSeal.length),
    `The two numbers are separate — never merge digits from one into the other.`,
    `Reply with JSON only: {"detectedCode": "<the control code you found, else null>", "matchCode": true if it matches ${expectedCode} else false, "detectedSeal": "<the seal number you found, else null>", "matchSeal": true if it matches ${effectiveSeal} else false}.`,
    `If you find different numbers than expected, set the detected fields to those other numbers and the match fields to false.`,
  ].join("\n");
}

/** Wortlaute, an denen eine ANTHROPIC-Verweigerung erkennbar ist (explizitere Fotos). Kleingeschrieben
 *  gehalten, damit der Vergleich die Antwort nur EINMAL kleinschreiben muss statt je Stichwort. */
const POLICY_KEYWORDS = ["i'm unable", "i cannot", "i can't", "inappropriate", "violates", "policy", "explicit", "sorry, i"];

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
): Promise<ImageData | null> {
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

/** Ziffern-Paare, die die Erkennung in HANDSCHRIFT nachweislich vertauscht — als Paare notiert und
 *  symmetrisch gelesen, damit keine Richtung vergessen wird. `2` hat zwei Partner (`7` und `3`),
 *  deshalb eine Paar-Liste statt der früheren 1:1-Map.
 *
 *  Jedes Paar KOSTET: der Kontroll-Code ist der Frische-Nachweis der Kontrolle, und eine tolerierte
 *  Ziffer lässt an dieser Stelle auch einen echt abweichenden Code als Treffer durchgehen. Neue
 *  Paare nur bei belegten Fehl-Lesungen aufnehmen — nicht vorsorglich. */
const CONFUSABLE_DIGIT_PAIRS = ["17", "06", "27", "23"];

/** Sind die beiden Ziffern eines der tolerierten Paare — in beliebiger Richtung? Bewusst NICHT
 *  transitiv: `3` und `7` sind beide mit `2` verwechselbar, untereinander aber nicht. */
function isConfusable(x: string, y: string): boolean {
  return CONFUSABLE_DIGIT_PAIRS.includes(x + y) || CONFUSABLE_DIGIT_PAIRS.includes(y + x);
}

/** Ziffernweiser Vergleich mit Toleranz für die klassischen Handschrift-Verwechslungen. Exportiert
 *  für Tests (wie `evaluateVerifyResponse`) — die Köder-Gegenprobe hängt daran, dass ihr Köder dem
 *  echten Code auch unter DIESER Toleranz nicht gleicht, und das gehört gepinnt.
 *  Vorbedingung: gleich lange Ziffernfolgen — die `every`-Schleife allein würde ein kürzeres `a`
 *  als Präfix-Treffer durchgehen lassen, deshalb bleibt der Längen-Guard hier stehen, auch wenn
 *  der einzige Aufrufer die Länge bereits geprüft hat. */
export function fuzzyMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return a.split("").every((ch, i) => ch === b[i] || isConfusable(ch, b[i]));
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
 *  Nicht-Ziffern), Stellenzahl-Gate, exakter Vergleich, optionale Fuzzy-Toleranz
 *  (`CONFUSABLE_DIGIT_PAIRS`). Override-Fall: Modell liest die richtigen Ziffern, meldet aber
 *  match=false.
 *  `allowFuzzy`: nur für den HANDGESCHRIEBENEN Kontroll-Code (dort sind diese Verwechslungen real).
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
  // Fremd-Siegel als gültig durchgehen und den Siegel-Nachweis aushebeln.
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

/** Ergebnis EINER Anfrage an das Code-Prompt: die geparste Antwort, oder warum keine vorliegt. */
type CodeVisionRead =
  | { kind: "json"; parsed: Record<string, unknown> }
  | { kind: "policy" }
  | { kind: "unusable" };

/** Eine Anfrage an das Code-Prompt samt Antwort-Parsing. Geteilt von der eigentlichen Prüfung und
 *  der Köder-Gegenprobe: beide schicken dasselbe Prompt-Format an dasselbe Bild und müssen die
 *  Antwort identisch lesen — läse die Gegenprobe anders, prüfte sie etwas anderes als die Prüfung.
 *  `tag` trennt die beiden im Log (`verify:` bzw. `decoy:`). */
async function askCodeVision(
  img: ImageData,
  expectedCode: string,
  sealCode: string | null,
  tag: "verify" | "decoy",
): Promise<CodeVisionRead> {
  const response = await visionComplete({
    task: "code-verify",
    // Prompt-Form und Token-Budget hängen zusammen (die Dual-Antwort trägt zwei Zahlen) und werden
    // deshalb hier gemeinsam abgeleitet — nicht an den Aufrufstellen, wo sie auseinanderlaufen und
    // die Gegenprobe still etwas anderes fragen würden als die Prüfung.
    maxTokens: sealCode ? 200 : 150,
    content: [
      { type: "image", mediaType: img.mediaType, base64: img.base64 },
      { type: "text", text: buildVerifyPrompt(expectedCode, sealCode) },
    ],
  });
  const text = response.text;
  vlog(`${tag}:vision_response`, { requestId: response.requestId, stopReason: response.stopReason, textPreview: redactDigits(text.slice(0, 200)) });

  // Policy-Refusal ist eine ANTHROPIC-Eigenheit (verweigert explizitere Fotos). Ein lokales Modell
  // kennt das nicht — ein „I cannot read…" ist dort ein normaler Lesefehler, kein Policy-Block.
  if (visionProvider() === "anthropic" && !text.includes("{")) {
    const lower = text.toLowerCase();
    if (POLICY_KEYWORDS.some((kw) => lower.includes(kw))) {
      vlog(`${tag}:policy_block`, { textPreview: redactDigits(text.slice(0, 200)) });
      return { kind: "policy" };
    }
  }

  const parsed = parseJsonObject<Record<string, unknown>>(text);
  if (!parsed) {
    vlog(`${tag}:no_json_in_response`, { textPreview: redactDigits(text.slice(0, 200)) });
    return { kind: "unusable" };
  }
  return { kind: "json", parsed };
}

/** Eine Zufallszahl der geforderten Länge, die weder dem erwarteten Code noch der Siegel-Nummer
 *  gleicht — auch nicht unter der Fuzzy-Toleranz. Ohne diesen Abstand könnte eine ECHTE Lesung als
 *  Echo zählen und eine korrekte Kontrolle verwerfen. `null`, wenn sich in den Versuchen keine
 *  passende Zahl fand (praktisch unerreichbar; die Gegenprobe entfällt dann, statt zu raten). */
function decoyCodeFor(expected: string, sealCode: string | null): string | null {
  for (let i = 0; i < 20; i++) {
    const candidate = Array.from({ length: expected.length }, () => String(randomInt(0, 9))).join("");
    if (fuzzyMatch(candidate, expected)) continue;
    if (sealCode && fuzzyMatch(candidate, sealCode)) continue;
    return candidate;
  }
  return null;
}

/**
 * Die KÖDER-GEGENPROBE: dieselbe Frage noch einmal, aber nach einer Zahl, die es nicht gibt.
 *
 * Der Prompt nennt dem Modell den gesuchten Code — er muss es, sonst fände es unter den anderen
 * Zahlen im Bild (Barcode, Siegel, Preisschild) nicht die richtige. Damit steht die erwartete
 * Antwort aber in der Frage, und ein Modell, das nicht lesen kann, schreibt sie ab. Ein solches
 * Echo ist von einer echten Lesung nicht zu unterscheiden: gleiche Ziffern, gleiche Länge, `match`
 * true. Das Stellenzahl-Gate und der Server-Vergleich in {@link evaluateDetected} greifen nicht —
 * sie prüfen, OB die Ziffern stimmen, nicht, ob sie gelesen wurden.
 *
 * Unterscheidbar wird es erst durch eine zweite Frage, deren richtige Antwort „nichts gefunden"
 * ist. Bestätigt das Modell auch die erfundene Zahl, bestätigt es alles — dann ist sein Urteil über
 * den echten Code wertlos, und zwar gerade dann, wenn es positiv ausfiel.
 *
 * *Vorfall 29.08.2026:* eine Kontrolle ohne jeden Code im Foto galt als geprüft. Die Nachmessung an
 * neun Fotos: bei dreien bestätigte das Modell eine frei erfundene Zahl — reproduzierbar.
 *
 * Läuft NUR nach einem Treffer: ein Nicht-Treffer ist bereits das strenge Ergebnis, und die
 * Gegenprobe kostet einen zweiten Vision-Aufruf. Bewusst immer in der EINZEL-Form (ohne Siegel):
 * geprüft wird die Eigenschaft „bestätigt Zahlen, die im Prompt stehen" — die hängt am Modell und
 * am Bild, nicht daran, welches Feld gerade gefragt ist.
 *
 * Kann die Gegenprobe nichts sagen (keine Antwort, Policy-Block), bleibt der Treffer stehen: das
 * ist der Stand von vorher, und ein stummer Fehlschlag darf nicht jede Kontrolle verwerfen. Ein
 * Träger kann ihn ohnehin nicht auslösen.
 */
async function decoyEcho(img: ImageData, expectedCode: string, sealCode: string | null): Promise<boolean> {
  const decoy = decoyCodeFor(expectedCode, sealCode);
  if (!decoy) {
    vlog("decoy:no_candidate", { codeLen: expectedCode.length });
    return false;
  }
  // Eigenes try/catch, NICHT das der Hauptprüfung: dort landete ein Timeout der Box als Fehlschlag
  // der ganzen Verifikation (→ `null`, also „nicht geprüft" ohne Grund) und entwertete damit einen
  // Treffer, der längst vorlag. Die Gegenprobe kann nur BELASTEN, nie zum Fehlschlag führen.
  let read: CodeVisionRead;
  try {
    read = await askCodeVision(img, decoy, null, "decoy");
  } catch (e) {
    vlog("decoy:exception", { message: (e as Error).message });
    return false;
  }
  // Keine verwertbare Antwort → keine Aussage; den Ausgang hat `askCodeVision` bereits geloggt.
  if (read.kind !== "json") return false;
  const probe = evaluateVerifyResponse(read.parsed, decoy, null);
  vlog("decoy:result", { echoed: probe.match, rawLen: probe.rawLen ?? 0, hasDetected: probe.detected !== null });
  return probe.match;
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
    const read = await askCodeVision(img, expectedCode, effectiveSeal, "verify");
    if (read.kind === "policy") return { detected: null, match: false, reason: null, error: "policy" };
    if (read.kind === "unusable") return { detected: null, match: false, reason: null };

    // Normalisierung/Fuzzy/Override (Modell liest richtige Ziffern, meldet aber match=false —
    // beobachtet 2026-05) stecken zentral in evaluateVerifyResponse/evaluateDetected.
    const result = evaluateVerifyResponse(read.parsed, expectedCode, effectiveSeal);
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
    // Nur ein Treffer wird gegengeprobt — warum, steht an `decoyEcho`.
    if (result.match && await decoyEcho(img, expectedCode, effectiveSeal)) {
      // Jede Behauptung des Modells über gelesene Zahlen fällt mit: sie ist genau das, was die
      // Gegenprobe soeben widerlegt hat. Die Stellenzahlen (`rawLen`) bleiben — sie sind Beobachtung,
      // keine Behauptung.
      //
      // `sealMatch` bleibt UNGESETZT statt `false`: „kein Urteil" ist nicht „Siegel falsch". Das
      // Formular liest `sealMatch === false` als Siegel-Fehlschlag und zeigte sonst die Karte
      // „Siegel-Nummer stimmt nicht" — bei einem Gerät ganz ohne Siegel eine Warnung über etwas,
      // das es nicht gibt, und darunter die widersprechende Grund-Zeile.
      return { ...result, detected: null, sealDetected: null, sealMatch: undefined, match: false, reason: "checkUnreliable" };
    }
    return result;
  } catch (e) {
    const err = e as { status?: number; message?: string; name?: string };
    vlog("verify:exception", { imageUrl, codeLen, name: err.name, status: err.status, message: err.message });
    return null;
  }
}

/**
 * Gemeinsames Gerüst der Ziffern-Erkennung aus einem Bild: ohne Vision-Provider lokales OCR
 * (min..max Ziffern), sonst visionComplete (task seal-detect) → JSON → Auswertung der Antwort.
 * Genutzt von detectSealNumber (Plombe), detectLockboxCode (Dial) und detectScaleReading (Waage).
 *
 * `parse` bekommt das GANZE Antwort-Objekt und entscheidet, was daraus ein gültiges Ergebnis ist.
 * Ohne diesen Haken war das Gerüst auf `{detected: "<ziffern>"}` festgelegt — die Waage liefert eine
 * Kommazahl und zusätzlich die abgelesene Einheit, und ein zweites Gerüst daneben wäre die Kopie,
 * gegen die dieses hier gebaut wurde. Die Vorgabe ist der bisherige Ziffern-Pfad, unverändert.
 *
 * `localFallback: false` schaltet das OCR ohne Vision-Provider ab. Für gedruckte Ziffern ist es ein
 * sinnvoller Rückfall; auf einer Sieben-Segment-Anzeige liest es zuverlässig Unsinn, und eine falsche
 * Zahl vorzuschlagen ist schlechter, als gar keine anzubieten.
 */
async function detectSealDigits<T = string>(
  imageUrl: string,
  rotation: Rotation,
  opts: {
    minLen: number; maxLen: number; prompt: string; logPrefix: string;
    parse?: (reply: Record<string, unknown>) => T | null;
    localFallback?: boolean;
  },
): Promise<T | null> {
  const { minLen, maxLen, prompt, logPrefix } = opts;
  const parse = opts.parse ?? ((reply) => {
    if (normalizeDetected(reply.detected) === null) return null;
    return sealDigitsFromReply(reply.detected, minLen, maxLen) as T | null;
  });

  if (!visionConfigured()) {
    if (opts.localFallback === false) {
      vlog(`${logPrefix}:no_provider_no_fallback`, { imageUrl });
      return null;
    }
    // Kein Vision-Provider → lokales OCR (gedruckte Ziffern). Kein Datenabfluss; Dials oft schwach → ggf. null.
    vlog(`${logPrefix}:no_provider_local_ocr`, { imageUrl });
    return (await localReadDigits(imageUrl, { rotation, minLen, maxLen })) as T | null;
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

    const result = parseJsonObject<Record<string, unknown>>(text);
    if (!result) {
      vlog(`${logPrefix}:no_json`, { textPreview: redactDigits(text.slice(0, 200)) });
      return null;
    }
    const detected = parse(result);
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

/** Was die Waagen-Erkennung gelesen hat. `unit` ist `null`, wenn die Anzeige keine nennt — dann
 *  gilt die Anzeige-Einheit des Trägers, denn eine Waage ohne Einheiten-Angabe zeigt seine. */
export interface ScaleReading {
  value: number;
  unit: "kg" | "lb" | null;
}

/** Plausibler Bereich der ABGELESENEN Zahl, bevor bekannt ist, ob sie Kilogramm oder Pfund meint —
 *  weit genug für beides (20 kg bis 660 lbs), eng genug gegen eine verrutschte Kommastelle. */
const SCALE_RAW_RANGE = { min: 20, max: 700 };

/** Die Antwort der Waagen-Erkennung auswerten: Zahl und, wo ablesbar, die Einheit.
 *  Exportiert für Tests — hier steckt die eigentliche Härtung gegen erfundene Werte. */
export function scaleReadingFromReply(reply: Record<string, unknown>): ScaleReading | null {
  const raw = normalizeDetected(reply.detected);
  if (raw === null) return null;
  // Komma wie Punkt: Modelle geben „78,4" und „78.4" je nach Sprache der Anzeige zurück. Alles
  // andere lässt die Antwort durchfallen — bei einer ENTDECKUNG gibt es keinen Erwartungswert,
  // gegen den sich eine Fehl-Lesung prüfen liesse (dieselbe Regel wie bei `sealDigitsFromReply`).
  const compact = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{2,3}(\.\d{1,2})?$/.test(compact)) return null;
  const value = Number(compact);
  if (value < SCALE_RAW_RANGE.min || value > SCALE_RAW_RANGE.max) return null;

  const unitRaw = typeof reply.unit === "string" ? reply.unit.trim().toLowerCase() : "";
  const unit = unitRaw === "kg" ? "kg" : (unitRaw === "lb" || unitRaw === "lbs" ? "lb" : null);
  return { value, unit };
}

/**
 * Liest die Anzeige einer Personenwaage.
 *
 * **Ein Vorschlag, kein Messwert.** Das Ergebnis füllt das Zahlenfeld vor; bestätigt oder korrigiert
 * wird es vom Menschen — dasselbe Verhältnis wie bei `deviceCheck` und `detectKeyInBox`, die beide
 * anzeigen und nichts blockieren. Gründe: Schrägfoto auf ein spiegelndes LCD, Sieben-Segment-Ziffern
 * sind für kleine Modelle die schwerste Sorte, und manche Waage steht selbst auf Pfund.
 *
 * Genau deshalb liest die Erkennung die EINHEIT mit, statt sie zu erraten: eine „165" auf einer
 * Waage in Pfund als Kilogramm zu übernehmen wäre die teuerste denkbare Fehl-Lesung.
 *
 * Ohne Vision-Provider gibt es KEINEN OCR-Rückfall — Begründung bei `detectSealDigits`.
 *
 * Erprobt gegen `qwen2.5vl:7b` (22.08.2026) mit gerenderten Anzeigen: Kilogramm, Pfund und eine
 * Anzeige mit Körperfett und BMI daneben wurden richtig gelesen, ein Bild ohne Waage lieferte
 * zweimal `null` statt einer geratenen Zahl. Rund sechs Sekunden je Aufruf. Ein ECHTES Foto —
 * Spiegelung, Winkel, Sieben-Segment — steht weiterhin aus.
 */
export async function detectScaleReading(imageUrl: string, rotation: Rotation = 0): Promise<ScaleReading | null> {
  return detectSealDigits<ScaleReading>(imageUrl, rotation, {
    minLen: 2,
    maxLen: 5,
    logPrefix: "scale",
    localFallback: false,
    parse: scaleReadingFromReply,
    prompt: `This is a photo of a bathroom scale display. Read the weight shown on it — usually 2–3 digits with at most one or two decimals (e.g. 78.4, 165.2). Read ONLY the large main number; ignore body-fat, BMI or memory-slot values shown in smaller digits.
Also report the unit if the display shows one (kg, lb or lbs).
Reply with JSON only: {"detected": "<the number, or null>", "unit": "<kg|lb|null>"}. If you cannot read the display, use null for both.`,
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
