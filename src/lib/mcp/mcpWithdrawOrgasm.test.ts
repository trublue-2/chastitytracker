import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * REGRESSION: der Rückzug einer TERMINIERTEN Orgasmus-Anweisung wurde als „ausgelöst, der Träger
 * wurde benachrichtigt" gemeldet.
 *
 * Die Stelle trug die Begründung „Orgasmus-Anweisungen kennen kein `wirksamAb` (nicht terminierbar)"
 * und setzte die beiden Sichtbarkeits-Felder deshalb fest auf `null`. Terminierbar sind sie aber
 * längst (`request_orgasm` kennt `delayMinutes`/`scheduledAt`), und der Dienst behandelt sie auch so
 * — er unterdrückt die Meldung an den Träger. Nur der BERICHT an die KI log: sie zog eine Anweisung
 * zurück, die der Träger nie gesehen hatte, und las danach, er sei benachrichtigt worden. Genau die
 * Falschauskunft, gegen die `withdrawnItems` nach dem Vorfall 28.07.2026 gebaut wurde.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/orgasmusAnforderungService", () => ({
  createOrgasmusAnforderung: vi.fn(),
  withdrawOrgasmusAnforderung: vi.fn(),
  withdrawOrgasmusAnforderungById: vi.fn(),
}));

import { mcpWithdraw } from "./mcpWrite";
import { prisma } from "@/lib/prisma";
import { withdrawOrgasmusAnforderung } from "@/lib/orgasmusAnforderungService";

const userFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const withdrawMock = withdrawOrgasmusAnforderung as unknown as ReturnType<typeof vi.fn>;

const MORGEN = new Date(Date.now() + 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  userFind.mockResolvedValue({ id: "u1", timezone: "Europe/Zurich" });
});

describe("withdraw target=orgasm_directive", () => {
  it("eine noch nicht ausgelöste Anweisung gilt als geplant — nicht als zugestellt", async () => {
    withdrawMock.mockResolvedValue({
      ok: true,
      data: { count: 1, rows: [{ id: "o1", endsAt: MORGEN, message: null, wirksamAb: MORGEN, benachrichtigtAt: null }] },
    });

    const res = await mcpWithdraw("sub", { target: "orgasm_directive" }) as {
      hidden: number; withdrawnItems: { status: string }[];
    };

    expect(res.withdrawnItems[0].status).toBe("scheduled");
    // Und der Zähler sagt dasselbe wie die Zeile — er ist der Grund, aus dem es das Feld gibt.
    expect(res.hidden).toBe(1);
  });

  it("eine ausgelöste meldet sich unverändert als zugestellt", async () => {
    withdrawMock.mockResolvedValue({
      ok: true,
      data: { count: 1, rows: [{ id: "o1", endsAt: MORGEN, message: null, wirksamAb: null, benachrichtigtAt: new Date() }] },
    });

    const res = await mcpWithdraw("sub", { target: "orgasm_directive" }) as {
      hidden: number; withdrawnItems: { status: string }[];
    };

    expect(res.withdrawnItems[0].status).toBe("triggered");
    expect(res.hidden).toBe(0);
  });
});
