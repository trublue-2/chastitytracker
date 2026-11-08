import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Meldung der Stufe 2 („automatisch als abgelegt gebucht") — an den Träger UND an seine
 * Keyholder.
 *
 * Beide reden über DENSELBEN Vorgang, also muss auch beides auf dieselbe Kontrolle zeigen. Die
 * Keyholder-Zeile trug bis v5.1 als einzige gar keinen Bezug: im Posteingang stand dort eine Meldung
 * über einen Vorgang, den sie nicht benennen konnte — ohne den Kommentar der Anforderung und ohne
 * Möglichkeit, eine tote Referenz von einer nie gesetzten zu unterscheiden.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn(async () => [{ id: "kh1" }]) }));
vi.mock("@/lib/oeffnenService", () => ({ createOeffnenEntryTx: vi.fn() }));

import { notifyInspectionAutoMarked } from "./inspectionEscalationService";
import { notifyUser, notifyControllers } from "@/lib/notify";

const mock = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const CONTROL_REF = { type: "control", id: "ka1" };

beforeEach(() => vi.clearAllMocks());

describe("notifyInspectionAutoMarked", () => {
  it("beide Seiten zeigen auf dieselbe Kontrolle", async () => {
    await notifyInspectionAutoMarked({ userId: "u1", username: "traeger", code: "12345", controlId: "ka1" });

    expect(mock(notifyUser).mock.calls[0][1].inbox).toMatchObject({ ref: CONTROL_REF });
    expect(mock(notifyControllers).mock.calls[0][2].inbox).toMatchObject({ ref: CONTROL_REF });
  });

  it("auch ohne Code — der Bezug hängt an der Kontrolle, nicht an ihrem Code", async () => {
    await notifyInspectionAutoMarked({ userId: "u1", username: "traeger", code: null, controlId: "ka1", wear: true });

    expect(mock(notifyControllers).mock.calls[0][2]).toMatchObject({
      messageKey: "inspectionAutoRemovedMessageKeyholderWearNoCode",
      inbox: { ref: CONTROL_REF },
    });
  });

  it("die Zeile gehört dem TRÄGER, die Keyholder sind nur die Zustell-Liste", async () => {
    await notifyInspectionAutoMarked({ userId: "u1", username: "traeger", code: "12345", controlId: "ka1" });

    // Argument 0 ist der Träger (Scope-Schlüssel der geteilten Zeile), 1 die Empfänger.
    expect(mock(notifyControllers).mock.calls[0][0]).toBe("u1");
    expect(mock(notifyControllers).mock.calls[0][1]).toEqual([{ id: "kh1" }]);
  });
});
