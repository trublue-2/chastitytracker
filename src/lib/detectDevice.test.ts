import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/imageUtils", () => ({ loadUploadedImage: vi.fn() }));
vi.mock("@/lib/vision", () => ({ visionComplete: vi.fn(), visionConfigured: vi.fn(() => true) }));

import { checkDeviceInPhoto, detectDevice, type DeviceReference } from "./detectDevice";
import { loadUploadedImage } from "@/lib/imageUtils";
import { visionComplete, visionConfigured } from "@/lib/vision";

const loadMock = loadUploadedImage as unknown as ReturnType<typeof vi.fn>;
const visionMock = visionComplete as unknown as ReturnType<typeof vi.fn>;
const configuredMock = visionConfigured as unknown as ReturnType<typeof vi.fn>;

const REFS: DeviceReference[] = [
  { deviceId: "a", deviceName: "Cage A", imageUrls: ["/u/a.jpg"] }, // → DEVICE_1
  { deviceId: "b", deviceName: "Cage B", imageUrls: ["/u/b.jpg"] }, // → DEVICE_2
];
const reply = (obj: unknown) => ({ text: JSON.stringify(obj), requestId: "r" });

beforeEach(() => {
  loadMock.mockReset().mockResolvedValue({ base64: "B64", mediaType: "image/jpeg" });
  visionMock.mockReset();
  configuredMock.mockReset().mockReturnValue(true);
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

  it("wrong: a device is present but matches no reference (detected null)", async () => {
    visionMock.mockResolvedValue(reply({ present: true, device: null }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "wrong", detected: null, expected: "Cage A" });
  });

  it("missing: no device present", async () => {
    visionMock.mockResolvedValue(reply({ present: false, device: null }));
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "missing", detected: null, expected: "Cage A" });
  });

  it("missing: unparseable model output is treated as not-present (never a false rejection)", async () => {
    visionMock.mockResolvedValue({ text: "sorry, I can't tell", requestId: "r" });
    expect(await checkDeviceInPhoto("/u/q.jpg", REFS, "a")).toEqual({ status: "missing", detected: null, expected: "Cage A" });
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
