import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret } from "@/lib/secretBox";
import {
  VISION_PROVIDERS,
  adminSetsBaseUrl,
  hostLabel,
  isVisionProviderId,
  type VisionModels,
  type VisionProviderId,
  type VisionProviderSpec,
} from "./providers";
import type { VisionTask } from "./types";
import { isAllowedVisionUrl } from "./urlGuard";
import { isPortalInstance } from "@/lib/portalInstance";

/**
 * WELCHE Foto-Prüfung gilt auf dieser Instanz — die eine Stelle, die das entscheidet.
 *
 * **Die Regel: die Einstellung in der App überschreibt die `.env`.**
 *
 * | Einstellung in der App             | Ergebnis                                                   |
 * |------------------------------------|------------------------------------------------------------|
 * | nie gespeichert                    | die `.env` entscheidet wie bis 6.2.4 (`VERIFY_PROVIDER` & Co.) |
 * | `off`                              | keine Prüfung, auch wenn die `.env` einen Schlüssel trägt   |
 * | Anbieter mit eigenem Schlüssel     | dieser Schlüssel                                           |
 * | `anthropic`, nie ein eigener       | der `ANTHROPIC_API_KEY` der `.env`, falls vorhanden         |
 *
 * **Die Übergangsfrist.** Portal-Instanzen tragen bis 6.2.4 den Schlüssel des Portal-Betreibers in
 * der `.env`. Er gilt noch `SHARED_KEY_GRACE_DAYS` Tage ab dem ersten Boot mit dieser Version
 * (AppMeta `photoAnalysisRolloutAt`, geschrieben von einer Migration) und endet dann HIER von selbst —
 * niemand muss am Stichtag Dateien ändern. Erkannt wird eine Portal-Instanz an `PORTAL_SHARED_SECRET`;
 * Self-Hoster haben es nicht und behalten ihren eigenen `.env`-Schlüssel ohne Frist.
 * `VISION_SHARED_KEY_UNTIL` überschreibt das Ende, falls es bewusst verschoben werden soll.
 *
 * **Warum async und gecacht.** Die Einstellung liegt in der Datenbank; gefragt wird sie im
 * Herzschlag jedes offenen Dashboards. 15 Sekunden Cache kosten nach dem Speichern nichts, weil
 * `savePhotoAnalysis` ihn verwirft — nur ein zweiter Prozess sähe die Änderung verzögert, und
 * einen zweiten Prozess gibt es im Container nicht.
 */

export const PHOTO_ANALYSIS_META_KEY = "photoAnalysis";
const ROLLOUT_META_KEY = "photoAnalysisRolloutAt";
export const SHARED_KEY_GRACE_DAYS = 30;
const CACHE_MS = 15_000;

/** Was in `AppMeta` steht (als JSON). Den Schlüssel gibt es darin nur verschlüsselt. */
export interface StoredPhotoAnalysis {
  provider: VisionProviderId;
  baseUrl?: string | null;
  keySealed?: string | null;
  /** Die letzten vier Zeichen — damit der Admin erkennt, WELCHER Schlüssel hinterlegt ist, ohne
   *  dass der Schlüssel je die Instanz wieder verlässt. */
  keyLast4?: string | null;
  modelStrong?: string | null;
  modelLight?: string | null;
}

/**
 * Die gültige Einstellung. **`provider: "off"` heisst inaktiv** — auch bei einer unvollständigen
 * Einstellung. Protokoll und „extern" stehen bewusst NICHT als eigene Felder hier: sie folgen aus
 * dem Anbieter (`visionSpec`), und zwei Quellen für dieselbe Auskunft laufen irgendwann auseinander.
 */
export interface VisionConfig {
  provider: VisionProviderId;
  /** Der Name, den der Hinweis den Nutzern nennt. */
  label: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  models: VisionModels | null;
  /** Nur der Alt-Weg über `.env`: eigenes Modell für die Siegel-Nummer (`LOCAL_VISION_MODEL_SEAL`). */
  sealModel?: string;
  source: "app" | "env";
  /** Nur gesetzt, SOLANGE die Prüfung über den geteilten `.env`-Schlüssel mit Ablaufdatum läuft. */
  sharedKeyUntil: Date | null;
}

export function visionSpec(config: VisionConfig): VisionProviderSpec {
  return VISION_PROVIDERS[config.provider];
}

