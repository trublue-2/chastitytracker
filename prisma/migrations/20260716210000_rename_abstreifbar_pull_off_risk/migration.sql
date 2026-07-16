-- A1: Feld-Polarität war aus Name+Beschreibung nicht ableitbar ("abstreifbar" vs. "Anti-Auszieh-Status").
-- Entschieden: true = Gerät lässt sich trotz Verschluss abstreifen (unsicher). Englischer Name gemäss
-- Namenskonvention für Schema-Änderungen.
-- AlterTable
ALTER TABLE "Device" RENAME COLUMN "abstreifbar" TO "pullOffRisk";
