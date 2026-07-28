import { describe, it, expect } from "vitest";
import { boxBatteryLabel, boxFailsafeWarnings, boxPendingTransition, boxSollLabel, boxSollLocked, type BoxRow } from "./boxStatus";

// Der Übergangs-Zustand (Präsenz-Gate, FW ≥ 0.2.34) speist die Box-Karte aus zwei nahtlos
// ineinander übergehenden Quellen: sofort nach dem Eintrag das tracker-lokale pendingCommand,
// nach dem Box-Sync der Soll/Ist-Mismatch des Spiegels. Realer Vorfall 17.07: ohne diese Anzeige
// blieb die Karte bis zum Knopfdruck beim alten Stand („kein Verschluss verlangt").
const row = (over: Partial<BoxRow>): BoxRow => ({
  boxId: "b1",
  name: "Box",
  locked: false,
  reportedLocked: false,
  pendingCommand: null,
  simpleLock: false,
  keyholderLocked: false,
  lockUntil: null,
  lastSyncAt: null,
  offlineOpenHours: null,
  battery: null,
  charging: null,
  lowBatteryOpenPercent: null,
  ...over,
});

describe("boxPendingTransition", () => {
  it("pendingCommand=lock → closing, noch bevor der Spiegel etwas weiss", () => {
    expect(boxPendingTransition(row({ pendingCommand: "lock" }))).toBe("closing");
  });

  it("pendingCommand=open → opening, auch wenn der Spiegel noch SOLL zu meldet", () => {
    expect(boxPendingTransition(row({ pendingCommand: "open", locked: true, reportedLocked: true }))).toBe("opening");
  });

  it("Spiegel-Mismatch SOLL zu / IST offen → closing (wartet auf Knopf)", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: false }))).toBe("closing");
  });

  it("Spiegel-Mismatch SOLL offen / IST zu → opening (scharfgestellt)", () => {
    expect(boxPendingTransition(row({ locked: false, reportedLocked: true }))).toBe("opening");
  });

  it("Soll=Ist (beide zu / beide offen) → kein Übergang", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: true }))).toBeNull();
    expect(boxPendingTransition(row({ locked: false, reportedLocked: false }))).toBeNull();
  });

  it("Alt-Zeile ohne IST-Meldung → kein Mismatch ableitbar, kein Übergang", () => {
    expect(boxPendingTransition(row({ locked: true, reportedLocked: null }))).toBeNull();
  });
});

