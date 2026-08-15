import { describe, it, expect } from "vitest";
import { computeDelayedTrigger, deadlineFromDispatch, dueForDispatchWhere, hiddenFromSubWhere, isHiddenFromSub } from "./delayedTrigger";

const at = (iso: string) => new Date(iso);

describe("computeDelayedTrigger", () => {
  const NOW = at("2026-07-29T12:00:00Z");

  it("ohne Angabe: sofort — wirksamAb null, benachrichtigt jetzt", () => {
    expect(computeDelayedTrigger(NOW, {})).toEqual({ wirksamAb: null, benachrichtigtAt: NOW });
  });

  it("delayMinutes verschiebt relativ", () => {
    const { wirksamAb, benachrichtigtAt } = computeDelayedTrigger(NOW, { delayMinutes: 90 });
    expect(wirksamAb).toEqual(at("2026-07-29T13:30:00Z"));
    expect(benachrichtigtAt).toBeNull(); // geplant ⇒ der Poller meldet später
  });

  it("absoluter Zeitpunkt schlägt die relative Verzögerung", () => {
    const { wirksamAb } = computeDelayedTrigger(NOW, { delayMinutes: 90, wirksamAbAt: at("2026-07-29T20:00:00Z") });
    expect(wirksamAb).toEqual(at("2026-07-29T20:00:00Z"));
  });

  it("ein Zeitpunkt in der Vergangenheit heisst sofort, nicht rückwirkend", () => {
    expect(computeDelayedTrigger(NOW, { wirksamAbAt: at("2026-07-29T06:00:00Z") }))
      .toEqual({ wirksamAb: null, benachrichtigtAt: NOW });
  });
});

describe("deadlineFromDispatch — die Frist zählt ab der Zustellung", () => {
  it("pünktlicher Poller: praktisch unverändert", () => {
    const planned = { wirksamAb: at("2026-07-29T17:35:00Z"), deadline: at("2026-07-29T18:20:00Z") }; // 45 min
    // Der Tick läuft im Minuten-Raster, hier 12 s nach der Fälligkeit.
    expect(deadlineFromDispatch(planned, at("2026-07-29T17:35:12Z"))).toEqual(at("2026-07-29T18:20:12Z"));
  });

  it("verspäteter Poller: der Sub bekommt trotzdem seine volle Spanne", () => {
    // Genau der Vorfall vom 29.07.2026: die Zustellung kam erst, als die geplante Frist schon
    // abgelaufen war. Vorher stand die Frist auf dem Auslöse-Zeitpunkt und war nicht einhaltbar.
    const planned = { wirksamAb: at("2026-07-29T16:50:00Z"), deadline: at("2026-07-29T17:35:00Z") }; // 45 min
    const sentAt = at("2026-07-29T17:35:00Z"); // 45 min zu spät — Frist wäre exakt jetzt abgelaufen
    expect(deadlineFromDispatch(planned, sentAt)).toEqual(at("2026-07-29T18:20:00Z"));
  });

  it("erhält die Spanne exakt, egal wie gross die Verspätung ist", () => {
    const planned = { wirksamAb: at("2026-07-29T08:00:00Z"), deadline: at("2026-07-29T08:15:00Z") }; // 15 min
    const sentAt = at("2026-07-29T14:00:00Z"); // sechs Stunden später (Container-Neustart)
    const shifted = deadlineFromDispatch(planned, sentAt);
    expect(shifted.getTime() - sentAt.getTime()).toBe(15 * 60_000);
  });

  it("nie terminiert (wirksamAb null) → die gespeicherte Frist bleibt unangetastet", () => {
    // Keine Spanne zu erhalten: diese Zeile wurde nicht geplant, sondern sofort zugestellt.
    const planned = { wirksamAb: null, deadline: at("2026-07-29T18:00:00Z") };
    expect(deadlineFromDispatch(planned, at("2026-07-29T17:00:00Z"))).toEqual(at("2026-07-29T18:00:00Z"));
  });
});

describe("isHiddenFromSub", () => {
  it("terminiert und noch nicht ausgelöst ⇒ verborgen", () => {
    expect(isHiddenFromSub({ wirksamAb: at("2026-08-01T00:00:00Z"), benachrichtigtAt: null })).toBe(true);
  });

  it("terminiert, aber bereits gemeldet ⇒ nicht mehr verborgen", () => {
    expect(isHiddenFromSub({ wirksamAb: at("2026-08-01T00:00:00Z"), benachrichtigtAt: at("2026-08-01T00:00:30Z") })).toBe(false);
  });

  it("sofort aktiv OHNE Stempel ist NICHT verborgen — die Falle der Selbst-Einschluss-Sperrzeit", () => {
    // `entries/route.ts` legt sie ohne benachrichtigtAt an: der Sub hat sich gerade selbst
    // eingeschlossen und weiss davon, es musste niemand eine Mail schicken.
    expect(isHiddenFromSub({ wirksamAb: null, benachrichtigtAt: null })).toBe(false);
  });
});

describe("dueForDispatchWhere", () => {
  const NOW = at("2026-07-29T12:00:00Z");

  it("engt die Verborgenheits-Bedingung ein, statt sie zu ersetzen", () => {
    // Die Zusage an die Aufrufer: das `lte` kommt HINZU, `not: null` bleibt daneben stehen. Ohne
    // dieses `not: null` sammelte die Abfrage auch nie terminierte Zeilen ein — die sind längst
    // zugestellt und würden ein zweites Mal gemeldet.
    expect(dueForDispatchWhere(NOW)).toEqual({ ...hiddenFromSubWhere, wirksamAb: { not: null, lte: NOW } });
  });

  it("verträgt den eigenen Filter des Aufrufers", () => {
    // So nehmen die Poller sie (`entryId: null` / `fulfilledAt: null`): der Spread darf die geteilte
    // Bedingung nicht überschreiben, sonst stellte ein Poller Zeilen zu, die niemand mehr erwartet.
    expect({ ...dueForDispatchWhere(NOW), entryId: null }).toMatchObject({
      wirksamAb: { not: null, lte: NOW },
      benachrichtigtAt: null,
      withdrawnAt: null,
      entryId: null,
    });
  });
});
