-- Rückläufer-Erkennung (src/lib/emailBounce.ts): Das Portal zählt endgültig fehlgeschlagene
-- Zustellungen je Adresse und sperrt sie ab der Schwelle für den Versand.
ALTER TABLE "User" ADD COLUMN "emailBounceCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "emailLastBounceAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "emailBlockedAt" DATETIME;