// Vorfall 24.07: nach einer eingetragenen Öffnung zeigte die Karte 5 Minuten lang „Soll:
// verschlossen, ohne Zeitlimit" samt Konflikt-Warnung — der Spiegel stand noch auf dem Push von
// VOR dem Eintrag, während daneben schon „Öffnung freigegeben" stand. Das SOLL muss demselben
// Vorrang folgen wie der Übergang: das anstehende Kommando ist die jüngere Absicht.
describe("boxSollLocked — anstehendes Kommando vor gespiegeltem SOLL", () => {
  const t = (key: string) => key;
  const fmt = (iso: string) => iso;

  it("anstehendes open entwertet den gespiegelten SOLL", () => {
    const b = row({ pendingCommand: "open", simpleLock: true, locked: true });
    expect(boxSollLocked(b)).toBe(false);
    expect(boxSollLabel(b, t, fmt)).toBe("sollNone");
  });

  // Die Sperrzeit wird von /api/box bei jedem Poll live aus der Tracker-DB überlagert, ist also
  // NICHT der veraltete Spiegel — ein Kommando darf sie nie überschreiben. Sonst versteckte eine
  // Box, die nach dem open nie wieder synct, die Keyholder-Sperre dauerhaft (pendingCommand löscht
  // nur der Box-Sync).
  it("anstehendes open schlägt die Keyholder-Sperre NICHT", () => {
    expect(boxSollLocked(row({ pendingCommand: "open", keyholderLocked: true }))).toBe(true);
    expect(boxSollLocked(row({ pendingCommand: "open", lockUntil: "2026-07-24T20:00:00.000Z" }))).toBe(true);
  });

  it("… auch nicht in Kombination mit einem veralteten simpleLock", () => {
    const b = row({ pendingCommand: "open", keyholderLocked: true, simpleLock: true, locked: true });
    expect(boxSollLocked(b)).toBe(true);
    expect(boxSollLabel(b, t, fmt)).toBe("sollLockedIndefinite");
  });

  it("anstehendes lock erfindet KEIN Soll — die Details kennt erst der nächste Push", () => {
    const b = row({ pendingCommand: "lock" });
    expect(boxSollLocked(b)).toBe(false);
    expect(boxSollLabel(b, t, fmt)).toBe("sollNone");
  });

  // Ein Sperrbruch erzeugt gar kein open-Kommando (boxCommandForEntry → null), der Spiegel bleibt
  // also stehen — genau der Fall, für den die Konflikt-Warnung gedacht ist, verstummt nicht.
  it("gebrochene Sperrzeit (kein Kommando gesetzt) lässt den SOLL stehen", () => {
    expect(boxSollLocked(row({ pendingCommand: null, keyholderLocked: true }))).toBe(true);
  });

  it("ohne anstehendes Kommando gilt der Spiegel unverändert", () => {
    expect(boxSollLabel(row({ simpleLock: true }), t, fmt)).toBe("sollIndefinite");
    expect(boxSollLabel(row({ keyholderLocked: true }), t, fmt)).toBe("sollLockedIndefinite");
    expect(boxSollLabel(row({ keyholderLocked: true, lockUntil: "x" }), t, fmt)).toBe("sollLockedUntil");
    expect(boxSollLabel(row({ lockUntil: "x" }), t, fmt)).toBe("sollUntil");
    expect(boxSollLabel(row({}), t, fmt)).toBe("sollNone");
  });
});

