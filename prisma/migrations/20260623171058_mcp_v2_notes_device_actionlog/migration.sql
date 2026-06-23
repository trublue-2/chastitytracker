-- CreateTable
CREATE TABLE "KeyholderActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "actor" TEXT,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "argsJson" TEXT,
    "resultRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyholderActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteRef_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "KeyholderNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "abstreifbar" BOOLEAN NOT NULL DEFAULT false,
    "material" TEXT,
    "bauform" TEXT,
    "healthFlags" TEXT,
    "retentionNotes" TEXT,
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("archivedAt", "categoryId", "createdAt", "currency", "description", "id", "imageUrl", "name", "purchasePrice", "userId") SELECT "archivedAt", "categoryId", "createdAt", "currency", "description", "id", "imageUrl", "name", "purchasePrice", "userId" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE INDEX "Device_userId_archivedAt_idx" ON "Device"("userId", "archivedAt");
CREATE INDEX "Device_categoryId_idx" ON "Device"("categoryId");
CREATE TABLE "new_KeyholderNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kg" TEXT,
    "kategorie" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL DEFAULT 'OBSERVATION',
    "status" TEXT NOT NULL DEFAULT 'active',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "supersedesId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'inferred',
    "confidence" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "doDont" TEXT,
    CONSTRAINT "KeyholderNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_KeyholderNote" ("createdAt", "id", "kategorie", "kg", "text", "userId") SELECT "createdAt", "id", "kategorie", "kg", "text", "userId" FROM "KeyholderNote";
DROP TABLE "KeyholderNote";
ALTER TABLE "new_KeyholderNote" RENAME TO "KeyholderNote";
CREATE INDEX "KeyholderNote_userId_createdAt_idx" ON "KeyholderNote"("userId", "createdAt");
CREATE INDEX "KeyholderNote_userId_status_pinned_idx" ON "KeyholderNote"("userId", "status", "pinned");
CREATE INDEX "KeyholderNote_supersedesId_idx" ON "KeyholderNote"("supersedesId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "KeyholderActionLog_userId_createdAt_idx" ON "KeyholderActionLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NoteRef_entityType_entityId_idx" ON "NoteRef"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "NoteRef_noteId_idx" ON "NoteRef"("noteId");
