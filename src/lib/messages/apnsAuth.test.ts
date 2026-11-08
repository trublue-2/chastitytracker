import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";
import { apnsProviderToken, resetApnsTokenCache } from "./apnsAuth";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const T0 = 1_800_000_000_000;
const MIN = 60_000;

const cfg = (loadKey = vi.fn(async () => PEM)) => ({ keyId: "KID", teamId: "TEAM", loadKey });

beforeEach(() => resetApnsTokenCache());

describe("apnsProviderToken", () => {
  it("signiert einen gültigen ES256-JWT mit kid, iss und iat", async () => {
    const jwt = await apnsProviderToken(cfg(), T0);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KID" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM", iat: T0 / 1000 });
    const ok = createVerify("SHA256").update(`${h}.${c}`).verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("verwendet den Token wieder und liest den Schlüssel nur einmal", async () => {
    const c = cfg();
    const a = await apnsProviderToken(c, T0);
    const b = await apnsProviderToken(c, T0 + 49 * MIN);
    expect(b).toBe(a);
    expect(c.loadKey).toHaveBeenCalledOnce();
  });

  it("erneuert ihn nach 50 Minuten", async () => {
    const c = cfg();
    const a = await apnsProviderToken(c, T0);
    const b = await apnsProviderToken(c, T0 + 51 * MIN);
    expect(b).not.toBe(a);
    expect(c.loadKey).toHaveBeenCalledTimes(2);
  });

  it("parallele Aufrufer teilen sich EINE Signatur", async () => {
    const c = cfg();
    const [a, b, d] = await Promise.all([apnsProviderToken(c, T0), apnsProviderToken(c, T0), apnsProviderToken(c, T0)]);
    expect(a).toBe(b);
    expect(b).toBe(d);
    expect(c.loadKey).toHaveBeenCalledOnce();
  });

  it("ein anderer Schlüssel verwirft den Merker", async () => {
    const a = await apnsProviderToken(cfg(), T0);
    const b = await apnsProviderToken({ ...cfg(), keyId: "OTHER" }, T0);
    expect(b).not.toBe(a);
  });

  it("ein synchron werfender Schlüssel-Zugriff bleibt nicht als Dauerfehler hängen", async () => {
    const throwing = { ...cfg(), loadKey: vi.fn(() => { throw new Error("sync"); }) as unknown as () => Promise<string> };
    await expect(apnsProviderToken(throwing, T0)).rejects.toThrow("sync");
    await expect(apnsProviderToken(cfg(), T0)).resolves.toContain(".");
  });

  it("ein gescheiterter Schlüssel-Zugriff wird nicht gemerkt", async () => {
    const failing = { ...cfg(), loadKey: vi.fn().mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValue(PEM) };
    await expect(apnsProviderToken(failing, T0)).rejects.toThrow("ENOENT");
    await expect(apnsProviderToken(failing, T0)).resolves.toContain(".");
  });
});
