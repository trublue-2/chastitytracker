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
    "requireInspectionCode" BOOLEAN NOT NULL DEFAULT true,
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
CREATE TABLE "new_KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT,
    "kommentar" TEXT,
    "deadline" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "withdrawnAt" DATETIME,
    "wirksamAb" DATETIME,
    "benachrichtigtAt" DATETIME,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "entryId" TEXT,
    "benachrichtigtReminderAt" DATETIME,
    "autoMarkedRemovedAt" DATETIME,
    "autoMarkedEntryId" TEXT,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_autoMarkedEntryId_fkey" FOREIGN KEY ("autoMarkedEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KontrollAnforderung" ("auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt") SELECT "auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt" FROM "KontrollAnforderung";
DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
CREATE UNIQUE INDEX "KontrollAnforderung_autoMarkedEntryId_key" ON "KontrollAnforderung"("autoMarkedEntryId");
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
CREATE INDEX "KontrollAnforderung_userId_autoMarkedRemovedAt_idx" ON "KontrollAnforderung"("userId", "autoMarkedRemovedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
