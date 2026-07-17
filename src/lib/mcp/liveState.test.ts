import { describe, it, expect } from "vitest";
import { buildPairs, type ReinigungSettings } from "@/lib/utils";
import {
  buildLockState, mapOpenKontrolle, mapActiveSperrzeit, mapOpenOrgasmusAnforderung,
  mapActiveWearSessions, type LockEntry,
} from "./liveState";

const D = (iso: string) => new Date(iso);
const NOW = D("2026-07-10T12:00:00Z");
/** Testformat: ISO ohne Millisekunden — die Mapper reichen `fmt` nur durch. */
const fmt = (d: Date) => d.toISOString();

const reinigung: ReinigungSettings = { erlaubt: true, maxMinuten: 30 };

let seq = 0;
const e = (type: string, iso: string, deviceName?: string, oeffnenGrund?: string): LockEntry => ({
  id: `e${++seq}`,
  type,
  startTime: D(iso),
  oeffnenGrund: oeffnenGrund ?? null,
  device: deviceName ? { name: deviceName, categoryId: null } : null,
  // Default „nicht erklärt" — die keyInBox-Fälle überschreiben das per Spread.
  keyInBox: null,
});

/** `buildLockState` erwartet die Entries ABSTEIGEND sortiert (jüngster zuerst) — wie sie aus Prisma kommen. */
const desc = (entries: LockEntry[]) => [...entries].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

