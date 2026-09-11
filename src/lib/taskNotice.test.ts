import { describe, it, expect, vi } from "vitest";
import { createTranslator } from "next-intl";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

// `taskAssignmentNotice` ist rein — die Mocks halten nur die Modulkette vom Laden ab.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllerAudience: vi.fn() }));
vi.mock("@/lib/taskProofNotify", () => ({ notifyLateProofsForTask: vi.fn() }));
vi.mock("@/lib/imageUtils", () => ({ deleteUploadedFiles: vi.fn() }));

import { taskAssignmentNotice } from "./taskService";
import { withMessageDefaults } from "./messageDefaults";

/**
 * Die Meldung einer Aufgabe nennt die geforderten Nachweise. Anlass: ein Träger erfuhr von einem
 * Foto-Nachweis erst auf der Karte, und dort stand nicht, bis wann.
 */
const base = {
  id: "t1", title: "Hb", createdAt: new Date("2026-09-10T18:37:00Z"), startGraceMin: 30, wirksamAb: null,
  holdUntil: new Date("2026-09-10T20:07:00Z"), holdDurationMin: 60 as number | null, isPunishment: false,
};

const KEYS = [
  "taskAssignedMessage", "taskAssignedDurationMessage", "taskChangedMessage",
  "taskChangedDurationMessage", "penaltyTaskMessage", "penaltyTaskDurationMessage",
];

type Render = (key: string, params?: Record<string, string | number>) => string;

describe("taskAssignmentNotice", () => {
  it("die Meldung trägt die Anzahl der Nachweise", () => {
    const n = taskAssignmentNotice({ ...base, proofCount: 2 }, "keyholder");
    expect(n.messageKey).toBe("taskAssignedDurationMessage");
    expect(n.params).toMatchObject({ proofCount: 2, minutes: 60 });
  });

  it("der Text nennt die Nachweise — und liest sich ohne sie wie bisher, auch eine alte Zeile ohne den Parameter", () => {
    for (const [locale, messages] of [["de", de], ["en", en]] as const) {
      const t = createTranslator({ locale, messages, namespace: "emails" }) as unknown as Render;
      const params = { title: "Hb", until: "10.09.2026, 21:07", minutes: 60 };
      for (const key of KEYS) {
        // Eine ältere Posteingangs-Zeile: `proofCount` fehlt, die Vorgabe füllt ihn.
        const old = t(key, withMessageDefaults(key, params));
        const withOne = t(key, withMessageDefaults(key, { ...params, proofCount: 1 }));
        expect(withOne.startsWith(old)).toBe(true);
        expect(withOne.length).toBeGreaterThan(old.length);
      }
    }
  });
});
