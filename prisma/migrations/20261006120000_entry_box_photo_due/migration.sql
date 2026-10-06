-- LockMeBox/Heimdall: das Box-Foto wird erst NACH „Riegel zu" fällig und nachgereicht.
ALTER TABLE "Entry" ADD COLUMN "boxPhotoDueAt" DATETIME;
ALTER TABLE "Entry" ADD COLUMN "boxPhotoWaivedAt" DATETIME;
ALTER TABLE "Entry" ADD COLUMN "boxImageBeforeBolt" BOOLEAN NOT NULL DEFAULT false;

-- Bereits erfasste Verschlüsse ohne Foto sind vor dieser Regel entstanden: ihnen wird nichts nachgefordert.
-- (Millisekunden-Ganzzahl wie jede von Prisma geschriebene Zeit.) Ohne das stellte der nächste „Riegel zu"-Sync für einen laufenden Verschluss nachträglich ein Foto fällig.
UPDATE "Entry" SET "boxPhotoWaivedAt" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "type" = 'VERSCHLUSS' AND "keyInBox" = 1 AND "boxImageUrl" IS NULL;