const off = (source: VisionConfig["source"]): VisionConfig =>
  ({ provider: "off", label: null, baseUrl: null, apiKey: null, models: null, source, sharedKeyUntil: null });

type Env = Record<string, string | undefined>;

/** Was die reine Regel ausser Einstellung und `.env` braucht. */
export interface ResolveContext {
  /** Beginn der Übergangsfrist aus AppMeta — `null`, wenn die Zeile fehlt. */
  rolloutAt?: Date | null;
  open?: (sealed: string) => string | null;
}

/** Jede Warnung einmal je Prozess: der Zustand dahinter ändert sich zur Laufzeit nicht, und die
 *  Auflösung läuft im Herzschlag jedes offenen Dashboards. */
const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.error(message);
}

/** Längst vergangen — ein abgelaufener Schlüssel ist dasselbe wie einer, dessen Frist heute endete. */
const EXPIRED = new Date(0);

/** Wann der geteilte Schlüssel endet: `null` = ohne Frist (Self-Hoster). */
function sharedKeyUntil(env: Env, rolloutAt: Date | null): Date | null {
  const raw = env.VISION_SHARED_KEY_UNTIL;
  if (raw) {
    const until = new Date(raw);
    if (!Number.isNaN(until.getTime())) return until;
    // Unlesbar heisst hier AUS, nicht „ohne Frist" — anders als bei `deployCutoff` (appMeta.ts), das
    // auf die DB zurückfällt: diese Variable gibt es nur, um das Senden zu beenden. Im Zweifel geht
    // kein Foto hinaus.
    warnOnce(`[vision] VISION_SHARED_KEY_UNTIL ist kein gültiges Datum: "${raw}" — geteilter Schlüssel gilt als abgelaufen`);
    return EXPIRED;
  }
  if (!isPortalInstance(env)) return null;
  // Eine Portal-Instanz ohne Beginn-Zeile: die Migration hat nicht gegriffen. Auch hier im Zweifel aus.
  if (!rolloutAt || Number.isNaN(rolloutAt.getTime())) {
    warnOnce(`[vision] AppMeta "${ROLLOUT_META_KEY}" fehlt — geteilter Schlüssel gilt als abgelaufen`);
    return EXPIRED;
  }
  return new Date(rolloutAt.getTime() + SHARED_KEY_GRACE_DAYS * 86_400_000);
}

/** Der `ANTHROPIC_API_KEY` der `.env`, solange die Übergangsfrist ihn lässt. `null` = keiner. */
function envAnthropicKey(env: Env, now: Date, rolloutAt: Date | null): { key: string; until: Date | null } | null {
  const key = env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const until = sharedKeyUntil(env, rolloutAt);
  return !until || now < until ? { key, until } : null;
}

/** Die Regel oben als reine Funktion — datenbankfrei, damit sie vollständig testbar ist. */
export function resolveVisionFrom(
  stored: StoredPhotoAnalysis | null,
  env: Env,
  now: Date,
  { rolloutAt = null, open = openSecret }: ResolveContext = {},
): VisionConfig {
  if (!stored) return resolveFromEnv(env, now, rolloutAt);
  const spec = VISION_PROVIDERS[stored.provider];
  if (!spec.protocol) return off("app");

  const ownKey = stored.keySealed ? open(stored.keySealed) : null;
  // Der Rückfall auf die `.env` gilt nur, solange NIE ein eigener Schlüssel hinterlegt war. Ist einer
  // da, aber nicht lesbar (anderes `NEXTAUTH_SECRET`), ist die Prüfung aus — sonst liefe ein Admin,
  // der bewusst auf den eigenen Schlüssel umgestellt hat, still wieder über den des Portal-Betreibers.
  const shared = !stored.keySealed && stored.provider === "anthropic" ? envAnthropicKey(env, now, rolloutAt) : null;
  const apiKey = ownKey ?? shared?.key ?? null;
  const baseUrl = spec.baseUrl ?? (stored.baseUrl || null);
  const strong = stored.modelStrong || spec.models?.strong;
  const light = stored.modelLight || spec.models?.light;
  if (!strong || !light || (spec.needsKey && !apiKey) || (adminSetsBaseUrl(spec) && !baseUrl)) return off("app");

  return {
    provider: stored.provider,
    label: spec.label ?? hostLabel(baseUrl),
    baseUrl,
    apiKey,
    models: { strong, light },
    source: "app",
    sharedKeyUntil: shared?.until ?? null,
  };
}

