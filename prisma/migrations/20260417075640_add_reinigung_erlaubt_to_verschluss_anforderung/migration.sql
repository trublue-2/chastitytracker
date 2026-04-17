-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VerschlussAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "nachricht" TEXT,
    "endetAt" DATETIME,
    "dauerH" REAL,
    "deviceId" TEXT,
    "reinigungErlaubt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "withdrawnAt" DATETIME,
    CONSTRAINT "VerschlussAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerschlussAnforderung_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VerschlussAnforderung" ("art", "createdAt", "dauerH", "deviceId", "endetAt", "fulfilledAt", "id", "nachricht", "userId", "withdrawnAt") SELECT "art", "createdAt", "dauerH", "deviceId", "endetAt", "fulfilledAt", "id", "nachricht", "userId", "withdrawnAt" FROM "VerschlussAnforderung";
DROP TABLE "VerschlussAnforderung";
ALTER TABLE "new_VerschlussAnforderung" RENAME TO "VerschlussAnforderung";
CREATE INDEX "VerschlussAnforderung_userId_art_withdrawnAt_idx" ON "VerschlussAnforderung"("userId", "art", "withdrawnAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
