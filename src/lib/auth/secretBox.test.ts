import { describe, it, expect, afterEach } from "vitest";
import { openSecret, sealSecret } from "./secretBox";

const ORIGINAL = process.env.NEXTAUTH_SECRET;
afterEach(() => { process.env.NEXTAUTH_SECRET = ORIGINAL; });

describe("secretBox", () => {
  it("verschlüsselt und entschlüsselt verlustfrei — und der Klartext steht nicht im Ergebnis", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const sealed = sealSecret("sk-ant-geheim-1234");
    expect(sealed).not.toContain("geheim");
    expect(openSecret(sealed)).toBe("sk-ant-geheim-1234");
  });

  it("zweimal derselbe Klartext ergibt verschiedene Chiffrate (zufälliger IV)", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    expect(sealSecret("x")).not.toBe(sealSecret("x"));
  });

  it("mit anderem NEXTAUTH_SECRET ist das Geheimnis verloren statt falsch", () => {
    process.env.NEXTAUTH_SECRET = "alt";
    const sealed = sealSecret("sk-1");
    process.env.NEXTAUTH_SECRET = "neu";
    expect(openSecret(sealed)).toBeNull();
  });

  it("veränderte oder kaputte Daten liefern null, werfen nie", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const [v, iv, tag, body] = sealSecret("sk-1").split(".");
    const flipped = Buffer.from(body, "base64");
    flipped[0] ^= 0xff;
    expect(openSecret([v, iv, tag, flipped.toString("base64")].join("."))).toBeNull();
    expect(openSecret("kein.format")).toBeNull();
    expect(openSecret("")).toBeNull();
  });

  it("ohne NEXTAUTH_SECRET wird nicht mit einem Ersatzwert verschlüsselt", () => {
    delete process.env.NEXTAUTH_SECRET;
    expect(() => sealSecret("sk-1")).toThrow();
  });
});
