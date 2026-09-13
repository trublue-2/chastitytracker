import { describe, it, expect } from "vitest";
import { STATE_AREAS } from "./stateAreas";
import { encodeStateToken, decodeStateToken, changedAreasSince } from "./stateToken";

const at = new Date("2026-09-13T10:00:00Z");

describe("stateToken", () => {
  it("Rundlauf: kodieren und zurücklesen ergibt dieselben Zähler", () => {
    const token = encodeStateToken({ entries: { version: 40, changedAt: at }, settings: { version: 3, changedAt: at } });
    const decoded = decodeStateToken(token)!;
    expect(decoded[STATE_AREAS.indexOf("entries")]).toBe(40);
    expect(decoded[STATE_AREAS.indexOf("settings")]).toBe(3);
    expect(decoded[STATE_AREAS.indexOf("box")]).toBe(0);
  });

  it("unveränderte Zähler → keine geänderten Bereiche", () => {
    const versions = { tasks: { version: 7, changedAt: at } };
    expect(changedAreasSince(decodeStateToken(encodeStateToken(versions))!, versions)).toEqual([]);
  });

  it("nennt genau die Bereiche, deren Zähler sich bewegt hat", () => {
    const since = decodeStateToken(encodeStateToken({ tasks: { version: 7, changedAt: at } }))!;
    expect(changedAreasSince(since, { tasks: { version: 8, changedAt: at }, box: { version: 1, changedAt: at } }))
      .toEqual(["tasks", "box"]);
  });

  it("ein kürzeres Token (vor einem neuen Bereich ausgestellt) bleibt gültig", () => {
    const short = "s1." + STATE_AREAS.slice(0, -1).map(() => "0").join(".");
    const decoded = decodeStateToken(short)!;
    expect(decoded).toHaveLength(STATE_AREAS.length - 1);
    const last = STATE_AREAS.at(-1)!;
    // Unbekannte Stelle: geändert, sobald dort überhaupt etwas passiert ist.
    expect(changedAreasSince(decoded, {})).toEqual([]);
    expect(changedAreasSince(decoded, { [last]: { version: 1, changedAt: at } })).toEqual([last]);
  });

  it.each([
    ["leer", ""],
    ["falsches Präfix", "s2.0.0"],
    ["nur Präfix", "s1"],
    ["Fremdzeichen", "s1.0.x!"],
    ["zu viele Stellen", "s1." + [...STATE_AREAS, "extra"].map(() => "0").join(".")],
  ])("weist fremde Tokens ab: %s", (_, token) => {
    expect(decodeStateToken(token)).toBeNull();
  });
});
