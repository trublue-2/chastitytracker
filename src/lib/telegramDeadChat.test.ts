import { describe, it, expect } from "vitest";
import { isDeadChatResponse } from "./telegram";

/** Welche Antworten der Bot-API eine Verbindung endgültig trennen — und welche nicht. Eine zu weite
 *  Regel löste funktionierende Chats bei einem Aussetzer; eine zu enge liesse wie bis v6.2.1 einen
 *  blockierten Bot für immer als „verbunden" stehen. */
describe("isDeadChatResponse", () => {
  it("Bot blockiert, Konto gelöscht, Bot entfernt → tot", () => {
    expect(isDeadChatResponse(403, '{"ok":false,"error_code":403,"description":"Forbidden: bot was blocked by the user"}')).toBe(true);
    expect(isDeadChatResponse(403, "Forbidden: user is deactivated")).toBe(true);
    expect(isDeadChatResponse(403, "Forbidden: bot was kicked from the group chat")).toBe(true);
  });

  it("vorübergehende oder andere Fehler → Verbindung bleibt", () => {
    expect(isDeadChatResponse(429, "Too Many Requests: retry after 5")).toBe(false);
    expect(isDeadChatResponse(400, "Bad Request: chat not found")).toBe(false);
    expect(isDeadChatResponse(500, "Internal Server Error")).toBe(false);
    expect(isDeadChatResponse(403, "Forbidden: bot can't initiate conversation with a user")).toBe(false);
  });
});
