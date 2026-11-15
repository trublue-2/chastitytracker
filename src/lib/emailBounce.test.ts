import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique } } }));

import { isEmailBlocked, emailUpdateData, EMAIL_BOUNCE_RESET } from "./emailBounce";

beforeEach(() => findUnique.mockReset());

describe("isEmailBlocked", () => {
  it("ist für eine fehlende Adresse false, ohne die Datenbank zu fragen", async () => {
    expect(await isEmailBlocked(null)).toBe(false);
    expect(await isEmailBlocked("")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("ist true, wenn die Zeile eine Sperre trägt, sonst false", async () => {
    findUnique.mockResolvedValueOnce({ emailBlockedAt: new Date() });
    expect(await isEmailBlocked("a@x.ch")).toBe(true);
    findUnique.mockResolvedValueOnce({ emailBlockedAt: null });
    expect(await isEmailBlocked("a@x.ch")).toBe(false);
    findUnique.mockResolvedValueOnce(null);
    expect(await isEmailBlocked("a@x.ch")).toBe(false);
  });

  it("sendet im Zweifel: ein Datenbankfehler gilt als nicht gesperrt", async () => {
    findUnique.mockRejectedValueOnce(new Error("locked"));
    expect(await isEmailBlocked("a@x.ch")).toBe(false);
  });
});

describe("emailUpdateData", () => {
  it("setzt die Vorgeschichte zurück, wenn die Adresse eine andere ist", async () => {
    findUnique.mockResolvedValueOnce({ email: "alt@x.ch" });
    expect(await emailUpdateData("u1", "neu@x.ch")).toEqual({ email: "neu@x.ch", ...EMAIL_BOUNCE_RESET });
  });

  it("lässt die Sperre stehen, wenn dieselbe Adresse noch einmal gespeichert wird", async () => {
    findUnique.mockResolvedValueOnce({ email: "alt@x.ch" });
    expect(await emailUpdateData("u1", "alt@x.ch")).toEqual({ email: "alt@x.ch" });
  });

  it("setzt auch beim Entfernen der Adresse zurück", async () => {
    findUnique.mockResolvedValueOnce({ email: "alt@x.ch" });
    expect(await emailUpdateData("u1", null)).toEqual({ email: null, ...EMAIL_BOUNCE_RESET });
  });
});
