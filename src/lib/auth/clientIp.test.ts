import { describe, it, expect } from "vitest";
import { clientIp } from "./clientIp";
import { expectImportFree } from "@/test/importFree";

const h = (o: Record<string, string>) => new Headers(o);

describe("clientIp", () => {
  it("nimmt den LETZTEN Eintrag von X-Forwarded-For — den Traefik angehängt hat", () => {
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6,  1.2.3.4 " }))).toBe("1.2.3.4");
  });

  it("fällt auf x-real-ip, dann auf 'unknown' zurück", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(h({}))).toBe("unknown");
  });

  it("ein leerer Header ist kein Wert", () => {
    expect(clientIp(h({ "x-forwarded-for": "", "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(h({ "x-forwarded-for": " " }))).toBe("unknown");
  });

  it("liest die Header einer Anfrage", () => {
    expect(clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }).headers)).toBe("2.2.2.2");
  });

  it("ist importfrei (Proxy und Server-Log nehmen es, ohne die Datenbank nachzuziehen)", () => {
    expectImportFree("src/lib/auth/clientIp.ts");
  });
});
