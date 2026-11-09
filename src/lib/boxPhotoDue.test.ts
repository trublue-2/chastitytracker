import { describe, it, expect } from "vitest";
import { BOX_PHOTO_TAKEN_TOLERANCE_MS, boxPhotoTakenBeforeBolt, isBoxPhotoDue, boxPhotoMissedAt, type BoxPhotoDueRow } from "./boxPhotoDue";

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

describe("boxPhotoMissedAt — Box-Foto nach „Riegel zu\" nicht in der Frist", () => {
  const due = new Date("2026-11-10T10:00:00Z");
  const deadline = new Date("2026-11-10T12:00:00Z");
  const base = { keyInBox: true, boxImageUrl: null, boxPhotoDueAt: due, boxPhotoWaivedAt: null, boxPhotoSubmittedAt: null };
  const opts = { deadlineHours: 2, enforcedFrom: new Date("2026-11-01T00:00:00Z"), endedAt: null, now: new Date("2026-11-10T13:00:00Z") };
  const at = (min: number) => new Date(due.getTime() + min * 60_000);

  it("ohne Foto nach Fristende: Vergehen zum Fristende", () => {
    expect(boxPhotoMissedAt(base, opts)).toEqual(deadline);
  });
  it("vor Fristende noch keines", () => {
    expect(boxPhotoMissedAt(base, { ...opts, now: at(119) })).toBeNull();
  });
  it("Foto rechtzeitig: keines; zu spät: bleibt", () => {
    expect(boxPhotoMissedAt({ ...base, boxImageUrl: "/u/a.jpg", boxPhotoSubmittedAt: at(30) }, opts)).toBeNull();
    expect(boxPhotoMissedAt({ ...base, boxImageUrl: "/u/a.jpg", boxPhotoSubmittedAt: at(121) }, opts)).toEqual(deadline);
  });
  it("Foto ohne Ankunftszeit (Altbestand) gilt als rechtzeitig", () => {
    expect(boxPhotoMissedAt({ ...base, boxImageUrl: "/u/a.jpg" }, opts)).toBeNull();
  });
  it("Erlass vor Fristende hebt auf, danach nicht", () => {
    expect(boxPhotoMissedAt({ ...base, boxPhotoWaivedAt: at(60) }, opts)).toBeNull();
    expect(boxPhotoMissedAt({ ...base, boxPhotoWaivedAt: at(150) }, opts)).toEqual(deadline);
  });
  it("vor Fristende geöffnet: keine Pflicht mehr", () => {
    expect(boxPhotoMissedAt(base, { ...opts, endedAt: at(90) })).toBeNull();
    expect(boxPhotoMissedAt(base, { ...opts, endedAt: at(180) })).toEqual(deadline);
  });
  it("vor dem Stichtag fällig, Schlüssel nicht in der Box oder nie fällig: nichts", () => {
    expect(boxPhotoMissedAt(base, { ...opts, enforcedFrom: at(1) })).toBeNull();
    expect(boxPhotoMissedAt({ ...base, keyInBox: false }, opts)).toBeNull();
    expect(boxPhotoMissedAt({ ...base, boxPhotoDueAt: null }, opts)).toBeNull();
  });
});