function resolveFromEnv(env: Env, now: Date, rolloutAt: Date | null): VisionConfig {
  if (env.VERIFY_PROVIDER === "local") {
    const baseUrl = env.LOCAL_VISION_BASE_URL;
    if (!baseUrl) return off("env");
    const base = env.LOCAL_VISION_MODEL || VISION_PROVIDERS.ownServer.models!.strong;
    return {
      provider: "ownServer",
      label: hostLabel(baseUrl),
      baseUrl,
      apiKey: env.LOCAL_VISION_API_KEY || null,
      models: { strong: env.LOCAL_VISION_MODEL_CODE || base, light: env.LOCAL_VISION_MODEL_DEVICE || base },
      sealModel: env.LOCAL_VISION_MODEL_SEAL || undefined,
      source: "env",
      sharedKeyUntil: null,
    };
  }
  const shared = envAnthropicKey(env, now, rolloutAt);
  if (!shared) return off("env");
  return {
    provider: "anthropic",
    label: VISION_PROVIDERS.anthropic.label,
    baseUrl: null,
    apiKey: shared.key,
    models: VISION_PROVIDERS.anthropic.models,
    source: "env",
    sharedKeyUntil: shared.until,
  };
}

/** Welches Modell eine Aufgabe bekommt. */
export function modelFor(config: VisionConfig, task: VisionTask): string | null {
  if (!config.models) return null;
  if (task === "code-verify") return config.models.strong;
  if (task === "seal-detect") return config.sealModel ?? config.models.strong;
  return config.models.light;
}

/**
 * Der Fingerabdruck dessen, was ein Nutzer über den Datenweg wissen muss. Ändert er sich gegenüber
 * dem zuletzt quittierten, erscheint der Hinweis erneut. Anbieter-genau: ein Wechsel von Anthropic
 * zu OpenAI schickt die Fotos an einen ANDEREN Empfänger, und das ist neu zu sagen. Ein neuer
 * Schlüssel beim selben Anbieter ist es nicht.
 */
export function disclosureOf(config: VisionConfig): string {
  if (!visionSpec(config).external) return "none";
  return config.provider === "custom" ? `external:custom:${config.label ?? ""}` : `external:${config.provider}`;
}

/**
 * Ist der Hinweis für diesen Nutzer fällig? Zwei Fälle, und nur zwei:
 * - Fotos gehen extern hinaus, und er hat genau DIESEN Stand noch nicht quittiert.
 * - Fotos gingen hinaus, als er zuletzt quittierte, und tun es jetzt nicht mehr — er soll auch
 *   erfahren, dass es aufgehört hat (Ende der Übergangsfrist, Admin schaltet ab).
 * Wer nie etwas quittiert hat und auf einer Instanz ohne externe Prüfung ist, sieht nichts: es gibt
 * nichts zu sagen.
 */
export function photoAnalysisNoticeDue(current: string, seen: string | null | undefined): boolean {
  if (current.startsWith("external:")) return seen !== current;
  return !!seen?.startsWith("external:");
}

// ── Laufzeit: Datenbank, Cache, Test-Überschreibung ───────────────────────────────────────────

/** Das PROMISE wird gecacht, nicht der Wert: laufen beim Ablauf mehrere Herzschläge gleichzeitig
 *  ein, teilen sie sich eine Abfrage statt je eine eigene zu starten. */
let cache: { at: number; value: Promise<VisionConfig> } | null = null;
const override = new AsyncLocalStorage<VisionConfig>();

export async function readStoredPhotoAnalysis(): Promise<StoredPhotoAnalysis | null> {
  const row = await prisma.appMeta.findUnique({ where: { key: PHOTO_ANALYSIS_META_KEY } });
  return parseStoredPhotoAnalysis(row?.value);
}

function parseStoredPhotoAnalysis(value: string | undefined): StoredPhotoAnalysis | null {
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(value) as StoredPhotoAnalysis;
    if (isVisionProviderId(parsed?.provider)) return parsed;
  } catch { /* fällt unten durch */ }
  // Eine kaputte Zeile darf nicht zu „.env entscheidet" werden — das schaltete eine bewusst
  // ausgeschaltete Prüfung stillschweigend wieder ein. Kaputt heisst aus.
  console.error(`[vision] AppMeta "${PHOTO_ANALYSIS_META_KEY}" ist unlesbar — Foto-Prüfung gilt als aus`);
  return { provider: "off" };
}

