import { describe, it, expect, afterEach, vi } from "vitest";

const lookup = vi.fn();
vi.mock("dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a) }));

import { isAllowedVisionUrl, isInternalAddress } from "./urlGuard";

afterEach(() => {
  delete process.env.VISION_ALLOW_PRIVATE_URLS;
  lookup.mockReset();
});

describe("isInternalAddress", () => {
  it("erkennt die internen IPv4-Bereiche — auch den Tailscale-Bereich", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.18.0.24", "192.168.1.5", "169.254.1.1", "100.100.1.1", "0.0.0.0"]) {
      expect(isInternalAddress(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "93.184.216.34"]) {
      expect(isInternalAddress(ip)).toBe(false);
    }
  });

  it("erkennt interne IPv6-Adressen samt eingebettetem IPv4", () => {
    for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isInternalAddress(ip)).toBe(true);
    expect(isInternalAddress("2606:4700::1111")).toBe(false);
  });
});

describe("isAllowedVisionUrl", () => {
  it("sperrt Container-Namen und interne Adressen — genau das Docker-Netz einer Portal-Instanz", async () => {
    expect(await isAllowedVisionUrl("http://heimdall:8080/api")).toBe(false);
    expect(await isAllowedVisionUrl("http://tracker-portal:3000")).toBe(false);
    expect(await isAllowedVisionUrl("http://localhost:11434/v1")).toBe(false);
    expect(await isAllowedVisionUrl("http://172.18.0.5:3000")).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("löst den Hostnamen auf: ein öffentlicher Name mit interner Adresse ist gesperrt", async () => {
    lookup.mockResolvedValueOnce([{ address: "10.0.0.7", family: 4 }]);
    expect(await isAllowedVisionUrl("https://sneaky.example.org/v1")).toBe(false);
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    expect(await isAllowedVisionUrl("https://ai.example.org/v1")).toBe(true);
  });

  it("ein nicht auflösbarer Name ist kein erlaubtes Ziel", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await isAllowedVisionUrl("https://gibtsnicht.example.org/v1")).toBe(false);
  });

  it("der Betreiber kann private Ziele ausdrücklich freigeben", async () => {
    process.env.VISION_ALLOW_PRIVATE_URLS = "true";
    expect(await isAllowedVisionUrl("http://192.168.1.5:11434/v1")).toBe(true);
  });
});
