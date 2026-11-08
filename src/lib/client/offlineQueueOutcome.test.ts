import { describe, it, expect } from "vitest";
import { classifyQueueResponse, stopsQueueRun } from "./offlineQueueOutcome";

describe("classifyQueueResponse", () => {
  it.each([200, 201, 204])("%i → sent", (s) => expect(classifyQueueResponse(s)).toBe("sent"));

  // Umgedreht gegenüber dem alten Hook: 400/409 zählten als „synchronisiert" (stiller Datenverlust).
  it.each([400, 404, 409, 413, 422])("%i → rejected (endgültig, aber kein Erfolg)", (s) =>
    expect(classifyQueueResponse(s)).toBe("rejected"));

  it.each([401, 403])("%i → auth (bleibt liegen, Lauf hält an)", (s) => {
    expect(classifyQueueResponse(s)).toBe("auth");
    expect(stopsQueueRun("auth")).toBe(true);
  });

  it.each([429, 500, 502, 503])("%i → retry (bleibt liegen, Lauf hält an)", (s) => {
    expect(classifyQueueResponse(s)).toBe("retry");
    expect(stopsQueueRun("retry")).toBe(true);
  });

  it("unbekannte Ablehnung (z.B. 418) bleibt liegen, blockiert die übrigen aber nicht", () => {
    expect(classifyQueueResponse(418)).toBe("skip");
    expect(stopsQueueRun("skip")).toBe(false);
  });

  it("sent und rejected halten den Lauf nicht an", () => {
    expect(stopsQueueRun("sent")).toBe(false);
    expect(stopsQueueRun("rejected")).toBe(false);
  });
});