/** Beide AppMeta-Zeilen, die die Auflösung braucht, in EINER Abfrage — geteilt von der Laufzeit und
 *  der Admin-Ansicht. Getrennt geladen hatte die Ansicht den Fristbeginn einmal vergessen und zeigte
 *  auf Portal-Instanzen „aus", während die Fotos über den geteilten Schlüssel hinausgingen. */
async function loadVisionInputs(): Promise<{ stored: StoredPhotoAnalysis | null; rolloutAt: Date | null }> {
  const rows = await prisma.appMeta.findMany({ where: { key: { in: [PHOTO_ANALYSIS_META_KEY, ROLLOUT_META_KEY] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const rollout = byKey.get(ROLLOUT_META_KEY);
  return { stored: parseStoredPhotoAnalysis(byKey.get(PHOTO_ANALYSIS_META_KEY)), rolloutAt: rollout ? new Date(rollout) : null };
}

/** Die gültige Einstellung. Innerhalb von `withVisionConfig` die dort gesetzte. */
export function currentVisionConfig(now = new Date()): Promise<VisionConfig> {
  const forced = override.getStore();
  if (forced) return Promise.resolve(forced);
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.value;
  const value = loadVisionInputs().then(({ stored, rolloutAt }) => resolveVisionFrom(stored, process.env, now, { rolloutAt }));
  cache = { at: now.getTime(), value };
  // Ein Fehlschlag darf nicht 15 Sekunden lang als Antwort liegen bleiben.
  value.catch(() => { if (cache?.value === value) cache = null; });
  return value;
}

/** Führt `fn` mit einer ENTWURFS-Einstellung aus — für „Einstellung testen", bevor gespeichert ist. */
export function withVisionConfig<T>(config: VisionConfig, fn: () => Promise<T>): Promise<T> {
  return override.run(config, fn);
}

export function invalidateVisionConfig(): void {
  cache = null;
}

// ── Schreiben ──────────────────────────────────────────────────────────────────────────────────

export interface PhotoAnalysisInput {
  provider: VisionProviderId;
  baseUrl?: string | null;
  /** `undefined` = den hinterlegten behalten (nur beim selben Anbieter), `null` oder `""` = löschen,
   *  sonst = neu setzen. */
  apiKey?: string | null;
  modelStrong?: string | null;
  modelLight?: string | null;
}

export type PhotoAnalysisErrorCode =
  | "photoAnalysisBaseUrlInvalid"
  | "photoAnalysisBaseUrlPrivate"
  | "photoAnalysisModelsRequired"
  | "photoAnalysisFieldTooLong";

const MAX_FIELD = 300;

/** Der Request-Body von Speichern und Testen. `null` = nicht einmal die Form stimmt. Die Felder
 *  werden hier nur nach Typ gefiltert; was sie bedeuten, prüft `checkPhotoAnalysisInput`. */
export function parsePhotoAnalysisInput(body: unknown): PhotoAnalysisInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!isVisionProviderId(b.provider)) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : v === null ? null : undefined);
  return {
    provider: b.provider,
    baseUrl: str(b.baseUrl),
    apiKey: str(b.apiKey),
    modelStrong: str(b.modelStrong),
    modelLight: str(b.modelLight),
  };
}

/** Prüfend und schreibfrei — geteilt von Speichern und Testen. */
export function checkPhotoAnalysisInput(input: PhotoAnalysisInput): PhotoAnalysisErrorCode | null {
  const spec = VISION_PROVIDERS[input.provider];
  for (const v of [input.baseUrl, input.apiKey, input.modelStrong, input.modelLight]) {
    if (typeof v === "string" && v.length > MAX_FIELD) return "photoAnalysisFieldTooLong";
  }
  // `off` hat nichts zu prüfen — jede Regel unten liest Anbieter-Felder, die dort `null` sind, und
  // „Aus" liesse sich sonst nicht speichern (so geschehen mit der Modell-Pflicht).
  if (!spec.protocol) return null;
  if (adminSetsBaseUrl(spec)) {
    let parsed: URL | null = null;
    try { parsed = new URL((input.baseUrl ?? "").trim()); } catch { /* unten */ }
    // Ein fremder Dienst NUR über https: der Schlüssel reist im Header mit. Der eigene Server darf
    // http, er steht typischerweise im lokalen Netz oder hinter einem Tunnel. Kein Query-String und
    // kein Fragment: `/chat/completions` wird angehängt, und ein `?` davor machte den Pfad zum
    // Parameter — die Anfrage träfe einen beliebigen anderen Endpunkt.
    const okScheme = parsed && (parsed.protocol === "https:" || (input.provider === "ownServer" && parsed.protocol === "http:"));
    if (!okScheme || parsed!.search || parsed!.hash) return "photoAnalysisBaseUrlInvalid";
  }
  if (!spec.models && !(input.modelStrong?.trim() && input.modelLight?.trim())) return "photoAnalysisModelsRequired";
  return null;
}

/** Zeigt die eingetragene Adresse auf ein erlaubtes Ziel? Getrennt von `checkPhotoAnalysisInput`,
 *  weil sie den Hostnamen AUFLÖST (async) — die Formprüfung bleibt rein. Siehe `urlGuard.ts`. */
export async function checkPhotoAnalysisTarget(input: PhotoAnalysisInput): Promise<PhotoAnalysisErrorCode | null> {
  if (!adminSetsBaseUrl(VISION_PROVIDERS[input.provider])) return null;
  return (await isAllowedVisionUrl((input.baseUrl ?? "").trim())) ? null : "photoAnalysisBaseUrlPrivate";
}

/** Baut aus Eingabe und bisherigem Stand den neuen gespeicherten Stand. Rein. */
export function mergePhotoAnalysis(
  input: PhotoAnalysisInput,
  previous: StoredPhotoAnalysis | null,
  seal: (plain: string) => string = sealSecret,
): StoredPhotoAnalysis {
  if (input.provider === "off") return { provider: "off" };
  const trimmed = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  const rawKey = input.apiKey === undefined ? undefined : trimmed(input.apiKey);
  const keepOld = rawKey === undefined && previous?.provider === input.provider;
  return {
    provider: input.provider,
    baseUrl: adminSetsBaseUrl(VISION_PROVIDERS[input.provider]) ? trimmed(input.baseUrl) : null,
    keySealed: rawKey ? seal(rawKey) : keepOld ? previous?.keySealed ?? null : null,
    keyLast4: rawKey ? rawKey.slice(-4) : keepOld ? previous?.keyLast4 ?? null : null,
    modelStrong: trimmed(input.modelStrong),
    modelLight: trimmed(input.modelLight),
  };
}

export async function savePhotoAnalysis(next: StoredPhotoAnalysis): Promise<void> {
  const value = JSON.stringify(next);
  await prisma.appMeta.upsert({
    where: { key: PHOTO_ANALYSIS_META_KEY },
    create: { key: PHOTO_ANALYSIS_META_KEY, value },
    update: { value },
  });
  invalidateVisionConfig();
}

/** Was die Admin-Oberfläche sehen darf — ausdrücklich OHNE Schlüssel. */
export interface PhotoAnalysisView {
  provider: VisionProviderId;
  baseUrl: string | null;
  keyLast4: string | null;
  modelStrong: string | null;
  modelLight: string | null;
  source: "app" | "env";
  /** ISO-Datum; nur gesetzt, solange der geteilte Schlüssel läuft. */
  sharedKeyUntil: string | null;
}

export async function photoAnalysisView(): Promise<PhotoAnalysisView> {
  // Frisch aufgelöst statt aus dem Cache: die Seite zeigt den Stand unmittelbar nach dem Speichern.
  const { stored, rolloutAt } = await loadVisionInputs();
  const resolved = resolveVisionFrom(stored, process.env, new Date(), { rolloutAt });
  return {
    // Ohne gespeicherte Einstellung zeigt die Oberfläche, was die `.env` gerade tatsächlich tut —
    // sonst stünde dort „aus", während Fotos längst hinausgehen.
    provider: stored?.provider ?? resolved.provider,
    baseUrl: stored ? stored.baseUrl ?? null : resolved.baseUrl,
    keyLast4: stored?.keyLast4 ?? null,
    modelStrong: stored?.modelStrong ?? null,
    modelLight: stored?.modelLight ?? null,
    source: resolved.source,
    sharedKeyUntil: resolved.sharedKeyUntil?.toISOString() ?? null,
  };
}
