-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientRequestId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VERSCHLUSS',
    "startTime" DATETIME NOT NULL,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "codeImageUrl" TEXT,
    "codeReadable" BOOLEAN,
    "keyInBox" BOOLEAN,
    "boxImageUrl" TEXT,
    "keyDetected" BOOLEAN,
    "boltConfirmedAt" DATETIME,
    "note" TEXT,
    "oeffnenGrund" TEXT,
    "orgasmusArt" TEXT,
    "kontrollCode" TEXT,
    "verifikationStatus" TEXT,
    "verifikationReason" TEXT,
    "verifikationReasonDetected" TEXT,
    "deviceCheck" TEXT,
    "deviceCheckNote" TEXT,
    "deviceCheckExpected" TEXT,
    "deviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'user',
    "capturedOffline" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("boltConfirmedAt", "boxImageUrl", "clientRequestId", "codeImageUrl", "codeReadable", "createdAt", "deviceCheck", "deviceCheckExpected", "deviceCheckNote", "deviceId", "id", "imageExifTime", "imageUrl", "keyDetected", "keyInBox", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "source", "startTime", "type", "userId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus") SELECT "boltConfirmedAt", "boxImageUrl", "clientRequestId", "codeImageUrl", "codeReadable", "createdAt", "deviceCheck", "deviceCheckExpected", "deviceCheckNote", "deviceId", "id", "imageExifTime", "imageUrl", "keyDetected", "keyInBox", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "source", "startTime", "type", "userId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
CREATE INDEX "Entry_userId_type_startTime_idx" ON "Entry"("userId", "type", "startTime" DESC);
CREATE INDEX "Entry_userId_type_boltConfirmedAt_idx" ON "Entry"("userId", "type", "boltConfirmedAt");
CREATE UNIQUE INDEX "Entry_userId_clientRequestId_key" ON "Entry"("userId", "clientRequestId");
CREATE TABLE "new_WeightEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "measuredAt" DATETIME NOT NULL,
    "dayKey" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "inWindow" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "imagePrunedAt" DATETIME,
    "detectedKg" REAL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'user',
    "capturedOffline" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WeightEntry" ("createdAt", "createdById", "dayKey", "detectedKg", "id", "imageExifTime", "imagePrunedAt", "imageUrl", "inWindow", "measuredAt", "note", "source", "userId", "version", "weightKg") SELECT "createdAt", "createdById", "dayKey", "detectedKg", "id", "imageExifTime", "imagePrunedAt", "imageUrl", "inWindow", "measuredAt", "note", "source", "userId", "version", "weightKg" FROM "WeightEntry";
DROP TABLE "WeightEntry";
ALTER TABLE "new_WeightEntry" RENAME TO "WeightEntry";
CREATE INDEX "WeightEntry_userId_measuredAt_idx" ON "WeightEntry"("userId", "measuredAt");
CREATE UNIQUE INDEX "WeightEntry_userId_dayKey_key" ON "WeightEntry"("userId", "dayKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
