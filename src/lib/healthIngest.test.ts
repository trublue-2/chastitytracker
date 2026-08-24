import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkHealthToken, healthTokenFor, healthIngestSecret } from "@/lib/healthIngest";

/**
 * Der Zugang liegt auf dem HANDY des Trägers, nicht auf einem Server des Betreibers — deshalb ein
 * Token je Person statt eines gemeinsamen Instanz-Secrets. Diese Tests halten genau das fest.
 */
const ORIGINAL = process.env.HEALTH_INGEST_SECRET;

beforeEach(() => { process.env.HEALTH_INGEST_SECRET = "test-secret"; });
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.HEALTH_INGEST_SECRET;
  else process.env.HEALTH_INGEST_SECRET = ORIGINAL;
});

describe("der Zugang für gemeldete Wiegungen", () => {
  it("gibt jedem Träger ein ANDERES Token", () => {
    // Der ganze Grund für den HMAC: mit einem gemeinsamen Secret könnte jeder Träger Werte für
    // jeden anderen der Instanz schreiben.
    expect(healthTokenFor("alice")).not.toBe(healthTokenFor("bob"));
  });

  it("liefert für denselben Namen immer dasselbe Token", () => {
    expect(healthTokenFor("alice")).toBe(healthTokenFor("alice"));
  });

  it("nimmt das Token nur für SEINEN Träger an", () => {
    const alice = healthTokenFor("alice")!;
    expect(checkHealthToken("alice", alice)).toBe(true);
    expect(checkHealthToken("bob", alice)).toBe(false);
  });

  it("weist Leeres und Falsches ab", () => {
    expect(checkHealthToken("alice", null)).toBe(false);
    expect(checkHealthToken("alice", "")).toBe(false);
    expect(checkHealthToken("alice", "deadbeef")).toBe(false);
  });

  it("ohne Instanz-Secret gibt es weder Token noch Zugang", () => {
    delete process.env.HEALTH_INGEST_SECRET;
    expect(healthIngestSecret()).toBeNull();
    expect(healthTokenFor("alice")).toBeNull();
    // Und vor allem: dann lässt sich AUCH NICHTS vorlegen, das durchkäme.
    expect(checkHealthToken("alice", "irgendwas")).toBe(false);
  });

  it("ein gedrehtes Instanz-Secret entwertet die alten Token", () => {
    const before = healthTokenFor("alice")!;
    process.env.HEALTH_INGEST_SECRET = "anderes-secret";
    expect(checkHealthToken("alice", before)).toBe(false);
  });
});
