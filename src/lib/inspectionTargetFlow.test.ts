import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der Weg einer Ziel-Kontrolle durch Anlegen und Eskalation (v5.0.1).
 *
 * Zwei Stellen, an denen das Ziel etwas ENTSCHEIDET, statt nur mitzureisen:
 * 1. `requestKontrolle` lehnt ab, wenn das Ziel gerade nicht läuft — eine Kontrolle auf einen Plug,
 *    den niemand trägt, wäre nicht erfüllbar und würde nach Fristablauf zum Vergehen.
 * 2. `autoMarkInspectionRemoved` (Stufe 2) bucht das Ende des ZIELS: beim KG ein Öffnen, bei einer
 *    Trage-Kontrolle ein WEAR_END. Der falsche Eintragstyp hier verfälscht die Statistik dauerhaft.
 */

// Der Transaktions-Client trägt dieselben Modelle wie `prisma` — die Ziel-Auflösung läuft bewusst
// IN der Transaktion (TOCTOU: die Trage-Session darf zwischen Prüfung und Anlegen nicht enden).
const tx = {
  kontrollAnforderung: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  entry: { create: vi.fn() },
  device: { findUnique: vi.fn() },
  deviceCategory: { findUnique: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    device: { findUnique: vi.fn() },
    deviceCategory: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock("@/lib/queries", () => ({
  getLatestKgEntry: vi.fn(),
  getActiveWearSessionForCategory: vi.fn(),
  prepareWearEntry: vi.fn(),
  releaseSperrzeitenOnOpen: vi.fn(),
}));
vi.mock("@/lib/oeffnenService", () => ({ createOeffnenEntryTx: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyUser: vi.fn(), notifyControllers: vi.fn() }));
vi.mock("@/lib/keyholder", () => ({ getControllersOfUser: vi.fn(async () => []), getControllerAudience: vi.fn(async () => ({ controllers: [], username: "sub" })) }));
// Nur der Schreib-Weg wird ersetzt; der Rest des Moduls (Absender-Abbildung, Spalten-Helfer) bleibt
// echt — er ist reine Ableitung, keine Nebenwirkung. Spread statt Aufzählung, siehe offenseAnnounce.test.ts.
vi.mock("@/lib/messageService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./messageService")>()),
  recordMessageAndBadge: vi.fn(async () => 0),
}));
vi.mock("@/lib/mail", () => ({
  sendMailSafe: vi.fn(), escHtml: (s: string) => s, appBaseUrl: () => "https://x", noticeBoxHtml: () => "", dashboardEmailHtml: () => "",
}));
vi.mock("@/lib/push", () => ({ firePush: vi.fn() }));
vi.mock("@/lib/appMeta", () => ({ markLastAction: vi.fn() }));
vi.mock("@/lib/emailI18n", () => ({ emailT: vi.fn(async () => (k: string) => k), emailGreeting: () => "" }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (k: string) => k) }));

import { requestKontrolle } from "./kontrolleService";
import { autoMarkInspectionRemoved } from "./inspectionEscalationService";
import { prisma } from "@/lib/prisma";
import { getLatestKgEntry, getActiveWearSessionForCategory, prepareWearEntry } from "@/lib/queries";
import { createOeffnenEntryTx } from "@/lib/oeffnenService";

const userMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
// Ziel-Auflösung und Code-Regel lesen über den tx-Client — dort liegen die Geräte-/Kategorie-Mocks.
const categoryMock = tx.deviceCategory.findUnique;
const deviceMock = tx.device.findUnique;
const lockMock = getLatestKgEntry as unknown as ReturnType<typeof vi.fn>;
const wearMock = getActiveWearSessionForCategory as unknown as ReturnType<typeof vi.fn>;
const prepareWearMock = prepareWearEntry as unknown as ReturnType<typeof vi.fn>;
const createOeffnenMock = createOeffnenEntryTx as unknown as ReturnType<typeof vi.fn>;

const LOCKED = { type: "VERSCHLUSS", startTime: new Date("2026-08-01T08:00:00Z"), kontrollCode: null, deviceId: "kg-1", keyInBox: true, oeffnenGrund: null };
const PLUG_SESSION = { categoryId: "cat-plug", categoryName: "Plug", deviceId: "plug-1", deviceName: "njoy", since: new Date(), imageUrl: null };

beforeEach(() => {
  vi.clearAllMocks();
  userMock.mockResolvedValue({ id: "u1", email: "sub@example.com", username: "sub", locale: "de" });
  categoryMock.mockResolvedValue({ userId: "u1", name: "Plug", isBuiltIn: false });
  deviceMock.mockResolvedValue({ requireInspectionCode: false }); // kein Code → keine Zufallszahl im Test
  lockMock.mockResolvedValue(LOCKED);
  wearMock.mockResolvedValue(PLUG_SESSION);
  tx.kontrollAnforderung.findFirst.mockResolvedValue(null); // keine laufende Kontrolle
  tx.kontrollAnforderung.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "ka1", ...data }));
});

