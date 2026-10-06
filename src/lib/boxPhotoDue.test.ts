import { describe, it, expect } from "vitest";
import { BOX_PHOTO_TAKEN_TOLERANCE_MS, boxPhotoTakenBeforeBolt, isBoxPhotoDue, type BoxPhotoDueRow } from "./boxPhotoDue";

const DUE: BoxPhotoDueRow = {
  type: "VERSCHLUSS", keyInBox: true, boxImageUrl: null, boxPhotoDueAt: new Date("2026-10-06T10:00:00Z"), boxPhotoWaivedAt: null,
};

describe("isBoxPhotoDue", () => {
  it("fällig: Verschluss mit Schlüssel in der Box, fällig gestellt, weder Bild noch Erlass", () => {
    expect(isBoxPhotoDue(DUE)).toBe(true);
  });

  it("nicht fällig, solange der Riegel nicht gemeldet hat (boxPhotoDueAt leer)", () => {
    expect(isBoxPhotoDue({ ...DUE, boxPhotoDueAt: null })).toBe(false);
  });

  it("nicht fällig, wenn der Schlüssel nicht in der Box liegt (Reise) oder nichts erklärt wurde", () => {
    expect(isBoxPhotoDue({ ...DUE, keyInBox: false })).toBe(false);
    expect(isBoxPhotoDue({ ...DUE, keyInBox: null })).toBe(false);
  });

  it("nicht mehr fällig, sobald das Bild da ist oder die Keyholderin es erlassen hat", () => {
    expect(isBoxPhotoDue({ ...DUE, boxImageUrl: "/api/uploads/box.jpg" })).toBe(false);
    expect(isBoxPhotoDue({ ...DUE, boxPhotoWaivedAt: new Date() })).toBe(false);
  });

  it("nur ein VERSCHLUSS schuldet ein Bild", () => {
    expect(isBoxPhotoDue({ ...DUE, type: "OEFFNEN" })).toBe(false);
  });
});

describe("boxPhotoTakenBeforeBolt", () => {
  const DUE_AT = new Date("2026-10-06T10:00:00Z");
  const at = (offsetMs: number) => new Date(DUE_AT.getTime() + offsetMs);

  it("markiert ein Foto, das deutlich vor „Riegel zu\" aufgenommen wurde", () => {
    expect(boxPhotoTakenBeforeBolt(at(-60 * 60_000), DUE_AT)).toBe(true);
    expect(boxPhotoTakenBeforeBolt(at(-BOX_PHOTO_TAKEN_TOLERANCE_MS - 1), DUE_AT)).toBe(true);
  });

  it("lässt Uhren-Versatz und ein Foto kurz vor der Meldung durch", () => {
    expect(boxPhotoTakenBeforeBolt(at(-BOX_PHOTO_TAKEN_TOLERANCE_MS), DUE_AT)).toBe(false);
    expect(boxPhotoTakenBeforeBolt(at(-30_000), DUE_AT)).toBe(false);
  });

  it("ein Foto danach ist in Ordnung", () => {
    expect(boxPhotoTakenBeforeBolt(at(60_000), DUE_AT)).toBe(false);
  });

  it("ohne Aufnahmezeit lässt sich nichts sagen — also nicht „davor\"", () => {
    expect(boxPhotoTakenBeforeBolt(null, DUE_AT)).toBe(false);
  });
});
