import { describe, it, expect } from "vitest";
import { applyDeadlineFallback } from "./deliveryChannels";
import { channelsForLevels, levelDelivers } from "./constants";
import { messagePriority } from "./messageCategories";

const ch = (mail: boolean, push: boolean, telegram: boolean) => ({ mail, push, telegram });

describe("levelDelivers", () => {
  it("Stufe all liefert jede Dringlichkeit, Stufe off keine", () => {
    for (const p of ["deadline", "important", "info"] as const) {
      expect(levelDelivers("all", p), p).toBe(true);
      expect(levelDelivers("off", p), p).toBe(false);
    }
  });

  it("Stufe important liefert Fristen und Wichtiges, keinen Alltag", () => {
    expect(levelDelivers("important", "deadline")).toBe(true);
    expect(levelDelivers("important", "important")).toBe(true);
    expect(levelDelivers("important", "info")).toBe(false);
  });
});

describe("channelsForLevels", () => {
  it("je Kanal eine eigene Stufe", () => {
    const levels = { notifyMail: "important", notifyPush: "all", notifyTelegram: "off" };
    expect(channelsForLevels(levels, "info")).toEqual(ch(false, true, false));
    expect(channelsForLevels(levels, "important")).toEqual(ch(true, true, false));
  });

  it("ein unbekannter oder leerer Wert gilt als all — im Zweifel zustellen", () => {
    expect(channelsForLevels({ notifyMail: "", notifyPush: "quatsch", notifyTelegram: "all" }, "info"))
      .toEqual(ch(true, true, true));
  });
});

describe("applyDeadlineFallback", () => {
  it("lässt die Wahl stehen, solange ein gewählter Kanal den Empfänger erreicht", () => {
    expect(applyDeadlineFallback(ch(false, true, false), ch(true, true, true))).toEqual(ch(false, true, false));
  });

  it("Vorfall 11.09.2026: Mail und Push aus, Telegram gewählt aber blockiert, also alle erreichbaren Kanäle", () => {
    expect(applyDeadlineFallback(ch(false, false, true), ch(true, true, false))).toEqual(ch(true, true, false));
  });

  it("alles aus, also jeder erreichbare Kanal", () => {
    expect(applyDeadlineFallback(ch(false, false, false), ch(true, false, false))).toEqual(ch(true, false, false));
  });

  it("gewählter Kanal nicht eingerichtet (Mail ohne Adresse), also Rückfall auf den erreichbaren", () => {
    expect(applyDeadlineFallback(ch(true, false, false), ch(false, true, false))).toEqual(ch(false, true, false));
  });

  it("gar nichts erreichbar, dann bleibt die Wahl stehen", () => {
    expect(applyDeadlineFallback(ch(false, false, true), ch(false, false, false))).toEqual(ch(false, false, true));
  });
});

describe("messagePriority", () => {
  it("Anforderungen, Mahnungen, Aufgaben und Änderungen einer Frist sind Fristen", () => {
    for (const k of ["inspectionRequestedMessage", "inspectionReminderMessage", "lockRequestBody", "lockPeriodSetBody",
      "lockPeriodChangedMessage", "lockRequestChangedMessage", "orgasmAnweisungIntro", "taskAssignedMessage",
      "taskChangedMessage", "penaltyTaskMessage", "taskProofReminderMessage"]) {
      expect(messagePriority(k), k).toBe("deadline");
    }
  });

  it("Urteile, Vorwürfe und Handlungsbedarf der Keyholderin sind wichtig", () => {
    for (const k of ["penaltyMessage", "offenseDetectedMessage", "inspectionRejectedMessage", "orgasmGelegenheitIntro",
      "taskReviewMessageKeyholder", "taskProofLateMessageKeyholder", "offenseStatementMessage",
      "inspectionAutoRemovedMessageSub"]) {
      expect(messagePriority(k), k).toBe("important");
    }
  });

  it("Rückzüge, Bestätigungen und Gewichts-Meldungen sind Alltag", () => {
    for (const k of ["lockPeriodWithdrawnMessage", "taskWithdrawnMessage", "inspectionConfirmedMessage",
      "taskDoneMessage", "taskDoneMessageKeyholder", "weightTargetReachedMessageKeyholder"]) {
      expect(messagePriority(k), k).toBe("info");
    }
  });

  it("unbekannter oder Prototyp-Schlüssel gilt als wichtig, nie als Frist", () => {
    for (const k of ["unbekannt", "toString", "constructor"]) {
      expect(messagePriority(k), k).toBe("important");
    }
  });
});
