import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeDelayedTrigger, deadlineFromDispatch, dueForDispatchWhere, pendingDispatchWhere, isHiddenFromSub } from "./delayedTrigger";

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
    expect(dueForDispatchWhere(NOW)).toMatchObject({ ...pendingDispatchWhere, wirksamAb: { not: null, lte: NOW } });
  });

  it("blendet Träger mit laufender Gesundheitspause aus — und NUR hier, nicht in pendingDispatchWhere", () => {
    // Das Gate steht in SQL statt als Filter danach: die wartenden Zeilen sind die ältesten und
    // besetzten sonst den `take`-Deckel jedes Ticks. Und es steht NICHT in `pendingDispatchWhere` —
    // das speist auch die Keyholder-Sicht auf die geplanten Direktiven, und dort muss sie sehen, was
    // während der Pause wartet.
    expect(dueForDispatchWhere(NOW)).toMatchObject({ user: { healthHolds: { none: { active: true } } } });
    expect(pendingDispatchWhere).not.toHaveProperty("user");
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

/**
 * Das ORGASMUS-Fenster verschiebt der Poller selbst, nicht über `deadlineFromDispatch` — es hat
 * zwei Enden statt einem, und beide wandern um dieselbe Verspätung. Diese Rechnung steht deshalb
 * inline in `kontrollePoller.ts` und war von keinem Test gedeckt.
 *
 * Beim Umbenennen der Feldnamen habe ich sie versehentlich umgangen (`beginsAtDate: oa.beginsAt`
 * statt der verschobenen Zeit) — `tsc` und 3252 Tests blieben grün. Der Sub hätte ein Fenster
 * gemeldet bekommen, dessen Start in der Vergangenheit liegt, während das Ende korrekt mitwandert:
 * bei `art: "ANWEISUNG"` also weniger Zeit, als ihm zusteht.
 *
 * Bauart nach `appName.test.ts`: die Stelle wird als TEXT gelesen. Ein Poller-Test bräuchte
 * Attrappen für Prisma, Mail, Push und Posteingang — viel Gerüst für zwei Zuweisungen.
 */
describe("Der Poller verschiebt das Orgasmus-Fenster mit, wenn er zu spät zustellt", () => {
  const src = readFileSync("src/lib/kontrollePoller.ts", "utf8");
  const call = src.slice(
    src.indexOf("const lateMs"),
    src.indexOf("});", src.indexOf("sendOrgasmusAnforderungNotifications(")),
  );

  it("liest die Stelle wirklich", () => {
    // Untergrenze gegen eine kaputte Textsuche: ein leerer Ausschnitt liesse alles darunter grün.
    expect(call).toContain("sendOrgasmusAnforderungNotifications(");
    expect(call).toContain("lateMs");
  });

  it("meldet die VERSCHOBENEN Zeiten, nicht die geplanten", () => {
    // Beide Enden kommen aus je einer Variablen, die `lateMs` aufschlägt — nicht aus `oa.*`.
    expect(call).toMatch(/const beginsAtDate = new Date\(oa\.beginsAt\.getTime\(\) \+ lateMs\)/);
    expect(call).toMatch(/const endsAtDate = new Date\(oa\.endsAt\.getTime\(\) \+ lateMs\)/);
    expect(call).not.toMatch(/beginsAtDate:\s*oa\./);
    expect(call).not.toMatch(/endsAtDate:\s*oa\./);
  });

  it("schreibt dieselben verschobenen Zeiten auch zurück", () => {
    // Sonst zeigte die Oberfläche das geplante Fenster und die Mail ein anderes.
    expect(src).toMatch(/data: \{ beginsAt: beginsAtDate, endsAt: endsAtDate/);
  });
});