describe("buildLockState", () => {
  it("offen: der jüngste KG-Eintrag ist ein OEFFNEN", () => {
    const lock = buildLockState(desc([
      e("VERSCHLUSS", "2026-07-08T10:00:00Z", "Ring A"),
      e("OEFFNEN", "2026-07-09T10:00:00Z", undefined, "KEYHOLDER"),
    ]), reinigung, NOW, fmt);

    expect(lock.isLocked).toBe(false);
    expect(lock.currentDurationHours).toBeNull();
    expect(lock.deviceName).toBeNull(); // kein Gerät, wenn nicht verschlossen
    expect(lock.since).toBe("2026-07-09T10:00:00.000Z"); // Zeitpunkt des jüngsten KG-Eintrags
  });

  it("verschlossen: Dauer zählt ab Session-Start", () => {
    const lock = buildLockState(desc([e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A")]), reinigung, NOW, fmt);
    expect(lock.isLocked).toBe(true);
    expect(lock.currentDurationHours).toBe(12);
    expect(lock.deviceName).toBe("Ring A");
    // Ohne Pausen sind since und currentSegmentSince identisch (kein Sonderfall, beide gesetzt).
    expect(lock.since).toBe("2026-07-10T00:00:00.000Z");
    expect(lock.currentSegmentSince).toBe("2026-07-10T00:00:00.000Z");
  });

  it("eine Reinigungspause wird von der Tragedauer ABGEZOGEN", () => {
    // 00:00 verschlossen, 04:00–04:20 Reinigung (innerhalb maxMinuten=30), danach wieder zu.
    // Bis 12:00 → 12 h minus 20 min Pause = 11.67 h, auf eine Nachkommastelle gerundet.
    const lock = buildLockState(desc([
      e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"),
      e("OEFFNEN", "2026-07-10T04:00:00Z", undefined, "REINIGUNG"),
      e("VERSCHLUSS", "2026-07-10T04:20:00Z", "Ring A"),
    ]), reinigung, NOW, fmt);

    expect(lock.isLocked).toBe(true);
    expect(lock.currentDurationHours).toBe(11.7);
  });

  it("eine Pause LÄNGER als reinigungMaxMinuten ist keine Unterbrechung — sie beendet die Session", () => {
    // 60 min > maxMinuten=30: buildPairs zählt das nicht als Reinigungspause, sondern trennt die
    // Session. Die Dauer läuft daher erst ab dem Wiederverschluss (05:00 → 12:00 = 7 h).
    const lock = buildLockState(desc([
      e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"),
      e("OEFFNEN", "2026-07-10T04:00:00Z", undefined, "REINIGUNG"),
      e("VERSCHLUSS", "2026-07-10T05:00:00Z", "Ring A"),
    ]), reinigung, NOW, fmt);

    expect(lock.currentDurationHours).toBe(7);
  });

  it("REGRESSION: nach einem Gerätewechsel während der Reinigungspause zählt das NEUE Gerät", () => {
    // Der Session-Kopf trägt „Ring A", wiederverschlossen wurde mit „Ring B". Wer nur
    // activePair.verschluss liest, meldet fälschlich das Gerät vom Session-Start (Changelog 4.x).
    // Die Pause muss dafür INNERHALB von maxMinuten liegen — sonst gäbe es gar keine Unterbrechung
    // und der Test wäre aus dem falschen Grund grün.
    const lock = buildLockState(desc([
      e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"),
      e("OEFFNEN", "2026-07-10T04:00:00Z", undefined, "REINIGUNG"),
      e("VERSCHLUSS", "2026-07-10T04:20:00Z", "Ring B"),
    ]), reinigung, NOW, fmt);

    expect(lock.deviceName).toBe("Ring B");
    // Die Session läuft über die Pause hinweg durch: Dauer ab Session-Start minus Pause.
    expect(lock.currentDurationHours).toBe(11.7);
    // `since` ist der LAUF-Anfang (Session-Kopf) — deckt sich mit currentDurationHours (A-01).
    expect(lock.since).toBe("2026-07-10T00:00:00.000Z");
    // `currentSegmentSince` ist der alte `since`-Wert: der jüngste KG-Eintrag, der Wiederverschluss.
    expect(lock.currentSegmentSince).toBe("2026-07-10T04:20:00.000Z");
  });

  it("ohne Einträge ist nichts verschlossen", () => {
    const lock = buildLockState([], reinigung, NOW, fmt);
    expect(lock).toEqual({ isLocked: false, since: null, currentSegmentSince: null, currentDurationHours: null, deviceName: null, keyInBox: null });
  });

  it("keyInBox:false wird gemeldet — der Verschluss ist erklärt, aber nicht hardware-vollstreckt", () => {
    const lock = buildLockState(
      desc([{ ...e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"), keyInBox: false }]),
      reinigung, NOW, fmt,
    );
    expect(lock.isLocked).toBe(true);
    expect(lock.keyInBox).toBe(false);
  });

  it("nach dem Öffnen sagt keyInBox nichts mehr aus (null, kein stehengebliebenes false)", () => {
    const lock = buildLockState(desc([
      { ...e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"), keyInBox: false },
      e("OEFFNEN", "2026-07-10T04:00:00Z"),
    ]), reinigung, NOW, fmt);
    expect(lock.isLocked).toBe(false);
    expect(lock.keyInBox).toBeNull();
  });

  it("nach einer Reinigungspause gilt die Angabe des WIEDERVERSCHLUSSES, nicht die des Session-Starts", () => {
    // Gleiches Prinzip wie beim Gerätewechsel: der Sub kann den Schlüssel beim Wiederverschluss
    // mitnehmen (Reise) — wer den Session-Kopf liest, meldet weiter „liegt in der Box".
    const lock = buildLockState(desc([
      { ...e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A"), keyInBox: true },
      e("OEFFNEN", "2026-07-10T04:00:00Z", undefined, "REINIGUNG"),
      { ...e("VERSCHLUSS", "2026-07-10T04:20:00Z", "Ring A"), keyInBox: false },
    ]), reinigung, NOW, fmt);
    expect(lock.keyInBox).toBe(false);
  });

  it("ohne Angabe bleibt keyInBox null — ein Alt-Eintrag ist kein „nein\"", () => {
    const lock = buildLockState(desc([e("VERSCHLUSS", "2026-07-10T00:00:00Z", "Ring A")]), reinigung, NOW, fmt);
    expect(lock.keyInBox).toBeNull();
  });

});

describe("mapOpenKontrolle", () => {
  it("null bleibt null", () => {
    expect(mapOpenKontrolle(null, NOW, fmt)).toBeNull();
  });

  it("überfällig, wenn die Frist vor jetzt liegt", () => {
    const k = mapOpenKontrolle({ code: "12345", deadline: D("2026-07-10T11:30:00Z"), kommentar: "bitte zeitnah" }, NOW, fmt)!;
    expect(k.overdue).toBe(true);
    expect(k.remainingMinutes).toBe(-30);
    expect(k.comment).toBe("bitte zeitnah");
  });

  it("nicht überfällig, wenn die Frist in der Zukunft liegt", () => {
    const k = mapOpenKontrolle({ code: "12345", deadline: D("2026-07-10T14:00:00Z"), kommentar: null }, NOW, fmt)!;
    expect(k.overdue).toBe(false);
    expect(k.remainingMinutes).toBe(120);
  });
});

describe("mapActiveSperrzeit", () => {
  it("ohne Ende ist die Sperre unbefristet — keine Restzeit", () => {
    const s = mapActiveSperrzeit({ endetAt: null, nachricht: null, reinigungErlaubt: true, device: null }, NOW, fmt)!;
    expect(s.indefinite).toBe(true);
    expect(s.endetAt).toBeNull();
    expect(s.remainingMinutes).toBeNull();
  });

  it("mit Ende: Restzeit in Minuten, Gerätename durchgereicht", () => {
    const s = mapActiveSperrzeit(
      { endetAt: D("2026-07-10T13:00:00Z"), nachricht: "bis morgen", reinigungErlaubt: false, device: { name: "Ring A" } },
      NOW, fmt)!;
    expect(s.indefinite).toBe(false);
    expect(s.remainingMinutes).toBe(60);
    expect(s.reinigungErlaubt).toBe(false);
    expect(s.deviceName).toBe("Ring A");
  });
});

describe("mapOpenOrgasmusAnforderung", () => {
  const row = (beginnt: string, endet: string) => ({
    art: "ANFORDERUNG", beginntAt: D(beginnt), endetAt: D(endet),
    vorgegebeneArt: "RUINIERT", nachricht: "heute Abend",
  });

  it("aktiv, sobald der Start erreicht ist", () => {
    const o = mapOpenOrgasmusAnforderung(row("2026-07-10T11:00:00Z", "2026-07-10T18:00:00Z"), NOW, fmt)!;
    expect(o.active).toBe(true);
    expect(o.requiredType).toBe("RUINIERT");
    expect(o.message).toBe("heute Abend");
  });

  it("Start GENAU jetzt zählt bereits als aktiv (<=)", () => {
    expect(mapOpenOrgasmusAnforderung(row("2026-07-10T12:00:00Z", "2026-07-10T18:00:00Z"), NOW, fmt)!.active).toBe(true);
  });

  it("in der Zukunft geplant: noch nicht aktiv, Restzeit zählt bis zum ENDE", () => {
    const o = mapOpenOrgasmusAnforderung(row("2026-07-10T15:00:00Z", "2026-07-10T18:00:00Z"), NOW, fmt)!;
    expect(o.active).toBe(false);
    expect(o.remainingMinutes).toBe(360); // bis endetAt, nicht bis beginntAt
  });
});

describe("mapActiveWearSessions", () => {
  it("rechnet die Laufzeit je Session ab `since`", () => {
    const rows = mapActiveWearSessions(
      [{ categoryName: "Plug", deviceName: "Plug S", since: D("2026-07-10T09:00:00Z") }], NOW, fmt);
    expect(rows).toEqual([{ category: "Plug", deviceName: "Plug S", since: "2026-07-10T09:00:00.000Z", durationHours: 3 }]);
  });

  it("leere Liste bleibt leer", () => {
    expect(mapActiveWearSessions([], NOW, fmt)).toEqual([]);
  });
});
