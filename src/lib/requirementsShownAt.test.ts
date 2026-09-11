import { describe, it, expect } from "vitest";
import { requirementsShownAt, type TaskState } from "./tasks";

/**
 * Über welchen Zeitpunkt die Bedingungs-Häkchen einer Aufgabe sprechen. Anlass: nach dem Ablegen am
 * nächsten Morgen stand ein leerer Kreis neben einer Bedingung, die der Träger bis zum Ende der Aufgabe
 * erfüllt hatte.
 */
const NOW = new Date("2026-09-11T06:00:00Z");
const END = new Date("2026-09-10T19:37:00Z");
const LATER = new Date(NOW.getTime() + 3_600_000);
const ev = (state: TaskState, over: { holdUntil?: Date; failedAt?: Date | null } = {}) =>
  ({ state, holdUntil: END, failedAt: null, ...over });
const live = { withdrawnAt: null };

describe("requirementsShownAt", () => {
  it("bis zum Ende: jetzt — der Träger soll sehen, was ihm gerade fehlt", () => {
    expect(requirementsShownAt(ev("running", { holdUntil: LATER }), live, NOW)).toEqual(NOW);
    expect(requirementsShownAt(ev("awaitingReview", { holdUntil: LATER }), live, NOW)).toEqual(NOW);
  });

  it("nach dem Ende: der Stand am Ende, nicht der von heute Morgen", () => {
    expect(requirementsShownAt(ev("missed"), live, NOW)).toEqual(END);
    expect(requirementsShownAt(ev("done"), live, NOW)).toEqual(END);
  });

  it("gehalten, aber noch nicht gemeldet: ebenfalls der Stand am Ende", () => {
    // `awaitingConfirmation` hält die Aufgabe im Zustand `running` — gerade dort kam der Kreis zurück.
    expect(requirementsShownAt(ev("running"), live, NOW)).toEqual(END);
  });

  it("abgebrochen: direkt NACH dem Wegfallen — der leere Kreis gehört an die Bedingung, die fiel", () => {
    const failedAt = new Date("2026-09-10T19:00:00Z");
    expect(requirementsShownAt(ev("aborted", { failedAt }), live, NOW)).toEqual(new Date(failedAt.getTime() + 1));
  });

  it("zurückgezogen: der Stand beim Rückzug", () => {
    const withdrawnAt = new Date("2026-09-10T19:10:00Z");
    expect(requirementsShownAt(ev("withdrawn"), { withdrawnAt }, NOW)).toEqual(withdrawnAt);
  });
});
