-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT,
    "categoryId" TEXT,
    "deviceId" TEXT,
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
    "cleaningRelock" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_autoMarkedEntryId_fkey" FOREIGN KEY ("autoMarkedEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KontrollAnforderung" ("auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "cleaningRelock", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt") SELECT "auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "cleaningRelock", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt" FROM "KontrollAnforderung";
DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
CREATE UNIQUE INDEX "KontrollAnforderung_autoMarkedEntryId_key" ON "KontrollAnforderung"("autoMarkedEntryId");
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
CREATE INDEX "KontrollAnforderung_userId_autoMarkedRemovedAt_idx" ON "KontrollAnforderung"("userId", "autoMarkedRemovedAt");
CREATE INDEX "KontrollAnforderung_userId_categoryId_idx" ON "KontrollAnforderung"("userId", "categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
