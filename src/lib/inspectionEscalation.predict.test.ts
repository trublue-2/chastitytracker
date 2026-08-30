import { describe, it, expect, vi } from "vitest";

/**
 * Die Vorhersage von Stufe 2 — dieselbe Rechnung, die der Poller anwendet, nur vorwärts. Sie ist die
 * Zusage an den Sub („ohne Nachweis bis HH:MM"), und eine Zusage, die nicht eintrifft, ist schlimmer
 * als gar keine.
 */
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn() }));
vi.mock("@/lib/oeffnenService", () => ({ createOeffnenEntryTx: vi.fn() }));

import { predictAutoMarkAt } from "./inspectionEscalationService";

const DEADLINE = new Date("2026-08-11T10:00:00Z");

const user = (over: Record<string, unknown> = {}) => ({
  inspectionAutoMarkEnabled: true,
  inspectionReminderDelayMinutes: 5,
  inspectionAutoMarkDelayMinutes: 60,
  autoKontrolleAktiv: false,
  autoKontrollePerDayMin: 0, autoKontrollePerDayMax: 0,
  autoKontrolleRuheVon: "22:00", autoKontrolleRuheBis: "07:00",
  autoKontrolleFristVon: 30, autoKontrolleFristBis: 120,
  autoKontrolleFensterVon: "", autoKontrolleFensterBis: "",
  autoKontrolleNurBeiSperre: false, autoInspectionPlannedFor: null,
  autoKontrolleDays: 0b111_1111, autoKontrolleDayRules: null,
  timezone: "UTC",
  ...over,
}) as Parameters<typeof predictAutoMarkAt>[1];

const ka = (over: Record<string, unknown> = {}) => ({
  deadline: DEADLINE,
  benachrichtigtReminderAt: null,
  benachrichtigtAt: null,
  wirksamAb: null,
  cleaningRelock: false,
  ...over,
}) as Parameters<typeof predictAutoMarkAt>[0];

describe("predictAutoMarkAt", () => {
  it("ohne Mahn-Stempel: Frist + beide Verzögerungen", () => {
    expect(predictAutoMarkAt(ka(), user())).toEqual(new Date("2026-08-11T11:05:00Z"));
  });

  it("MIT Mahn-Stempel zählt ab dem Stempel, nicht ab der Frist", () => {
    // Der Kern: Stufe 2 verankert ihre Frist am Stempel. Würde die Anzeige weiter ab `deadline`
    // rechnen und die Mahn-Verzögerung wird nachträglich hochgesetzt, verspräche sie Stunden, die es
    // nicht gibt — gebucht würde weit vor der angekündigten Zeit.
    const stamped = ka({ benachrichtigtReminderAt: new Date("2026-08-11T10:06:00Z") });
    expect(predictAutoMarkAt(stamped, user({ inspectionReminderDelayMinutes: 600 })))
      .toEqual(new Date("2026-08-11T11:06:00Z"));
  });

  it("Automatik aus → keine Vorhersage", () => {
    expect(predictAutoMarkAt(ka(), user({ inspectionAutoMarkEnabled: false }))).toBeNull();
  });

  it("Reinigungs-Kontrolle im Schlaf-Fenster → keine Vorhersage", () => {
    // Für die fällt Stufe 2 dauerhaft aus. Eine Drohung, die nie eintritt, kostet die
    // Glaubwürdigkeit aller anderen.
    const nachts = ka({ cleaningRelock: true, benachrichtigtAt: new Date("2026-08-11T02:10:00Z") });
    expect(predictAutoMarkAt(nachts, user())).toBeNull();
  });

  it("Reinigungs-Kontrolle ausserhalb des Schlaf-Fensters wird normal vorhergesagt", () => {
    const tags = ka({ cleaningRelock: true, benachrichtigtAt: new Date("2026-08-11T10:01:00Z") });
    expect(predictAutoMarkAt(tags, user())).toEqual(new Date("2026-08-11T11:05:00Z"));
  });
});
