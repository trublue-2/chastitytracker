import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `lockAwaitsBolt` — die Entscheidung, ob ein neuer Verschluss auf den Riegel wartet
 * (docs/riegel-konzept.md).
 *
 * Gepinnt werden die vier Ausstiege, denn jeder von ihnen ist ein Fall, in dem NIE eine Meldung
 * käme: der Eintrag hinge dann für immer, und der Träger wäre dauerhaft nicht verschlossen, obwohl
 * er alles richtig gemacht hat.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { lockAwaitsBolt } from "./lockCommit";

type BoxRow = { locked: boolean; reportedLocked: boolean | null; lastSyncAt: Date | null };

/** Ein Prisma-Stub in der Rolle des Transaktions-Clients — mehr liest die Funktion nicht. */
const db = (opts: { requiresBolt: boolean; boxes: BoxRow[] }) =>
  ({
    user: { findUnique: vi.fn().mockResolvedValue({ lockRequiresBolt: opts.requiresBolt }) },
    boxStatus: { findMany: vi.fn().mockResolvedValue(opts.boxes) },
  }) as unknown as Parameters<typeof lockAwaitsBolt>[0];

const NOW = new Date("2026-08-30T12:00:00Z");
/** Vor einer Minute gesynct — innerhalb der Frische-Schwelle von zwei Minuten. */
const FRISCH = new Date("2026-08-30T11:59:00Z");
/** Vor zwei Stunden gesynct — ihr „zu" stammt aus einer Zeit vor dem Öffnen. */
const ALT = new Date("2026-08-30T10:00:00Z");

const ENV_VORHER = process.env.HEIMDALL_SYNC_SECRET;
beforeEach(() => { process.env.HEIMDALL_SYNC_SECRET = "s3cret"; });
afterEach(() => {
  if (ENV_VORHER === undefined) delete process.env.HEIMDALL_SYNC_SECRET;
  else process.env.HEIMDALL_SYNC_SECRET = ENV_VORHER;
});

describe("lockAwaitsBolt", () => {
  it("wartet, wenn der Schalter an ist und eine offene Box gemeldet hat", async () => {
    const tx = db({ requiresBolt: true, boxes: [{ locked: false, reportedLocked: false, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(true);
  });

  it("wartet nicht ohne Heimdall — es gäbe niemanden, der den Riegel meldet", async () => {
    delete process.env.HEIMDALL_SYNC_SECRET;
    const tx = db({ requiresBolt: true, boxes: [{ locked: false, reportedLocked: false, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(false);
  });

  it("wartet nicht, solange die Keyholderin den Schalter nicht umgelegt hat", async () => {
    const tx = db({ requiresBolt: false, boxes: [{ locked: false, reportedLocked: false, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(false);
  });

  it("wartet nicht im Reisefall — die Box bekommt gar kein Kommando", async () => {
    const tx = db({ requiresBolt: true, boxes: [{ locked: false, reportedLocked: false, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", false, NOW)).toBe(false);
  });

  it("wartet nicht ohne registrierte Box", async () => {
    const tx = db({ requiresBolt: true, boxes: [] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(false);
  });

  it("wartet nicht, wenn eine FRISCHE Box den Riegel schon zu meldet", async () => {
    // Sonst käme nie ein neues Ereignis und der Aufruf hinge, obwohl alles stimmt.
    const tx = db({ requiresBolt: true, boxes: [{ locked: true, reportedLocked: true, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(false);
  });

  it("wartet trotzdem, wenn dieselbe Meldung ALT ist", async () => {
    // „Zu" von vor zwei Stunden sagt nichts über jetzt — dazwischen liegt die Öffnung.
    const tx = db({ requiresBolt: true, boxes: [{ locked: true, reportedLocked: true, lastSyncAt: ALT }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(true);
  });

  it("wartet bei einer Zeile OHNE IST-Meldung, auch wenn das SOLL „zu\" sagt", async () => {
    // Der Grund, warum hier bewusst NICHT `boxIsPhysicallyLocked` steht: es fiele auf das SOLL
    // zurück, und das SOLL ist die ABSICHT — genau das, was diese Regel nicht mehr glauben will.
    // Der Spiegel hinkt zudem hinter einer Öffnung her; ein Aufruf gälte sonst unmittelbar nach
    // einer Reinigungsöffnung als vollzogen, ohne dass je ein Riegel zufiel.
    const tx = db({ requiresBolt: true, boxes: [{ locked: true, reportedLocked: null, lastSyncAt: FRISCH }] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(true);
  });

  it("bei mehreren Boxen genügt EINE frische Riegel-Meldung", async () => {
    const tx = db({ requiresBolt: true, boxes: [
      { locked: false, reportedLocked: false, lastSyncAt: FRISCH },
      { locked: true, reportedLocked: true, lastSyncAt: FRISCH },
    ] });
    expect(await lockAwaitsBolt(tx, "u1", true, NOW)).toBe(false);
  });
});
