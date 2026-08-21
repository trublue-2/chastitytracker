/**
 * Wer geurteilt hat — der NAME am Urteil, nicht nur das Kürzel.
 *
 * Vorher faltete `judgedByFromActor` den Handelnden auf `admin` bzw. `ai` zusammen. Der Handelnde
 * lag dabei längst an: `judgeOffense(p, actor)` bekommt ihn, und die Meldungen im Posteingang tragen
 * seinen Namen seit jeher. Nur das Strafbuch konnte auf einer Instanz mit zwei Admins nicht sagen,
 * wer entschieden hat.
 *
 * Diese Tests halten die drei Fälle fest, in denen KEIN Name gespeichert wird — sie sind der Grund,
 * warum die Spalte zusätzlich zum Kürzel steht und nicht an seiner Stelle.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { judgmentAuthorColumns } from "./strafurteilService";
import { AI_AUTHOR } from "./constants";

describe("Urteils-Autor", () => {
  it("hält den Namen fest, wenn ein Mensch entscheidet", () => {
    expect(judgmentAuthorColumns("herrin")).toEqual({ judgedBy: "admin", judgedByName: "herrin" });
  });

  it("schreibt bei der KI keinen Namen — ihre Kennung steht schon im Kürzel", () => {
    // Beides zu setzen hiesse, die Anzeige müsste die Kennung wieder wegfiltern.
    expect(judgmentAuthorColumns(AI_AUTHOR)).toEqual({ judgedBy: AI_AUTHOR, judgedByName: null });
  });

  it("schreibt ohne Handelnden keinen Namen", () => {
    // Das ist die automatische Ahndung: dahinter steht niemand. `null` heisst hier nicht
    // „unbekannt", sondern „es gab keinen".
    expect(judgmentAuthorColumns(null)).toEqual({ judgedBy: "admin", judgedByName: null });
    expect(judgmentAuthorColumns(undefined)).toEqual({ judgedBy: "admin", judgedByName: null });
  });

  it("lässt das Kürzel unverändert — daran hängt die Unterscheidung KI/Mensch", () => {
    // Die Strafbuch-Optik und die MCP-Sicht rechnen auf `judgedBy`. Ein Umdeuten hätte beides
    // gebrochen und einen schemaVersion-Bump verlangt; deshalb kommt der Name DANEBEN.
    expect(judgmentAuthorColumns("herrin").judgedBy).toBe("admin");
    expect(judgmentAuthorColumns("ein anderer admin").judgedBy).toBe("admin");
  });
});
