-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "purchasePrice" REAL,
    "currency" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    "securityLevel" TEXT,
    "lookalikeClusterId" TEXT,
    "pullOffRisk" BOOLEAN,
    "material" TEXT,
    "bauform" TEXT,
    "healthFlags" TEXT,
    "retentionNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("archivedAt", "bauform", "categoryId", "createdAt", "currency", "description", "healthFlags", "id", "imageUrl", "lookalikeClusterId", "material", "name", "pullOffRisk", "purchasePrice", "retentionNotes", "securityLevel", "userId", "version") SELECT "archivedAt", "bauform", "categoryId", "createdAt", "currency", "description", "healthFlags", "id", "imageUrl", "lookalikeClusterId", "material", "name", "pullOffRisk", "purchasePrice", "retentionNotes", "securityLevel", "userId", "version" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE INDEX "Device_userId_archivedAt_idx" ON "Device"("userId", "archivedAt");
CREATE INDEX "Device_categoryId_idx" ON "Device"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

