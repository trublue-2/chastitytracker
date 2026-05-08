import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEntryPayload, deviceCategoriesEnabled, VALID_TYPES, KG_ENTRY_TYPES, WEAR_ENTRY_TYPES } from "./constants";

const FUTURE_SAFE_TIME = "2030-01-01T10:00:00Z";

describe("VALID_TYPES", () => {
  it("contains VERSCHLUSS, OEFFNEN, PRUEFUNG, ORGASMUS, WEAR_BEGIN, WEAR_END", () => {
    expect(VALID_TYPES).toEqual(["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"]);
  });

  it("KG_ENTRY_TYPES contains exactly VERSCHLUSS and OEFFNEN", () => {
    expect([...KG_ENTRY_TYPES].sort()).toEqual(["OEFFNEN", "VERSCHLUSS"]);
  });

  it("WEAR_ENTRY_TYPES contains exactly WEAR_BEGIN and WEAR_END", () => {
    expect([...WEAR_ENTRY_TYPES].sort()).toEqual(["WEAR_BEGIN", "WEAR_END"]);
  });
});

describe("deviceCategoriesEnabled (default-on, opt-out via 'false')", () => {
  const original = process.env.ENABLE_DEVICE_CATEGORIES;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_DEVICE_CATEGORIES;
    else process.env.ENABLE_DEVICE_CATEGORIES = original;
  });

  it("returns true when env var is unset (default-on)", () => {
    delete process.env.ENABLE_DEVICE_CATEGORIES;
    expect(deviceCategoriesEnabled()).toBe(true);
  });

  it("returns false only when env var is exactly 'false' (opt-out)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    expect(deviceCategoriesEnabled()).toBe(false);
  });

  it("returns true for 'true', '1', '', or other values", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "true";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "1";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "";
    expect(deviceCategoriesEnabled()).toBe(true);
  });
});

describe("validateEntryPayload — WEAR types feature flag (default-on)", () => {
  const original = process.env.ENABLE_DEVICE_CATEGORIES;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_DEVICE_CATEGORIES;
    else process.env.ENABLE_DEVICE_CATEGORIES = original;
  });

  it("accepts WEAR_BEGIN by default (flag unset)", () => {
    delete process.env.ENABLE_DEVICE_CATEGORIES;
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });

  it("rejects WEAR_BEGIN when explicitly opted out (=false)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result?.error).toMatch(/Device-Kategorien/);
    expect(result?.status).toBe(400);
  });

  it("rejects WEAR_END when explicitly opted out (=false)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_END", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result?.error).toMatch(/Device-Kategorien/);
  });

  it("VERSCHLUSS works regardless of feature flag", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "VERSCHLUSS", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });
});
