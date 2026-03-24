-- AlterTable
ALTER TABLE "KontrollAnforderung" ADD COLUMN "fulfilledAt" DATETIME;

-- Backfill: bestehende erfüllte Kontrollen mit Entry.createdAt befüllen
UPDATE "KontrollAnforderung"
SET "fulfilledAt" = (
  SELECT e."createdAt"
  FROM "Entry" e
  WHERE e."id" = "KontrollAnforderung"."entryId"
)
WHERE "entryId" IS NOT NULL AND "fulfilledAt" IS NULL;
