import { describe, it, expect } from "vitest";
import {
  OFFLINE_BLOB_PREFIX,
  offlineBlobToken,
  isOfflineBlobUrl,
  parseOfflineBlobToken,
} from "@/lib/idb";

// Reine Marker-Helfer der Offline-Foto-Zwischenspeicherung — round-trippen und sauber von echten
// Bild-Pfaden abgrenzen. Die IndexedDB-Operationen selbst brauchen einen Browser und sind hier nicht
// prüfbar; hier zählt, dass Erzeugen und Erkennen des Markers konsistent bleiben.
describe("offline blob token", () => {
  it("round-trips id → token → id", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const token = offlineBlobToken(id);
    expect(token).toBe(`${OFFLINE_BLOB_PREFIX}${id}`);
    expect(isOfflineBlobUrl(token)).toBe(true);
    expect(parseOfflineBlobToken(token)).toBe(id);
  });

  it("does not mistake a real upload path for a marker", () => {
    const real = "/api/uploads/abcdef123456.jpg";
    expect(isOfflineBlobUrl(real)).toBe(false);
    expect(parseOfflineBlobToken(real)).toBeNull();
  });

  it("treats non-strings and empty values as non-markers", () => {
    for (const v of [null, undefined, 42, {}, ""]) {
      expect(isOfflineBlobUrl(v)).toBe(false);
      expect(parseOfflineBlobToken(v)).toBeNull();
    }
  });

  it("returns an empty id for a bare prefix (still recognised as a marker)", () => {
    expect(isOfflineBlobUrl(OFFLINE_BLOB_PREFIX)).toBe(true);
    expect(parseOfflineBlobToken(OFFLINE_BLOB_PREFIX)).toBe("");
  });
});
