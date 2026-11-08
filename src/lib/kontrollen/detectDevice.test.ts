import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ loadUploadedImage: vi.fn() }));
vi.mock("@/lib/vision", () => ({ visionComplete: vi.fn(), visionConfigured: vi.fn(() => true) }));
// Das Bild-Budget wird gepinnt statt aus den Defaults gelesen: sonst hinge die erwartete Verteilung
// still an zwei Konstanten in constants.ts und ein Default-Wechsel liefe hier als undurchsichtiger
// Array-Vergleich auf.
vi.mock("@/lib/constants", () => ({
  visionDeviceMaxImagePx: vi.fn(() => 512),
  visionMaxRefsPerDevice: vi.fn(() => 2),
  visionMaxTotalRefs: vi.fn(() => 6),
}));

import { allocateImageBudget, checkDeviceInPhoto, detectDevice, type DeviceReference } from "./detectDevice";
import { loadUploadedImage } from "@/lib/imageUtils";
import { visionComplete, visionConfigured } from "@/lib/vision";
import { visionMaxRefsPerDevice } from "@/lib/constants";

const loadMock = loadUploadedImage as unknown as ReturnType<typeof vi.fn>;
const visionMock = visionComplete as unknown as ReturnType<typeof vi.fn>;
const configuredMock = visionConfigured as unknown as ReturnType<typeof vi.fn>;
const perDeviceMock = visionMaxRefsPerDevice as unknown as ReturnType<typeof vi.fn>;

const REFS: DeviceReference[] = [
  // Cage A trägt optische Merkmale, Cage B nicht — deckt beide Zweige des Katalog-Aufbaus ab.
  { deviceId: "a", deviceName: "Cage A", visualTraits: "Edelstahl, voll", lookalikeClusterId: null, imageUrls: ["/u/a.jpg"] }, // → DEVICE_1
  { deviceId: "b", deviceName: "Cage B", visualTraits: null, lookalikeClusterId: null, imageUrls: ["/u/b.jpg"] }, // → DEVICE_2
];
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), requestId: "r" });

beforeEach(() => {
  loadMock.mockReset().mockResolvedValue({ base64: "B64", mediaType: "image/jpeg" });
  visionMock.mockReset();
  configuredMock.mockReset().mockReturnValue(true);
  perDeviceMock.mockReturnValue(2);
});

describe("allocateImageBudget", () => {
  it("gibt jedem Gerät ein Bild — auch wenn das Budget dabei überzogen wird", () => {
    // Ein Gerät ohne Bild im Prompt ist kein Kandidat mehr. Lieber Budget reissen als die
    // Vergleichsmenge beschneiden (Verhalten wie vor der Relevanz-Verteilung).
    expect(allocateImageBudget([2, 2, 2, 2], 2, [false, false, false, false])).toEqual([1, 1, 1, 1]);
  });

  it("verteilt den Rest reihum, wenn keine Prioritäten gesetzt sind", () => {
    // Klassifikations-Pfad: alle gleich. Nutzt das Budget besser aus als das frühere
    // floor(6/4) = 1, das zwei Bilder ungenutzt liegen liess.
    expect(allocateImageBudget([3, 3, 3, 3], 6, [false, false, false, false])).toEqual([2, 2, 1, 1]);
  });

  it("gibt den Rest zuerst den Prioritätsgeräten", () => {
    // Kontroll-Check: das erwartete Gerät und sein Lookalike-Cluster tragen die Entscheidung.
    expect(allocateImageBudget([4, 4, 4, 4], 8, [false, true, true, false])).toEqual([1, 3, 3, 1]);
  });

  it("teilt den Rest unter mehreren Prioritätsgeräten auf, statt das erste zu füllen", () => {
    // Bei einer Verwechslung sind beide Seiten gleich wichtig — reihum, nicht am Stück.
    expect(allocateImageBudget([5, 5], 5, [true, true])).toEqual([3, 2]);
  });

  it("überspringt Geräte, die keine weiteren Bilder haben, statt Budget zu verfallen", () => {
    expect(allocateImageBudget([1, 5], 5, [true, false])).toEqual([1, 4]);
  });

  it("hält die Obergrenze je Gerät ein, auch für Prioritätsgeräte", () => {
    // Die Obergrenze ist der Grund, warum die Priorisierung bei kleinen Werten wenig ausrichtet:
    // sie bindet, bevor das Gesamtbudget es tut. Sie wird an EINER Stelle angewandt — hier.
    expect(allocateImageBudget([5, 5, 5], 12, [true, false, false], 2)).toEqual([2, 2, 2]);
  });

  it("kommt mit einer leeren Geräteliste klar", () => {
    expect(allocateImageBudget([], 6, [])).toEqual([]);
  });
});

