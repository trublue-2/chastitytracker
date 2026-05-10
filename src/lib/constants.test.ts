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

describe("deviceCategoriesEnabled", () => {
  const original = process.env.ENABLE_DEVICE_CATEGORIES;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_DEVICE_CATEGORIES;
    else process.env.ENABLE_DEVICE_CATEGORIES = original;
  });

  it("returns true when env var is unset (default ON)", () => {
    delete process.env.ENABLE_DEVICE_CATEGORIES;
    expect(deviceCategoriesEnabled()).toBe(true);
  });

  it("returns false when env var is 'false' (case-insensitive)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    expect(deviceCategoriesEnabled()).toBe(false);
    process.env.ENABLE_DEVICE_CATEGORIES = "False";
    expect(deviceCategoriesEnabled()).toBe(false);
    process.env.ENABLE_DEVICE_CATEGORIES = "FALSE";
    expect(deviceCategoriesEnabled()).toBe(false);
  });

  it("returns true for any non-'false' value (default opt-out semantics)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "true";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "1";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "";
    expect(deviceCategoriesEnabled()).toBe(true);
  });
});

describe("validateEntryPayload — WEAR types feature flag", () => {
  // The flag defaults ON, so the off-cases set it explicitly to "false".
  beforeEach(() => { delete process.env.ENABLE_DEVICE_CATEGORIES; });
  afterEach(() => { delete process.env.ENABLE_DEVICE_CATEGORIES; });

  it("rejects WEAR_BEGIN when feature flag is explicitly off", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result?.error).toMatch(/Device-Kategorien/);
    expect(result?.status).toBe(400);
  });

  it("rejects WEAR_END when feature flag is explicitly off", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_END", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result?.error).toMatch(/Device-Kategorien/);
  });

  it("accepts WEAR_BEGIN by default (flag ON)", () => {
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });

  it("accepts WEAR_END by default (flag ON)", () => {
    const result = validateEntryPayload(
      { type: "WEAR_END", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
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
