import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEntryPayload, deviceCategoriesEnabled, weightTrackingEnabled, clampStartGrace, startGraceFromClock, VALID_TYPES, KG_ENTRY_TYPES, WEAR_ENTRY_TYPES, TASK_DEFAULT_START_GRACE_MIN, TASK_START_GRACE_RANGE, DURATION_UNITS, durationToHours, durationFromHours } from "./constants";

const FUTURE_SAFE_TIME = "2030-01-01T10:00:00Z";

describe("VALID_TYPES", () => {
  it("contains VERSCHLUSS, OEFFNEN, PRUEFUNG, ORGASMUS, WEAR_BEGIN, WEAR_END", () => {
    expect(VALID_TYPES).toEqual(["VERSCHLUSS", "OEFFNEN", "PRUEFUNG", "ORGASMUS", "WEAR_BEGIN", "WEAR_END"]);
  });

  it("KG_ENTRY_TYPES contains exactly VERSCHLUSS and OEFFNEN", () => {
    expect([...KG_ENTRY_TYPES].sort()).toEqual(["OEFFNEN", "VERSCHLUSS"]);
  });

  it("WEAR_ENTRY_TYPES contains exactly WEAR_BEGIN and WEAR_END", () => {
    expect([...WEAR_ENTRY_TYPES].sort()).toEqual(["WEAR_BEGIN", "WEAR_END"]);
  });
});

describe("weightTrackingEnabled", () => {
  const original = process.env.ENABLE_WEIGHT_TRACKING;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_WEIGHT_TRACKING;
    else process.env.ENABLE_WEIGHT_TRACKING = original;
  });

  it("ist AUS, solange nichts gesetzt ist — Gesundheitsdaten sind opt-in", () => {
    delete process.env.ENABLE_WEIGHT_TRACKING;
    expect(weightTrackingEnabled()).toBe(false);
  });

  it("schaltet nur ein exaktes „true\" ein (Gross-/Kleinschreibung egal)", () => {
    for (const wert of ["true", "True", "TRUE"]) {
      process.env.ENABLE_WEIGHT_TRACKING = wert;
      expect(weightTrackingEnabled(), wert).toBe(true);
    }
  });

  it("lässt sich nicht versehentlich einschalten", () => {
    // Ein halb gesetzter Schalter darf ein Gesundheitsdaten-Feature nicht aufmachen.
    for (const wert of ["1", "yes", "on", "", "false"]) {
      process.env.ENABLE_WEIGHT_TRACKING = wert;
      expect(weightTrackingEnabled(), wert).toBe(false);
    }
  });
});

describe("deviceCategoriesEnabled", () => {
  const original = process.env.ENABLE_DEVICE_CATEGORIES;
  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_DEVICE_CATEGORIES;
    else process.env.ENABLE_DEVICE_CATEGORIES = original;
  });

  it("returns true when env var is unset (default ON)", () => {
    delete process.env.ENABLE_DEVICE_CATEGORIES;
    expect(deviceCategoriesEnabled()).toBe(true);
  });

  it("returns false when env var is 'false' (case-insensitive)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    expect(deviceCategoriesEnabled()).toBe(false);
    process.env.ENABLE_DEVICE_CATEGORIES = "False";
    expect(deviceCategoriesEnabled()).toBe(false);
    process.env.ENABLE_DEVICE_CATEGORIES = "FALSE";
    expect(deviceCategoriesEnabled()).toBe(false);
  });

  it("returns true for any non-'false' value (default opt-out semantics)", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "true";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "1";
    expect(deviceCategoriesEnabled()).toBe(true);
    process.env.ENABLE_DEVICE_CATEGORIES = "";
    expect(deviceCategoriesEnabled()).toBe(true);
  });
});

