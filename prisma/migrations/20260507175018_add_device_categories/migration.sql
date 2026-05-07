-- CreateTable
CREATE TABLE "DeviceCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Device_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("archivedAt", "createdAt", "currency", "description", "id", "imageUrl", "name", "purchasePrice", "userId") SELECT "archivedAt", "createdAt", "currency", "description", "id", "imageUrl", "name", "purchasePrice", "userId" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
CREATE INDEX "Device_userId_archivedAt_idx" ON "Device"("userId", "archivedAt");
CREATE INDEX "Device_categoryId_idx" ON "Device"("categoryId");
CREATE TABLE "new_TrainingVorgabe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "gueltigAb" DATETIME NOT NULL,
    "gueltigBis" DATETIME,
    "minProTagH" REAL,
    "minProWocheH" REAL,
    "minProMonatH" REAL,
    "notiz" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingVorgabe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingVorgabe_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TrainingVorgabe" ("createdAt", "gueltigAb", "gueltigBis", "id", "minProMonatH", "minProTagH", "minProWocheH", "notiz", "userId") SELECT "createdAt", "gueltigAb", "gueltigBis", "id", "minProMonatH", "minProTagH", "minProWocheH", "notiz", "userId" FROM "TrainingVorgabe";
DROP TABLE "TrainingVorgabe";
ALTER TABLE "new_TrainingVorgabe" RENAME TO "TrainingVorgabe";
CREATE INDEX "TrainingVorgabe_userId_idx" ON "TrainingVorgabe"("userId");
CREATE INDEX "TrainingVorgabe_categoryId_idx" ON "TrainingVorgabe"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DeviceCategory_userId_idx" ON "DeviceCategory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCategory_userId_slug_key" ON "DeviceCategory"("userId", "slug");

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: seed one KG built-in DeviceCategory per existing User and link
-- existing Devices + TrainingVorgaben to it. Idempotent via unique slug.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO "DeviceCategory" ("id", "userId", "name", "slug", "color", "icon", "isBuiltIn", "trackingEnabled", "sortOrder", "createdAt")
SELECT
  'kgcat_' || "id",
  "id",
  'KG',
  'kg',
  'cat-steel',
  'Lock',
  1,
  1,
  0,
  CURRENT_TIMESTAMP
FROM "User"
WHERE NOT EXISTS (
  SELECT 1 FROM "DeviceCategory" dc WHERE dc."userId" = "User"."id" AND dc."slug" = 'kg'
);

UPDATE "Device"
SET "categoryId" = 'kgcat_' || "userId"
WHERE "categoryId" IS NULL;

UPDATE "TrainingVorgabe"
SET "categoryId" = 'kgcat_' || "userId"
WHERE "categoryId" IS NULL;