// Die Vorwarnung vor den beiden AUTONOMEN Failsafes (heimdall#1). Der reale Ablauf, der sie nötig
// machte: 24 verfehlte Syncs am Stück, alles korrekt gepuffert — und das erste sichtbare Signal
// war die Not-Öffnung selbst. Die Restzeit muss deshalb aus der VERGANGENEN ZEIT entstehen, nie
// aus einem Box-Feld: eine Box, die nicht syncen kann, meldet auch ihren Offline-Zähler nicht.
describe("boxFailsafeWarnings", () => {
  const NOW = Date.parse("2026-07-28T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  /** Verschlossene Box mit 24-h-Funkstille-Failsafe — der Normalfall im Feld. */
  const locked = (over: Partial<BoxRow>) =>
    row({ locked: true, reportedLocked: true, offlineOpenHours: 24, ...over });
  const kinds = (b: BoxRow) => boxFailsafeWarnings(b, NOW).map((w) => `${w.kind}:${w.severity}`);

  it("unter der halben Frist: nichts — sonst warnt jede Karte im Dauerbetrieb", () => {
    expect(kinds(locked({ lastSyncAt: hoursAgo(11.9) }))).toEqual([]);
  });

  it("ab der Hälfte dezent, ab drei Vierteln deutlich, ab der Frist fällig", () => {
    expect(kinds(locked({ lastSyncAt: hoursAgo(12) }))).toEqual(["offlineOpen:info"]);
    expect(kinds(locked({ lastSyncAt: hoursAgo(18) }))).toEqual(["offlineOpen:warn"]);
    expect(kinds(locked({ lastSyncAt: hoursAgo(24) }))).toEqual(["offlineOpen:due"]);
    expect(kinds(locked({ lastSyncAt: hoursAgo(40) }))).toEqual(["offlineOpen:due"]);
  });

  it("nennt die Stunden ohne Kontakt und die Restzeit — der Satz aus dem Issue", () => {
    const [w] = boxFailsafeWarnings(locked({ lastSyncAt: hoursAgo(19) }), NOW);
    expect(w).toEqual({ kind: "offlineOpen", severity: "warn", hoursOffline: 19, thresholdHours: 24, hoursLeft: 5 });
  });

  it("Restzeit rundet auf: die letzte Warnung heisst 'in 1 Std', nicht 'in 0'", () => {
    const [w] = boxFailsafeWarnings(locked({ lastSyncAt: hoursAgo(23.9) }), NOW);
    expect(w).toMatchObject({ hoursLeft: 1, severity: "warn" });
  });

  it("offene Box: keine Warnung — an ihr ist eine Not-Öffnung ein Nicht-Ereignis", () => {
    expect(kinds(locked({ lastSyncAt: hoursAgo(30), reportedLocked: false }))).toEqual([]);
  });

  it("Alt-Zeile ohne gemeldete Schwelle: still statt geraten", () => {
    expect(kinds(locked({ lastSyncAt: hoursAgo(30), offlineOpenHours: null }))).toEqual([]);
  });

  it("noch nie gesynct: keine Frist, von der aus gezählt werden könnte", () => {
    expect(kinds(locked({ lastSyncAt: null }))).toEqual([]);
  });

  it("Sync-Zeitpunkt minimal in der Zukunft (Uhr-Drift) ergibt keine negative Dauer", () => {
    expect(kinds(locked({ lastSyncAt: new Date(NOW + 5_000).toISOString() }))).toEqual([]);
  });

  it("Akku knapp über der Schwelle warnt, auf/unter der Schwelle ist er fällig", () => {
    expect(kinds(locked({ battery: 21, lowBatteryOpenPercent: 15 }))).toEqual([]);
    expect(kinds(locked({ battery: 20, lowBatteryOpenPercent: 15 }))).toEqual(["lowBatteryOpen:warn"]);
    expect(kinds(locked({ battery: 15, lowBatteryOpenPercent: 15 }))).toEqual(["lowBatteryOpen:due"]);
  });

  // Kein Ladezustand in der Eingabe, und das ist die Aussage: die Firmware fragt ihn beim
  // Akku-Failsafe ebenfalls nicht (failsafe.h: isLowBattery latcht ohne Blick aufs Kabel). Eine
  // Ausnahme „schweigt am Kabel" müsste also erst ein Feld einführen — dieser Test verhindert nicht,
  // dass jemand das tut, aber der Typ tut es: `BoxFailsafeInput` hat schlicht kein `charging`.
  it("Akkustand deutlich unter der Schwelle bleibt fällig, egal was sonst gemeldet wurde", () => {
    expect(kinds(locked({ battery: 12, lowBatteryOpenPercent: 15 }))).toEqual(["lowBatteryOpen:due"]);
  });

  it("ohne gemeldete Akku-Schwelle keine Akku-Warnung (Firmware-Konstante wird nie geraten)", () => {
    expect(kinds(locked({ battery: 5, lowBatteryOpenPercent: null }))).toEqual([]);
  });

  it("beide Failsafes gleichzeitig — der Keyholder sieht beide Gründe, nicht nur den ersten", () => {
    expect(kinds(locked({ lastSyncAt: hoursAgo(20), battery: 14, lowBatteryOpenPercent: 15 })))
      .toEqual(["offlineOpen:warn", "lowBatteryOpen:due"]);
  });
});

// Die Dauer-Akkuanzeige. Grob statt prozentgenau, weil der Rohwert je Box zweistellig danebenlag,
// bis sich die Firmware am Ladeschluss selbst kalibrierte — und die KRITISCH-Stufe hängt an der
// gemeldeten Auslöse-Schwelle, nicht an einer runden Zahl.
describe("boxBatteryLabel", () => {
  const t = (key: string) => key;
  const batt = (over: Partial<BoxRow>) => boxBatteryLabel(row({ lowBatteryOpenPercent: 15, ...over }), t);

  it("vier Stufen von voll bis kritisch", () => {
    expect(batt({ battery: 95 })).toBe("batteryFull");
    expect(batt({ battery: 80 })).toBe("batteryFull");
    expect(batt({ battery: 79 })).toBe("batteryMedium");
    expect(batt({ battery: 40 })).toBe("batteryMedium");
    expect(batt({ battery: 39 })).toBe("batteryLow");
    expect(batt({ battery: 16 })).toBe("batteryLow");
    expect(batt({ battery: 15 })).toBe("batteryCritical");
    expect(batt({ battery: 0 })).toBe("batteryCritical");
  });

  it("die kritische Stufe folgt der gemeldeten Schwelle, nicht einer festen Zahl", () => {
    expect(batt({ battery: 30, lowBatteryOpenPercent: 30 })).toBe("batteryCritical");
    expect(batt({ battery: 30, lowBatteryOpenPercent: 25 })).toBe("batteryLow");
  });

  it("ohne gemeldete Schwelle entfällt nur die kritische Stufe — geraten wird sie nie", () => {
    expect(batt({ battery: 5, lowBatteryOpenPercent: null })).toBe("batteryLow");
    expect(batt({ battery: 90, lowBatteryOpenPercent: null })).toBe("batteryFull");
  });

  it("am Kabel hängt der Ladehinweis an der Stufe", () => {
    expect(batt({ battery: 50, charging: true })).toBe("batteryMedium · batteryCharging");
    expect(batt({ battery: 50, charging: false })).toBe("batteryMedium");
  });

  it("ohne Akkuwert gibt es nichts anzuzeigen (Board ohne Messung)", () => {
    expect(batt({ battery: null })).toBeNull();
  });
});

// Die Schwelle ist per Push frei setzbar (0–100). Die Anzeige-Stufen dürfen deshalb nicht fix
// bleiben: sonst stünde bei einer hoch gemeldeten Schwelle „Akku voll" unter einer Warnung, die
// bei genau diesem Stand die Selbst-Öffnung ankündigt.
describe("boxBatteryLabel — Stufen weichen der gemeldeten Schwelle aus", () => {
  const t = (key: string) => key;
  const batt = (over: Partial<BoxRow>) => boxBatteryLabel(row(over), t);

  it("hohe Schwelle schiebt die Stufen mit hoch, statt „voll\" zu behaupten", () => {
    expect(batt({ battery: 80, lowBatteryOpenPercent: 78 })).toBe("batteryLow");
    expect(batt({ battery: 55, lowBatteryOpenPercent: 50 })).toBe("batteryLow");
    expect(batt({ battery: 50, lowBatteryOpenPercent: 50 })).toBe("batteryCritical");
  });

  it("die niedrige Stufe deckt mindestens das Warnband ab", () => {
    // Alles, was `boxFailsafeWarnings` als lowBatteryOpen meldet, ist hier nie „mittel"/„voll".
    for (const opensAt of [15, 30, 50, 70]) {
      for (const battery of [opensAt, opensAt + 3, opensAt + 5]) {
        expect(batt({ battery, lowBatteryOpenPercent: opensAt })).not.toBe("batteryMedium");
        expect(batt({ battery, lowBatteryOpenPercent: opensAt })).not.toBe("batteryFull");
      }
    }
  });

  // 0 ist die natürliche Kodierung für „Akku-Failsafe aus" — genau wie beim Funkstille-Zwilling,
  // der `offlineOpenHours > 0` verlangt. Eine Selbst-Öffnung bei 0 % gibt es nicht.
  it("Schwelle 0 heisst „keine Schwelle\", nicht „öffnet bei 0 %\"", () => {
    expect(batt({ battery: 0, lowBatteryOpenPercent: 0 })).toBe("batteryLow");
    expect(boxFailsafeWarnings(
      row({ locked: true, reportedLocked: true, battery: 0, lowBatteryOpenPercent: 0 }), Date.now(),
    )).toEqual([]);
  });
});
