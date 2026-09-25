import { describe, it, expect } from "vitest";
import { nextLockmeboxCommand, parseLockmeboxStatus, splitLockmeboxFrames } from "./lockmeboxProtocol";

// Echte Zeilen einer LockMeBox mit Firmware 15 (25.09.2026): Status offen, nach dem Sperren, nach
// einem falschen Passwort, nach dem Öffnen. 17 Felder plus Schlussstrich.
const STATUS_OPEN = "<S/0/0/0/1/32/0/1790316795/1190628/0/0/8/19/346/15/10/1/>";
const AFTER_LOCK = "<C/1/0/1/1/30/0/1790316803/1190628/1790316801/0/9/19/346/15/10/1/>";
const WRONG_PASSWORD = "<O/1/0/1/32/27/0/1790316807/1190628/1790316801/0/9/19/346/15/10/1/>";
const AFTER_OPEN = "<O/0/0/0/1/27/0/1790316837/1190628/0/0/10/19/346/15/10/1/>";

describe("parseLockmeboxStatus", () => {
  it("liest Riegel, Akku und Firmware", () => {
    expect(parseLockmeboxStatus(STATUS_OPEN)).toEqual({
      locked: false, passwordWrong: false, battery: 32, charging: false, fwVersion: "15",
    });
    expect(parseLockmeboxStatus(AFTER_LOCK)).toMatchObject({ locked: true, passwordWrong: false });
    expect(parseLockmeboxStatus(AFTER_OPEN)).toMatchObject({ locked: false });
  });

  it("erkennt das falsche Passwort am Ergebnis-Bit 32", () => {
    expect(parseLockmeboxStatus(WRONG_PASSWORD)).toMatchObject({ locked: true, passwordWrong: true });
  });

  it("nimmt auch die 16-Felder-Zeile älterer Firmware", () => {
    expect(parseLockmeboxStatus("<S/1/0/1/0/80/0/1/2/3/0/1/2/3/14/10/>")).toMatchObject({ locked: true, fwVersion: "14" });
  });

  it("meldet beim Laden keinen Prozentwert", () => {
    expect(parseLockmeboxStatus("<S/0/0/0/0/200/0/1/2/3/0/1/2/3/15/10/1/>")).toMatchObject({ battery: null, charging: true });
  });

  it("verwirft alles, was keine Statuszeile ist", () => {
    expect(parseLockmeboxStatus("")).toBeNull();
    expect(parseLockmeboxStatus("<S/0/0>")).toBeNull();
    expect(parseLockmeboxStatus("S/0/0/0/1/32/0/1/2/3/0/1/2/3/15/10/1/")).toBeNull();
    expect(parseLockmeboxStatus("<S/x/0/0/1/32/0/1/2/3/0/1/2/3/15/10/1/>")).toBeNull();
  });
});

describe("splitLockmeboxFrames", () => {
  it("setzt eine Zeile aus den 20-Byte-Stücken der Box zusammen", () => {
    const chunks = ["<S/0/0/0/1/32/0/1790", "316795/1190628/0/0/8", "/19/346/15/10/1/>"];
    let rest = "";
    const frames: string[] = [];
    for (const c of chunks) {
      const split = splitLockmeboxFrames(rest + c);
      rest = split.rest;
      frames.push(...split.frames);
    }
    expect(frames).toEqual([STATUS_OPEN]);
    expect(rest).toBe("");
  });

  it("trennt zwei Zeilen in einem Stück und behält den angefangenen Rest", () => {
    expect(splitLockmeboxFrames(`${STATUS_OPEN}${AFTER_LOCK}<O/1`)).toEqual({ frames: [STATUS_OPEN, AFTER_LOCK], rest: "<O/1" });
  });
});

describe("nextLockmeboxCommand", () => {
  const open = { locked: false, passwordWrong: false };
  const closed = { locked: true, passwordWrong: false };

  it("fragt zuerst den Status ab", () => {
    expect(nextLockmeboxCommand(null, "lock", null)).toEqual({ command: "status", problem: null, settled: false });
  });

  it("schickt das anstehende Kommando nur, wenn die Box nicht schon so steht", () => {
    expect(nextLockmeboxCommand(open, "lock", "status")).toEqual({ command: "lock", problem: null, settled: false });
    expect(nextLockmeboxCommand(closed, "open", "status")).toEqual({ command: "open", problem: null, settled: false });
    expect(nextLockmeboxCommand(closed, "lock", "status")).toEqual({ command: null, problem: null, settled: true });
    expect(nextLockmeboxCommand(open, null, "status")).toEqual({ command: null, problem: null, settled: false });
  });

  it("meldet das Kommando als erledigt, sobald die Box im Zielzustand steht", () => {
    expect(nextLockmeboxCommand(closed, "lock", "lock")).toEqual({ command: null, problem: null, settled: true });
    expect(nextLockmeboxCommand(open, "open", "open")).toEqual({ command: null, problem: null, settled: true });
  });

  it("gibt auf, wenn derselbe Befehl nicht gewirkt hat", () => {
    expect(nextLockmeboxCommand(open, "lock", "lock")).toEqual({ command: null, problem: "notApplied", settled: false });
    expect(nextLockmeboxCommand(closed, "open", "open")).toEqual({ command: null, problem: "notApplied", settled: false });
  });

  it("nennt das falsche Passwort beim Öffnen beim Namen", () => {
    expect(nextLockmeboxCommand({ locked: true, passwordWrong: true }, "open", "open"))
      .toEqual({ command: null, problem: "passwordWrong", settled: false });
  });
});