describe("checkDeviceInPhoto", () => {
  it("returns null when no vision provider is configured", async () => {
    configuredMock.mockReturnValue(false);
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toBeNull();
    expect(visionMock).not.toHaveBeenCalled();
  });

  it("error (nicht prüfbar) when the locked device has no loadable references", async () => {
    // Verschlossenes Gerät ohne (ladbare) Referenzbilder → klarer „error" statt null, damit es sich
    // von „gar nicht geprüft" unterscheidet. expected null, weil das Gerät nicht in den Referenzen ist.
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "does-not-exist")).toEqual({ status: "error", detected: null, expected: null });
    expect(visionMock).not.toHaveBeenCalled();
  });

  it("error (nicht prüfbar) when images can't be loaded, expected resolved from references", async () => {
    loadMock.mockResolvedValue(null); // loadDeviceSet scheitert
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });

  it("ok: the locked device is detected in the photo", async () => {
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_1" }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "ok", detected: "Cage A", expected: "Cage A" });
  });

  it("wrong: a different known device is detected", async () => {
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_2" }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "wrong", detected: "Cage B", expected: "Cage A" });
  });

  it("error (nicht prüfbar): a device is present but matches no reference — NIE 'wrong'", async () => {
    // Nichts zugeordnet heisst NICHT „anderes Gerät getragen" — ein Negativbefund ohne benanntes
    // Gerät wäre ein Vorwurf ohne Beleg (Issue #44).
    visionMock.mockResolvedValue(reply({ present: true, device: null }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });

  it("error (nicht prüfbar): 'UNSURE' — die Ansicht trägt die Unterscheidung nicht", async () => {
    // Der Verwechslungsfall vom 27.07.2026: zwei optisch nahe Vollmetall-KG, das Kontrollfoto ein
    // Ausschnitt ohne das trennende Merkmal. Ohne diese Ausfahrt musste das Modell sich zwischen
    // „passt" und „ein anderes" entscheiden — und ein geratenes „anderes" wurde als `wrong` gebucht,
    // obwohl gar nichts festgestellt war. Ein Nicht-Befund ist kein Negativbefund.
    visionMock.mockResolvedValue(reply({ present: true, device: "UNSURE" }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });

  it("nennt die hinterlegten optischen Merkmale im Prompt — sie sind das, was ein Teilbild verschweigt", async () => {
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_1" }));
    await checkDeviceInPhoto("/u/q.jpg", REFS, "a");
    const intro = visionMock.mock.calls[0][0].content[0].text as string;
    expect(intro).toContain('DEVICE_1: "Cage A"');
    expect(intro).toContain("looks like: Edelstahl, voll");
    expect(intro).toContain("REQUIRED");
    // Cage B hat keine Merkmale hinterlegt → nur Name, kein leeres „looks like".
    expect(intro).toContain('DEVICE_2: "Cage B"\n');
  });

  it("gibt dem erwarteten Gerät und seinem Lookalike-Cluster mehr Referenzbilder als den übrigen", async () => {
    // Der eigentliche Verwechslungsfall: zwei optisch gleiche KG (Cluster "steel") und ein drittes,
    // das visuell ohnehin ausscheidet. Budget 6, drei Geräte → 3 Bilder Grundzuteilung, 3 zu
    // verteilen. Die gehen an das erwartete Gerät und seinen Cluster-Partner, nicht an das dritte.
    // Obergrenze je Gerät auf 3 gehoben: bei der Vorgabe 2 wäre nach zwei Bildern Schluss und die
    // Priorisierung liefe ins Leere — genau der Grund, warum sie bei knappem Budget wenig ausrichtet.
    perDeviceMock.mockReturnValue(3);
    const many = (p: string) => [`/u/${p}1.jpg`, `/u/${p}2.jpg`, `/u/${p}3.jpg`];
    const refs: DeviceReference[] = [
      { deviceId: "a", deviceName: "Steel A", visualTraits: null, lookalikeClusterId: "steel", imageUrls: many("a") },
      { deviceId: "b", deviceName: "Steel B", visualTraits: null, lookalikeClusterId: "steel", imageUrls: many("b") },
      { deviceId: "c", deviceName: "Plastic C", visualTraits: null, lookalikeClusterId: null, imageUrls: many("c") },
    ];
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_1" }));
    await checkDeviceInPhoto("/u/q.jpg", refs, "a");

    // Die Bild-Blöcke je Gerät zählen: nach jedem „Reference images for DEVICE_n"-Text folgen dessen
    // Bilder. Das Query-Foto steht hinter dem QUERY-Text und wird vorher abgeschnitten.
    const content = visionMock.mock.calls[0][0].content as { type: string; text?: string }[];
    const refBlocks = content.slice(0, content.findIndex((b) => b.text?.startsWith("QUERY")));
    const perDevice: number[] = [];
    for (const block of refBlocks) {
      if (block.type === "text" && block.text?.startsWith("Reference images for")) perDevice.push(0);
      else if (block.type === "image") perDevice[perDevice.length - 1]++;
    }
    // Der Rest geht reihum an die Prioritätsgeräte, das erwartete zuerst — bei ungeradem Rest
    // bekommt es das zusätzliche Bild. Das dritte Gerät bleibt bei seiner Grundzuteilung.
    expect(perDevice).toEqual([3, 2, 1]);
  });

  it("weicht auf das nächste Referenzbild aus, wenn das erste nicht ladbar ist", async () => {
    // Eine Referenz kann auf eine gelöschte Datei zeigen, und die Bilder stehen nach createdAt desc
    // — die tote Datei ist also bevorzugt die erste. Bei Kontingent 1 wäre das Gerät sonst ganz aus
    // dem Vergleich und der Kontroll-Check meldete „nicht prüfbar" statt eines Befunds.
    // Kontingent auf 1 zwingen: nur dann liegt die tote Datei allein im Zugriff und der Fall beisst.
    perDeviceMock.mockReturnValue(1);
    const refs: DeviceReference[] = [
      { deviceId: "a", deviceName: "Cage A", visualTraits: null, lookalikeClusterId: null, imageUrls: ["/u/dead.jpg", "/u/good.jpg"] },
    ];
    loadMock.mockImplementation(async (url: string) => (url === "/u/dead.jpg" ? null : { base64: "B64", mediaType: "image/jpeg" }));
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_1" }));

    expect(await checkDeviceInPhoto("/u/q.jpg", refs, "a")).toEqual({ status: "ok", detected: "Cage A", expected: "Cage A" });
    expect(loadMock).toHaveBeenCalledWith("/u/good.jpg", expect.anything());
  });

  it("error (nicht prüfbar): the model names a key that is not in the reference set", async () => {
    visionMock.mockResolvedValue(reply({ present: true, device: "DEVICE_9" }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });

  it("missing: no device present", async () => {
    visionMock.mockResolvedValue(reply({ present: false, device: null }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "missing", detected: null, expected: "Cage A" });
  });

  it("error (nicht prüfbar): unparseable/abgeschnittene Antwort ist kein 'kein Gerät sichtbar'", async () => {
    visionMock.mockResolvedValue({ text: "sorry, I can't tell", requestId: "r" });
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });

  it("error (nicht prüfbar, keine Ablehnung) when the vision call throws — e.g. provider unreachable", async () => {
    visionMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "error", detected: null, expected: "Cage A" });
  });
});

describe("detectDevice", () => {
  it("returns null when not configured", async () => {
    configuredMock.mockReturnValue(false);
    expect(await detectDevice("/u/q.jpg", REFS)).toBeNull();
  });

  it("returns the matched device", async () => {
    visionMock.mockResolvedValue(reply({ device: "DEVICE_2" }));
    expect(await detectDevice("/u/q.jpg", REFS)).toEqual({ deviceId: "b", deviceName: "Cage B" });
  });

  it("returns null when the model cannot determine a device", async () => {
    visionMock.mockResolvedValue(reply({ device: null }));
    expect(await detectDevice("/u/q.jpg", REFS)).toBeNull();
  });

  it("returns null (no crash) when the vision call throws", async () => {
    visionMock.mockRejectedValue(new Error("boom"));
    expect(await detectDevice("/u/q.jpg", REFS)).toBeNull();
  });
});
