import { describe, it, expect } from "vitest";
import { applyDeadlineFallback } from "./deadlineChannels";
import { isDeadlineMessage } from "./messageCategories";

describe("isDeadlineMessage", () => {
  it("Anforderungen, Mahnungen, Aufgaben und ÄNDERUNGEN einer Frist haben eine Frist", () => {
    for (const k of ["inspectionRequestedMessage", "inspectionReminderMessage", "lockRequestBody", "lockPeriodSetBody",
      "lockPeriodChangedMessage", "lockRequestChangedMessage", "orgasmAnweisungIntro", "taskAssignedMessage",
      "taskChangedMessage", "penaltyTaskMessage", "taskProofReminderMessage"]) {
      expect(isDeadlineMessage(k), k).toBe(true);
    }
  });

  it("Erlaubnisse, Urteile und Keyholder-Meldungen nicht — auch kein unbekannter oder Prototyp-Schlüssel", () => {
    for (const k of ["orgasmGelegenheitIntro", "penaltyMessage", "offenseDetectedMessage", "taskDoneMessageKeyholder",
      "lockPeriodWithdrawnMessage", "unbekannt", "toString", "constructor"]) {
      expect(isDeadlineMessage(k), k).toBe(false);
    }
  });
});

const ch = (mail: boolean, push: boolean, telegram: boolean) => ({ mail, push, telegram });

describe("applyDeadlineFallback", () => {
  it("lässt die Wahl stehen, solange ein gewählter Kanal den Empfänger erreicht", () => {
    expect(applyDeadlineFallback(ch(false, true, false), ch(true, true, true))).toEqual(ch(false, true, false));
  });

  it("Vorfall 11.09.2026: Mail und Push aus, Telegram gewählt aber blockiert → alle erreichbaren Kanäle", () => {
    expect(applyDeadlineFallback(ch(false, false, true), ch(true, true, false))).toEqual(ch(true, true, false));
  });

  it("alles aus → jeder erreichbare Kanal", () => {
    expect(applyDeadlineFallback(ch(false, false, false), ch(true, false, false))).toEqual(ch(true, false, false));
  });

  it("gewählter Kanal nicht eingerichtet (Mail ohne Adresse) → Rückfall auf den erreichbaren", () => {
    expect(applyDeadlineFallback(ch(true, false, false), ch(false, true, false))).toEqual(ch(false, true, false));
  });

  it("gar nichts erreichbar → die Wahl bleibt, es gibt keinen Rückfall", () => {
    expect(applyDeadlineFallback(ch(false, false, true), ch(false, false, false))).toEqual(ch(false, false, true));
  });
});
