import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "crypto";
import { fcmAccessToken, fcmAssertion, parseServiceAccount, resetFcmTokenCache } from "./fcmAuth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = {
  project_id: "proj",
  client_email: "push@proj.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: "https://oauth2.googleapis.com/token",
};
const T0 = 1_800_000_000_000;
const MIN = 60_000;

const tokenFetch = (token = "at-1", expiresIn = 3600) =>
  vi.fn(async () => new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

beforeEach(() => resetFcmTokenCache());

describe("fcmAssertion", () => {
  it("signiert ein RS256-JWT mit Scope, Audience und einer Stunde Laufzeit", () => {
    const [h, c, s] = fcmAssertion(SA, T0).split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({
      iss: SA.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: SA.token_uri,
      iat: T0 / 1000,
      exp: T0 / 1000 + 3600,
    });
    expect(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
  });
});

describe("fcmAccessToken", () => {
  it("tauscht das JWT am token_uri und merkt den Token bis 5 min vor Ablauf", async () => {
    const f = tokenFetch();
    expect(await fcmAccessToken(SA, 1000, T0, f)).toBe("at-1");
    expect(await fcmAccessToken(SA, 1000, T0 + 54 * MIN, f)).toBe("at-1");
    expect(f).toHaveBeenCalledOnce();
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SA.token_uri);
    expect(String(init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");

    await fcmAccessToken(SA, 1000, T0 + 56 * MIN, f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("ein abgelehnter Tausch wird nicht gemerkt", async () => {
    const failing = vi.fn(async () => new Response("{}", { status: 400 })) as unknown as typeof fetch;
    await expect(fcmAccessToken(SA, 1000, T0, failing)).rejects.toThrow("HTTP 400");
    await expect(fcmAccessToken(SA, 1000, T0, tokenFetch("at-2"))).resolves.toBe("at-2");
  });
});

describe("parseServiceAccount", () => {
  it("verlangt die vier Felder des Versands", () => {
    expect(parseServiceAccount(JSON.stringify(SA)).project_id).toBe("proj");
    expect(() => parseServiceAccount(JSON.stringify({ ...SA, private_key: undefined }))).toThrow("private_key");
  });
});