describe("validateEntryPayload — WEAR types feature flag", () => {
  // The flag defaults ON, so the off-cases set it explicitly to "false".
  beforeEach(() => { delete process.env.ENABLE_DEVICE_CATEGORIES; });
  afterEach(() => { delete process.env.ENABLE_DEVICE_CATEGORIES; });

  it("rejects WEAR_BEGIN when feature flag is explicitly off", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBe("DEVICE_CATEGORIES_DISABLED");
  });

  it("rejects WEAR_END when feature flag is explicitly off", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "WEAR_END", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBe("DEVICE_CATEGORIES_DISABLED");
  });

  it("accepts WEAR_BEGIN by default (flag ON)", () => {
    const result = validateEntryPayload(
      { type: "WEAR_BEGIN", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });

  it("accepts WEAR_END by default (flag ON)", () => {
    const result = validateEntryPayload(
      { type: "WEAR_END", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });

  it("VERSCHLUSS works regardless of feature flag", () => {
    process.env.ENABLE_DEVICE_CATEGORIES = "false";
    const result = validateEntryPayload(
      { type: "VERSCHLUSS", startTime: FUTURE_SAFE_TIME },
      { allowFuture: true },
    );
    expect(result).toBeNull();
  });

  describe("reasonCtx (per-user custom reason codes)", () => {
    it("accepts a custom opening code when passed in reasonCtx", () => {
      const result = validateEntryPayload(
        { type: "OEFFNEN", startTime: FUTURE_SAFE_TIME, oeffnenGrund: "c_custom01", note: "x" },
        { allowFuture: true },
        { openingCodes: new Set(["REINIGUNG", "c_custom01"]) },
      );
      expect(result).toBeNull();
    });
    it("rejects an opening code not in the user's list", () => {
      const result = validateEntryPayload(
        { type: "OEFFNEN", startTime: FUTURE_SAFE_TIME, oeffnenGrund: "KEYHOLDER", note: "x" },
        { allowFuture: true },
        { openingCodes: new Set(["REINIGUNG"]) },
      );
      expect(result).toBe("OPENING_REASON_REQUIRED");
    });
    it("accepts an orgasm value allowed by the reasonCtx predicate", () => {
      const allow = new Set(["c_quickie", "Orgasmus"]);
      const result = validateEntryPayload(
        { type: "ORGASMUS", startTime: FUTURE_SAFE_TIME, orgasmusArt: "c_quickie" },
        { allowFuture: true },
        { orgasmAllowed: (v) => allow.has(v) },
      );
      expect(result).toBeNull();
    });
    it("rejects an orgasm value the reasonCtx predicate disallows", () => {
      const result = validateEntryPayload(
        { type: "ORGASMUS", startTime: FUTURE_SAFE_TIME, orgasmusArt: "verboten" },
        { allowFuture: true },
        { orgasmAllowed: () => false },
      );
      expect(result).toBe("INVALID_ORGASM_TYPE");
    });
    it("without reasonCtx, built-in constants still apply (backward-compat)", () => {
      expect(validateEntryPayload(
        { type: "OEFFNEN", startTime: FUTURE_SAFE_TIME, oeffnenGrund: "REINIGUNG", note: "x" },
        { allowFuture: true },
      )).toBeNull();
      expect(validateEntryPayload(
        { type: "OEFFNEN", startTime: FUTURE_SAFE_TIME, oeffnenGrund: "c_nope", note: "x" },
        { allowFuture: true },
      )).toBe("OPENING_REASON_REQUIRED");
    });
  });

  // Der Gegenpart zum PATCH-Guard in api/entries/[id]: ohne diese Zusage liesse sich eine
  // angeforderte Kontrolle schon beim Anlegen ohne jeden Nachweis abhaken (Frist erfüllt, kein
  // Vergehen im Strafbuch). Der Admin-Pfad darf weiterhin ohne Foto nachtragen.
  describe("Foto-Pflicht der Kontrolle", () => {
    it("weist eine PRUEFUNG mit Kontroll-Code ohne Foto ab", () => {
      expect(validateEntryPayload(
        { type: "PRUEFUNG", startTime: FUTURE_SAFE_TIME },
        { allowFuture: true },
      )).toBe("INSPECTION_PHOTO_REQUIRED");
    });
    it("akzeptiert jedes beliebige Foto — den Inhalt beurteilt die Keyholderin", () => {
      expect(validateEntryPayload(
        { type: "PRUEFUNG", startTime: FUTURE_SAFE_TIME, imageUrl: "/api/uploads/beliebig.jpg" },
        { allowFuture: true },
      )).toBeNull();
    });
    it("lässt den Admin-Pfad ohne Foto nachtragen", () => {
      expect(validateEntryPayload(
        { type: "PRUEFUNG", startTime: FUTURE_SAFE_TIME },
        { allowFuture: true, requirePhotoForPruefung: false },
      )).toBeNull();
    });
  });
});

describe("clampStartGrace — eine Klemmung für Server UND Formular-Vorschau", () => {
  it("lässt die ausdrückliche 0 stehen („sofort anfangen“)", () => {
    // Der ganze Grund, aus dem dieses Feld nicht über `clamp()` läuft: dessen `|| fallback` machte
    // aus der 0 den Default — der dokumentierte Bereich beginnt aber bei 0.
    expect(clampStartGrace(0)).toBe(0);
  });

  it("nimmt die Vorgabe, wo nichts (Lesbares) dasteht", () => {
    expect(clampStartGrace(undefined)).toBe(TASK_DEFAULT_START_GRACE_MIN);
    // Ein leeres Zahlenfeld liefert NaN — ungeklemmt liefe das bis in die Datenbank.
    expect(clampStartGrace(Number.NaN)).toBe(TASK_DEFAULT_START_GRACE_MIN);
  });

  it("holt Werte ausserhalb des Bereichs an die Grenze", () => {
    expect(clampStartGrace(-600)).toBe(TASK_START_GRACE_RANGE.min);
    expect(clampStartGrace(99_999)).toBe(TASK_START_GRACE_RANGE.max);
  });

  it("rundet Bruchteile — Minuten sind ganze Zahlen", () => {
    expect(clampStartGrace(12.4)).toBe(12);
  });
});

describe("startGraceFromClock — „spätestens um 18:00“ als Minutenzahl", () => {
  const ms = (iso: string) => new Date(iso).getTime();

  it("misst gegen den Nullpunkt der Aufgabe", () => {
    expect(startGraceFromClock(ms("2026-08-15T18:00:00Z"), ms("2026-08-15T14:00:00Z"))).toBe(240);
  });

  it("misst bei einer TERMINIERTEN Aufgabe ab dem Auslösen, nicht ab dem Ausfüllen", () => {
    // Um 08:00 gestellt, wirksam ab 17:00, spätester Beginn 17:30 — das sind 30 Minuten Kulanz und
    // nicht 570. Ab „jetzt" gerechnet käme die ganze Wartezeit oben drauf und die Aufgabe wäre bei
    // ihrem Wirksamwerden längst begonnen zu haben.
    const wirksamAb = ms("2026-08-15T17:00:00Z");
    expect(startGraceFromClock(ms("2026-08-15T17:30:00Z"), wirksamAb)).toBe(30);
  });

  it("weist eine Uhrzeit VOR dem Nullpunkt ab", () => {
    expect(startGraceFromClock(ms("2026-08-15T16:00:00Z"), ms("2026-08-15T17:00:00Z"))).toBeNull();
  });

  it("weist den Nullpunkt selbst ab — eine Frist, die sofort abgelaufen wäre", () => {
    const anchor = ms("2026-08-15T17:00:00Z");
    expect(startGraceFromClock(anchor, anchor)).toBeNull();
  });

  it("weist ab, was weiter als der erlaubte Bereich hinter dem Nullpunkt liegt", () => {
    const anchor = ms("2026-08-15T17:00:00Z");
    const max = TASK_START_GRACE_RANGE.max;
    expect(startGraceFromClock(anchor + max * 60_000, anchor)).toBe(max);
    // Eine Minute darüber wird ABGEWIESEN und nicht geklemmt: aus einer ausdrücklich gewählten
    // Uhrzeit darf still keine andere werden.
    expect(startGraceFromClock(anchor + (max + 1) * 60_000, anchor)).toBeNull();
  });

  it("weist eine unlesbare Uhrzeit ab (leeres oder halb getipptes Feld)", () => {
    expect(startGraceFromClock(Number.NaN, ms("2026-08-15T17:00:00Z"))).toBeNull();
  });

  it("rundet AUF ganze Minuten auf — die Rundung darf die Frist nicht strenger machen", () => {
    // Der Nullpunkt trägt Sekunden (er ist „jetzt"), die gewählte Uhrzeit nicht. Abgerundet läge die
    // Frist bis zu 59 Sekunden vor der eingestellten Uhrzeit.
    const anchor = ms("2026-08-15T17:00:35Z");
    expect(startGraceFromClock(ms("2026-08-15T17:01:00Z"), anchor)).toBe(1);
    expect(startGraceFromClock(ms("2026-08-15T17:30:00Z"), anchor)).toBe(30);
  });
});

describe("Dauer-Einheiten", () => {
  it("rechnet Minuten in Stunden um, Stunden bleiben Stunden", () => {
    expect(durationToHours(15, "min")).toBeCloseTo(0.25);
    expect(durationToHours(0.25, "h")).toBe(0.25);
  });

  it("gibt für eine leere Eingabe NaN weiter, statt einen Wert zu erfinden", () => {
    // Das Formular startet mit leerem Feld; `parseFloat("")` ist NaN, und daraus muss ein UNGÜLTIGES
    // Datum werden — ein Ersatzwert wäre genau die stille Vorbelegung, die hier abgeschafft wurde.
    expect(durationToHours(Number.NaN, "h")).toBeNaN();
  });

  it("bringt eine Dauer verlustfrei in die andere Einheit", () => {
    expect(durationFromHours(0.25, "min")).toBe(15);
    expect(durationFromHours(1, "min")).toBe(60);
    expect(durationFromHours(0.25, "h")).toBe(0.25);
  });

  it("rastert auf die Schrittweite der Ziel-Einheit", () => {
    // Aus einem festen Zeitpunkt fällt selten eine runde Dauer — im Feld darf trotzdem kein
    // „2.3833" landen, sonst weist die HTML-Validierung den eigenen Wert als Schrittfehler ab.
    expect(durationFromHours(2.3833, "h")).toBe(2.5);
    expect(durationFromHours(2.3833, "min")).toBe(145);
  });

  it("fällt nicht unter das Minimum der Einheit — auch nicht bei einer vergangenen Zeit", () => {
    expect(durationFromHours(-3, "h")).toBe(DURATION_UNITS.h.min);
    expect(durationFromHours(-3, "min")).toBe(DURATION_UNITS.min.min);
  });

  it("bleibt beim Hin- und Herschalten bei derselben Dauer", () => {
    for (const hours of [0.25, 0.5, 1, 2, 4]) {
      expect(durationToHours(durationFromHours(hours, "min"), "min")).toBeCloseTo(hours);
      expect(durationToHours(durationFromHours(hours, "h"), "h")).toBeCloseTo(hours);
    }
  });
});
