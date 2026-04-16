-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "purchasePrice" REAL,
    "currency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "deviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("createdAt", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "startTime", "type", "userId", "verifikationStatus") SELECT "createdAt", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "startTime", "type", "userId", "verifikationStatus" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
CREATE INDEX "Entry_userId_type_startTime_idx" ON "Entry"("userId", "type", "startTime" DESC);
CREATE TABLE "new_VerschlussAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "nachricht" TEXT,
    "endetAt" DATETIME,
    "dauerH" REAL,
    "deviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "withdrawnAt" DATETIME,
    CONSTRAINT "VerschlussAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerschlussAnforderung_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VerschlussAnforderung" ("art", "createdAt", "dauerH", "endetAt", "fulfilledAt", "id", "nachricht", "userId", "withdrawnAt") SELECT "art", "createdAt", "dauerH", "endetAt", "fulfilledAt", "id", "nachricht", "userId", "withdrawnAt" FROM "VerschlussAnforderung";
DROP TABLE "VerschlussAnforderung";
ALTER TABLE "new_VerschlussAnforderung" RENAME TO "VerschlussAnforderung";
CREATE INDEX "VerschlussAnforderung_userId_art_withdrawnAt_idx" ON "VerschlussAnforderung"("userId", "art", "withdrawnAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Device_userId_archivedAt_idx" ON "Device"("userId", "archivedAt");
