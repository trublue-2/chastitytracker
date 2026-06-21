/**
 * Benchmark: lokales Vision-Modell vs. Anthropic auf denselben Bildern.
 *
 * Zweck: VOR dem produktiven Umschalten (`VERIFY_PROVIDER=local`) auf der echten
 * Hardware messen, wie gut & wie schnell das lokale Modell die Code-/Siegel-Erkennung
 * macht — verglichen mit Anthropic und (falls angegeben) gegen den Soll-Wert.
 *
 * Ausführung:
 *   npx tsx scripts/bench-vision.ts [manifest.json]
 *
 * Voraussetzungen:
 *   - .env.local enthält ANTHROPIC_API_KEY (für die Anthropic-Vergleichsläufe)
 *   - Ollama läuft + Modell gepullt; LOCAL_VISION_BASE_URL gesetzt (z.B. in .env.local
 *     oder via Shell: LOCAL_VISION_BASE_URL=http://localhost:11434/v1)
 *   - Testbilder liegen in data/uploads/ (die Lib-Funktionen lesen von dort)
 *
 * Manifest (Default: scripts/bench-vision.manifest.json):
 *   {
 *     "codeVerify": [{ "image": "1774183326540-xxx.jpg", "expected": "12345", "rotation": 0 }],
 *     "seal":       [{ "image": "1774183582351-yyy.jpg", "expected": "0012345" }]
 *   }
 *   "expected" ist optional — ohne wird nur Anthropic-vs-local-Übereinstimmung gezeigt.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// --- Minimaler .env.local-Loader (kein dotenv-Dependency) ---
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(join(process.cwd(), ".env.local"));

type Rotation = 0 | 90 | 180 | 270;
interface CodeItem { image: string; expected?: string; rotation?: Rotation }
interface SealItem { image: string; expected?: string; rotation?: Rotation }
interface Manifest { codeVerify?: CodeItem[]; seal?: SealItem[] }

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - start) };
}

function withProvider<T>(provider: "anthropic" | "local", fn: () => Promise<T>): Promise<T> {
  const prev = process.env.VERIFY_PROVIDER;
  process.env.VERIFY_PROVIDER = provider;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.VERIFY_PROVIDER;
    else process.env.VERIFY_PROVIDER = prev;
  });
}

function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

async function main() {
  // Import NACH dem Env-Load, damit die Module die Variablen sehen
  // (src/lib/anthropic.ts konstruiert den Client mit dem API-Key bei Import).
  const { verifyKontrolleCodeDetailed, detectSealNumber } = await import("@/lib/verifyCode");

  const manifestPath = process.argv[2] || join(process.cwd(), "scripts", "bench-vision.manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(`Manifest nicht gefunden: ${manifestPath}`);
    console.error("Lege eine JSON-Datei mit { codeVerify: [...], seal: [...] } an (siehe Header-Kommentar).");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasLocal = !!process.env.LOCAL_VISION_BASE_URL;
  console.log(`Provider verfügbar — anthropic: ${hasAnthropic}, local: ${hasLocal} (${process.env.LOCAL_VISION_MODEL || "qwen2.5-vl:7b"})`);
  console.log("");

  // --- Code-Verifikation ---
  for (const item of manifest.codeVerify ?? []) {
    const rot = (item.rotation ?? 0) as Rotation;
    const exp = item.expected ?? "?";
    const a = hasAnthropic
      ? await withProvider("anthropic", () => timed(() => verifyKontrolleCodeDetailed(item.image, item.expected ?? "", rot)))
      : null;
    const l = hasLocal
      ? await withProvider("local", () => timed(() => verifyKontrolleCodeDetailed(item.image, item.expected ?? "", rot)))
      : null;
    const aDet = a?.value?.detected ?? "—";
    const lDet = l?.value?.detected ?? "—";
    const agree = a && l ? (a.value?.match === l.value?.match ? "✓" : "✗") : "—";
    console.log(
      `[code] ${pad(item.image, 34)} soll=${pad(exp, 10)} ` +
      `anthropic=${pad(String(aDet), 10)}(${a ? a.value?.match : "-"}/${a?.ms ?? "-"}ms) ` +
      `local=${pad(String(lDet), 10)}(${l ? l.value?.match : "-"}/${l?.ms ?? "-"}ms) übereinstimmung=${agree}`
    );
  }

  // --- Siegelnummer ---
  for (const item of manifest.seal ?? []) {
    const rot = (item.rotation ?? 0) as Rotation;
    const exp = item.expected ?? "?";
    const a = hasAnthropic
      ? await withProvider("anthropic", () => timed(() => detectSealNumber(item.image, rot)))
      : null;
    const l = hasLocal
      ? await withProvider("local", () => timed(() => detectSealNumber(item.image, rot)))
      : null;
    const aDet = a?.value ?? "—";
    const lDet = l?.value ?? "—";
    const agree = a && l ? (a.value === l.value ? "✓" : "✗") : "—";
    console.log(
      `[seal] ${pad(item.image, 34)} soll=${pad(exp, 10)} ` +
      `anthropic=${pad(String(aDet), 10)}(${a?.ms ?? "-"}ms) ` +
      `local=${pad(String(lDet), 10)}(${l?.ms ?? "-"}ms) übereinstimmung=${agree}`
    );
  }

  console.log("\nFertig. Spalten: detected(match/latenz). übereinstimmung = anthropic vs local.");
}

main().catch((e) => { console.error(e); process.exit(1); });