describe("requestKontrolle — das Ziel muss laufen", () => {
  it("Kategorie ohne laufende Trage-Session → USER_NOT_WEARING (nicht USER_NOT_LOCKED)", async () => {
    wearMock.mockResolvedValue(null);
    const r = await requestKontrolle({ userId: "u1", categoryId: "cat-plug" }, "herrin");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe("USER_NOT_WEARING");
  });

  it("KG-Kontrolle ohne Verschluss → USER_NOT_LOCKED (Bestandsverhalten)", async () => {
    lockMock.mockResolvedValue({ ...LOCKED, type: "OEFFNEN" });
    const r = await requestKontrolle({ userId: "u1" }, "herrin");
    expect(!r.ok && r.error).toBe("USER_NOT_LOCKED");
  });

  it("Kategorie-Kontrolle speichert das Ziel an der Zeile", async () => {
    const r = await requestKontrolle({ userId: "u1", categoryId: "cat-plug" }, "herrin");
    expect(r.ok).toBe(true);
    expect(tx.kontrollAnforderung.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ categoryId: "cat-plug", deviceId: null }) }),
    );
  });

  it("gepinntes Gerät, das gerade NICHT getragen wird → INSPECTION_DEVICE_NOT_ACTIVE", async () => {
    deviceMock.mockResolvedValue({
      userId: "u1", name: "anderer Plug", archivedAt: null,
      category: { id: "cat-plug", name: "Plug", isBuiltIn: false },
    });
    const r = await requestKontrolle({ userId: "u1", deviceId: "plug-2" }, "herrin");
    expect(!r.ok && r.error).toBe("INSPECTION_DEVICE_NOT_ACTIVE");
  });

  it("der Überschneidungs-Guard fragt PRO ZIEL, nicht pro User", async () => {
    await requestKontrolle({ userId: "u1", categoryId: "cat-plug" }, "herrin");
    expect(tx.kontrollAnforderung.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: "cat-plug" }) }),
    );
  });
});

describe("autoMarkInspectionRemoved — Stufe 2 folgt dem Ziel", () => {
  const baseRow = { id: "ka1", userId: "u1", entryId: null, withdrawnAt: null, autoMarkedRemovedAt: null, user: { locale: "de" } };

  it("KG-Kontrolle → OEFFNEN-Eintrag (Bestandsverhalten)", async () => {
    tx.kontrollAnforderung.findUnique.mockResolvedValue({ ...baseRow, categoryId: null });
    createOeffnenMock.mockResolvedValue({ entryId: "e-open", withdrawnSperrzeit: false });

    const r = await autoMarkInspectionRemoved({ id: "ka1", userId: "u1" });

    expect(r.skipped).toBe(false);
    expect(createOeffnenMock).toHaveBeenCalled();
    expect(tx.entry.create).not.toHaveBeenCalled();
  });

  it("Trage-Kontrolle → WEAR_END auf dem getragenen Gerät, kein Öffnen", async () => {
    tx.kontrollAnforderung.findUnique.mockResolvedValue({ ...baseRow, categoryId: "cat-plug" });
    prepareWearMock.mockResolvedValue({ ok: true, categoryId: "cat-plug" });
    tx.entry.create.mockResolvedValue({ id: "e-wear-end" });

    const r = await autoMarkInspectionRemoved({ id: "ka1", userId: "u1" });

    expect(r.skipped).toBe(false);
    expect(createOeffnenMock).not.toHaveBeenCalled();
    expect(tx.entry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "WEAR_END", deviceId: "plug-1", source: "system" }) }),
    );
    // Die Zeile trägt das Vergehen (autoMarkedRemovedAt) — daraus leitet das Strafbuch es ab.
    expect(tx.kontrollAnforderung.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autoMarkedEntryId: "e-wear-end" }) }),
    );
  });

  it("Trage-Kontrolle, aber nichts mehr getragen → nur zurückziehen, kein Eintrag", async () => {
    // Der Sub hat selbst abgelegt, ohne je zu antworten. Nichts zu markieren; die Zeile muss aber
    // aus der Fällig-Abfrage fallen, sonst prüft der Poller sie für immer weiter.
    tx.kontrollAnforderung.findUnique.mockResolvedValue({ ...baseRow, categoryId: "cat-plug" });
    wearMock.mockResolvedValue(null);

    const r = await autoMarkInspectionRemoved({ id: "ka1", userId: "u1" });

    expect(r.skipped).toBe(true);
    expect(tx.entry.create).not.toHaveBeenCalled();
    expect(tx.kontrollAnforderung.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ withdrawnAt: expect.any(Date) }) }),
    );
  });
});
