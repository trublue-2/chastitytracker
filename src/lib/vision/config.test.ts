import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  checkPhotoAnalysisInput,
  disclosureOf,
  mergePhotoAnalysis,
  modelFor,
  photoAnalysisNoticeDue,
  resolveVisionFrom,
  SHARED_KEY_GRACE_DAYS,
  visionSpec,
  type StoredPhotoAnalysis,
  type VisionConfig,
} from "./config";
import { acceptsTemperature } from "./anthropic";
import { VISION_PROVIDERS } from "./providers";
import { expectImportFree } from "@/test/importFree";

const NOW = new Date("2026-09-20T12:00:00Z");
// Ein „Entschlüsseln", das den Klartext hinter einem Präfix zurückgibt — der Test prüft die Regel,
// nicht die Kryptografie (die hat ihren eigenen Test).
const open = (sealed: string) => (sealed.startsWith("sealed:") ? sealed.slice(7) : null);
const seal = (plain: string) => `sealed:${plain}`;
const resolve = (stored: StoredPhotoAnalysis | null, env: Record<string, string> = {}, rolloutAt: Date | null = null) =>
  resolveVisionFrom(stored, env, NOW, { open, rolloutAt });
const active = (c: VisionConfig) => c.provider !== "off";

describe("resolveVisionFrom — die App überschreibt die .env", () => {
  it("ohne gespeicherte Einstellung entscheidet die .env wie bis 6.2.4", () => {
    const c = resolve(null, { ANTHROPIC_API_KEY: "sk-env" });
    expect(c).toMatchObject({ provider: "anthropic", apiKey: "sk-env", source: "env", sharedKeyUntil: null });
    expect(visionSpec(c).external).toBe(true);
    expect(active(resolve(null, {}))).toBe(false);
  });

  it("der eigene Server aus der .env ist aktiv, aber nicht extern", () => {
    const c = resolve(null, { VERIFY_PROVIDER: "local", LOCAL_VISION_BASE_URL: "http://box:11434/v1", LOCAL_VISION_MODEL_SEAL: "big" });
    expect(c).toMatchObject({ provider: "ownServer", label: "box" });
    expect(visionSpec(c)).toMatchObject({ protocol: "openai", external: false });
    expect(modelFor(c, "seal-detect")).toBe("big");
  });

  it("„aus\" in der App schlägt einen Schlüssel in der .env", () => {
    const c = resolve({ provider: "off" }, { ANTHROPIC_API_KEY: "sk-env" });
    expect(c).toMatchObject({ provider: "off", source: "app", apiKey: null });
  });

  it("ein eigener Schlüssel in der App wird benutzt, auch wenn die .env einen trägt", () => {
    const c = resolve({ provider: "anthropic", keySealed: "sealed:sk-own" }, { ANTHROPIC_API_KEY: "sk-env" });
    expect(c).toMatchObject({ apiKey: "sk-own", sharedKeyUntil: null });
  });

  it("Anthropic ohne je einen eigenen Schlüssel fällt auf den der .env zurück", () => {
    expect(resolve({ provider: "anthropic" }, { ANTHROPIC_API_KEY: "sk-env" }).apiKey).toBe("sk-env");
  });

  it("ein hinterlegter, aber unlesbarer Schlüssel fällt NICHT still auf den der .env zurück", () => {
    // Genau der Fall eines geänderten NEXTAUTH_SECRET: der Admin hat bewusst den eigenen Schlüssel
    // eingetragen und soll nicht unbemerkt wieder über den des Portal-Betreibers laufen.
    const c = resolve({ provider: "anthropic", keySealed: "kaputt" }, { ANTHROPIC_API_KEY: "sk-env" });
    expect(active(c)).toBe(false);
  });

  it("andere Anbieter fallen NICHT auf den Anthropic-Schlüssel der .env zurück", () => {
    expect(active(resolve({ provider: "openai" }, { ANTHROPIC_API_KEY: "sk-env" }))).toBe(false);
  });

  it("OpenAI-kompatible Anbieter bekommen ihre feste Adresse und Vorgabe-Modelle", () => {
    const c = resolve({ provider: "gemini", keySealed: "sealed:k" });
    expect(c).toMatchObject({ provider: "gemini", baseUrl: VISION_PROVIDERS.gemini.baseUrl, label: "Google Gemini" });
    expect(modelFor(c, "code-verify")).toBe(VISION_PROVIDERS.gemini.models!.strong);
    expect(modelFor(c, "device-check")).toBe(VISION_PROVIDERS.gemini.models!.light);
  });

  it("vom Admin gesetzte Modelle überschreiben die Vorgaben", () => {
    const c = resolve({ provider: "openai", keySealed: "sealed:k", modelStrong: "x-strong", modelLight: "x-light" });
    expect(c.models).toEqual({ strong: "x-strong", light: "x-light" });
  });

  it("ein beliebiger Dienst braucht Adresse und Modelle und trägt seinen Hostnamen als Namen", () => {
    expect(active(resolve({ provider: "custom", keySealed: "sealed:k", baseUrl: "https://ai.example.org/v1" }))).toBe(false);
    const c = resolve({ provider: "custom", keySealed: "sealed:k", baseUrl: "https://ai.example.org/v1", modelStrong: "m", modelLight: "m" });
    expect(c).toMatchObject({ provider: "custom", label: "ai.example.org" });
    expect(visionSpec(c).external).toBe(true);
  });

  it("der eigene Server in der App braucht keinen Schlüssel und ist nicht extern", () => {
    const c = resolve({ provider: "ownServer", baseUrl: "http://192.168.1.5:11434/v1" });
    expect(active(c)).toBe(true);
    expect(visionSpec(c).external).toBe(false);
  });
});

