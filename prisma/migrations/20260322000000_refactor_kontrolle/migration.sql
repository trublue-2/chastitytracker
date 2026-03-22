-- RefactorKontrolle: Replace aiVerified+date-fields with verifikationStatus FK

-- 1. Recreate Entry with verifikationStatus instead of aiVerified
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VERSCHLUSS',
    "startTime" DATETIME NOT NULL,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "note" TEXT,
    "oeffnenGrund" TEXT,
    "orgasmusArt" TEXT,
    "kontrollCode" TEXT,
    "verifikationStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Entry"
    SELECT id, userId, type, startTime, imageUrl, imageExifTime, note, oeffnenGrund, orgasmusArt, kontrollCode,
           CASE WHEN "aiVerified" = 1 THEN 'ai' ELSE NULL END,
           createdAt
    FROM "Entry";

DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
CREATE INDEX "Entry_userId_type_idx" ON "Entry"("userId", "type");

-- 2. Add entryId column to KontrollAnforderung
ALTER TABLE "KontrollAnforderung" ADD COLUMN "entryId" TEXT;

-- 3. Link KontrollAnforderung to Entry via code (best match)
UPDATE "KontrollAnforderung"
SET "entryId" = (
    SELECT e.id FROM "Entry" e
    WHERE e.kontrollCode = "KontrollAnforderung"."code"
      AND e.userId = "KontrollAnforderung"."userId"
      AND e.type = 'PRUEFUNG'
    ORDER BY e.startTime DESC LIMIT 1
)
WHERE "fulfilledAt" IS NOT NULL;

-- 4. Promote manuallyVerified → entry.verifikationStatus = 'manual'
UPDATE "Entry" SET "verifikationStatus" = 'manual'
WHERE id IN (
    SELECT entryId FROM "KontrollAnforderung"
    WHERE manuallyVerifiedAt IS NOT NULL AND entryId IS NOT NULL
);

-- 5. Promote rejected → entry.verifikationStatus = 'rejected'
UPDATE "Entry" SET "verifikationStatus" = 'rejected'
WHERE id IN (
    SELECT entryId FROM "KontrollAnforderung"
    WHERE rejectedAt IS NOT NULL AND entryId IS NOT NULL
);

-- 6. Recreate KontrollAnforderung without fulfilledAt/manuallyVerifiedAt/rejectedAt
CREATE TABLE "new_KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kommentar" TEXT,
    "deadline" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" DATETIME,
    "entryId" TEXT,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_KontrollAnforderung"
    SELECT id, userId, code, kommentar, deadline, createdAt, withdrawnAt, entryId
    FROM "KontrollAnforderung";

DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
