import { describe, it, expect } from "vitest";
import { entryRequest } from "./apiClient";

/**
 * Wächter über den Idempotenz-Stempel, den `entryRequest` beim ANLEGEN mitgibt.
 *
 * Er ist die einzige Sperre gegen die Dublette, die entsteht, wenn der Server einen Eintrag
 * schreibt und die Antwort das Client-Zeitlimit reisst: der Rumpf geht später aus der
 * Offline-Warteschlange ein zweites Mal raus. Erkennbar ist der zweite Versuch NUR daran, dass er
 * denselben Stempel trägt — verschwindet der unterwegs, ist die Sperre lautlos wirkungslos, und
 * niemand merkt es, bis eine Öffnung doppelt in der Historie steht.
 */
describe("entryRequest", () => {
  const bodyOf = ([, init]: [string, RequestInit]) => JSON.parse(init.body as string);

  it("stempelt einen neuen Eintrag und lässt die Nutzlast intakt", () => {
    const req = entryRequest(undefined, { type: "OEFFNEN" });
    expect(req[0]).toBe("/api/entries");
    expect(req[1].method).toBe("POST");
    expect(bodyOf(req).type).toBe("OEFFNEN");
    expect(typeof bodyOf(req).clientRequestId).toBe("string");
    expect(bodyOf(req).clientRequestId).not.toHaveLength(0);
  });

  it("vergibt für zwei Anlege-Versuche verschiedene Stempel", () => {
    // Sonst kollidierten zwei unabhängige Einträge im UNIQUE-Index, und der zweite käme als
    // vermeintliche Wiederholung des ersten zurück — ein VERLORENER Eintrag statt eines doppelten.
    const a = bodyOf(entryRequest(undefined, {})).clientRequestId;
    const b = bodyOf(entryRequest(undefined, {})).clientRequestId;
    expect(a).not.toBe(b);
  });

  it("stempelt eine Bearbeitung NICHT", () => {
    // Ein PATCH wird nie eingereiht (`initial ? fetch : offlineFetch` in den Formularen), es gibt
    // also keinen zweiten Versuch, den man wiedererkennen müsste. Ein Stempel hier belegte nur
    // einen Index-Eintrag und behauptete eine Zusage, die die Route für PATCH gar nicht einlöst.
    const req = entryRequest("abc123", { note: "korrigiert" });
    expect(req[0]).toBe("/api/entries/abc123");
    expect(req[1].method).toBe("PATCH");
    expect(bodyOf(req)).not.toHaveProperty("clientRequestId");
  });

  it("überschreibt einen mitgegebenen Stempel nicht", () => {
    // Der Kern der Sache: schickt ein Aufrufer denselben Versuch bewusst erneut, muss der Stempel
    // erhalten bleiben — sonst wäre der zweite Versuch für den Server ein anderer.
    const req = entryRequest(undefined, { type: "OEFFNEN", clientRequestId: "fest" });
    expect(bodyOf(req).clientRequestId).toBe("fest");
  });
});