describe("Übergangsfrist VISION_SHARED_KEY_UNTIL", () => {
  const env = (until: string) => ({ ANTHROPIC_API_KEY: "sk-shared", VISION_SHARED_KEY_UNTIL: until });

  it("vor dem Stichtag läuft der geteilte Schlüssel — und die Konfiguration sagt es", () => {
    const c = resolve(null, env("2026-10-13T00:00:00Z"));
    expect(active(c)).toBe(true);
    expect(c.sharedKeyUntil?.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("ab dem Stichtag gilt er nicht mehr — die Frist endet von selbst", () => {
    expect(active(resolve(null, env("2026-09-20T12:00:00Z")))).toBe(false);
    expect(active(resolve({ provider: "anthropic" }, env("2026-09-01T00:00:00Z")))).toBe(false);
  });

  it("ein eigener Schlüssel ist von der Frist nicht betroffen", () => {
    const c = resolve({ provider: "anthropic", keySealed: "sealed:sk-own" }, env("2026-09-01T00:00:00Z"));
    expect(c).toMatchObject({ provider: "anthropic", apiKey: "sk-own", sharedKeyUntil: null });
  });

  it("ein unlesbares Datum heisst AUS, nicht „ohne Frist\"", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(active(resolve(null, env("demnächst")))).toBe(false);
    spy.mockRestore();
  });
});

describe(`Übergangsfrist auf Portal-Instanzen — ${SHARED_KEY_GRACE_DAYS} Tage ab dem ersten Boot`, () => {
  const portal = { ANTHROPIC_API_KEY: "sk-shared", PORTAL_SHARED_SECRET: "p" };
  const daysBefore = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

  it("innerhalb der Frist läuft der geteilte Schlüssel, und das Ende steht fest", () => {
    const c = resolve(null, portal, daysBefore(10));
    expect(active(c)).toBe(true);
    expect(c.sharedKeyUntil?.getTime()).toBe(daysBefore(10).getTime() + SHARED_KEY_GRACE_DAYS * 86_400_000);
  });

  it("danach nicht mehr — auch nicht über eine gespeicherte Anthropic-Einstellung ohne eigenen Schlüssel", () => {
    expect(active(resolve(null, portal, daysBefore(SHARED_KEY_GRACE_DAYS)))).toBe(false);
    expect(active(resolve({ provider: "anthropic" }, portal, daysBefore(40)))).toBe(false);
  });

  it("fehlt der Beginn auf einer Portal-Instanz, ist der geteilte Schlüssel aus", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(active(resolve(null, portal, null))).toBe(false);
    spy.mockRestore();
  });

  it("ein Self-Hoster ohne Portal-Geheimnis behält seinen .env-Schlüssel ohne Frist", () => {
    const c = resolve(null, { ANTHROPIC_API_KEY: "sk-own" }, daysBefore(400));
    expect(c).toMatchObject({ provider: "anthropic", apiKey: "sk-own", sharedKeyUntil: null });
  });

  it("VISION_SHARED_KEY_UNTIL verschiebt das Ende bewusst", () => {
    const c = resolve(null, { ...portal, VISION_SHARED_KEY_UNTIL: "2026-12-01T00:00:00Z" }, daysBefore(60));
    expect(c.sharedKeyUntil?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("disclosureOf / photoAnalysisNoticeDue — wann der Hinweis erscheint", () => {
  it("unterscheidet Empfänger, nicht Schlüssel", () => {
    const a = resolve({ provider: "anthropic", keySealed: "sealed:1" });
    const b = resolve({ provider: "anthropic", keySealed: "sealed:2" });
    const o = resolve({ provider: "openai", keySealed: "sealed:1" });
    expect(disclosureOf(a)).toBe(disclosureOf(b));
    expect(disclosureOf(a)).not.toBe(disclosureOf(o));
  });

  it("nichts Aktives oder nur der eigene Server heisst „none\"", () => {
    expect(disclosureOf(resolve({ provider: "off" }))).toBe("none");
    expect(disclosureOf(resolve({ provider: "openai" }))).toBe("none");
    expect(disclosureOf(resolve({ provider: "ownServer", baseUrl: "http://box/v1" }))).toBe("none");
  });

  it("die .env-Instanz mit Anthropic-Schlüssel ist extern wie eine gespeicherte", () => {
    expect(disclosureOf(resolve(null, { ANTHROPIC_API_KEY: "k" }))).toBe(disclosureOf(resolve({ provider: "anthropic", keySealed: "sealed:k" })));
  });

  it("fällig bei neuem Empfänger und beim Ende — nie auf einer Instanz, die nie extern war", () => {
    expect(photoAnalysisNoticeDue("external:anthropic", null)).toBe(true);
    expect(photoAnalysisNoticeDue("external:anthropic", "external:anthropic")).toBe(false);
    expect(photoAnalysisNoticeDue("external:openai", "external:anthropic")).toBe(true);
    expect(photoAnalysisNoticeDue("none", "external:anthropic")).toBe(true);
    expect(photoAnalysisNoticeDue("none", null)).toBe(false);
    expect(photoAnalysisNoticeDue("none", "none")).toBe(false);
  });
});

describe("checkPhotoAnalysisInput / mergePhotoAnalysis", () => {
  it("ein fremder Dienst nur über https, der eigene Server auch über http", () => {
    expect(checkPhotoAnalysisInput({ provider: "custom", baseUrl: "http://ai.example.org/v1", modelStrong: "m", modelLight: "m" })).toBe("photoAnalysisBaseUrlInvalid");
    expect(checkPhotoAnalysisInput({ provider: "ownServer", baseUrl: "http://192.168.1.5:11434/v1" })).toBeNull();
    expect(checkPhotoAnalysisInput({ provider: "ownServer", baseUrl: "kein url" })).toBe("photoAnalysisBaseUrlInvalid");
  });

  it("ohne Vorgabe-Modelle müssen beide genannt sein", () => {
    expect(checkPhotoAnalysisInput({ provider: "custom", baseUrl: "https://a.example.org/v1", modelStrong: "m" })).toBe("photoAnalysisModelsRequired");
    expect(checkPhotoAnalysisInput({ provider: "openai" })).toBeNull();
    expect(checkPhotoAnalysisInput({ provider: "off" })).toBeNull();
  });

  it("ohne neuen Schlüssel bleibt der alte — aber nur beim selben Anbieter", () => {
    const prev: StoredPhotoAnalysis = { provider: "openai", keySealed: "sealed:old", keyLast4: "1234" };
    expect(mergePhotoAnalysis({ provider: "openai" }, prev, seal)).toMatchObject({ keySealed: "sealed:old", keyLast4: "1234" });
    expect(mergePhotoAnalysis({ provider: "mistral" }, prev, seal)).toMatchObject({ keySealed: null, keyLast4: null });
  });

  it("ein neuer Schlüssel wird versiegelt, ein leerer löscht", () => {
    const prev: StoredPhotoAnalysis = { provider: "openai", keySealed: "sealed:old", keyLast4: "1234" };
    expect(mergePhotoAnalysis({ provider: "openai", apiKey: " sk-abcdWXYZ " }, prev, seal)).toMatchObject({ keySealed: "sealed:sk-abcdWXYZ", keyLast4: "WXYZ" });
    expect(mergePhotoAnalysis({ provider: "openai", apiKey: "" }, prev, seal)).toMatchObject({ keySealed: null, keyLast4: null });
  });

  it("„aus\" vergisst alles, auch den Schlüssel", () => {
    expect(mergePhotoAnalysis({ provider: "off" }, { provider: "openai", keySealed: "sealed:x" }, seal)).toEqual({ provider: "off" });
  });

  it("eine feste Adresse wird nicht gespeichert, auch wenn der Client eine schickt", () => {
    expect(mergePhotoAnalysis({ provider: "openai", baseUrl: "https://evil.example/v1" }, null, seal).baseUrl).toBeNull();
  });
});

describe("acceptsTemperature", () => {
  it("die Vorgabe-Modelle nehmen temperature, neuere Anthropic-Modelle nicht", () => {
    expect(acceptsTemperature(VISION_PROVIDERS.anthropic.models!.strong)).toBe(true);
    expect(acceptsTemperature(VISION_PROVIDERS.anthropic.models!.light)).toBe(true);
    for (const m of ["claude-opus-4-7", "claude-opus-5", "claude-sonnet-5", "claude-fable-5-1"]) {
      expect(acceptsTemperature(m)).toBe(false);
    }
  });
});

describe("providers.ts", () => {
  /** Die Admin-Oberfläche liest die Liste im Client — ein Import zöge Server-Code ins Bündel. */
  it("bleibt importfrei", () => {
    expectImportFree("src/lib/vision/providers.ts");
  });
});
