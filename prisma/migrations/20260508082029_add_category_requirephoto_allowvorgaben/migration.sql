-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeviceCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "requirePhoto" BOOLEAN NOT NULL DEFAULT false,
    "allowVorgaben" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeviceCategory" ("color", "createdAt", "icon", "id", "isBuiltIn", "name", "slug", "sortOrder", "trackingEnabled", "userId") SELECT "color", "createdAt", "icon", "id", "isBuiltIn", "name", "slug", "sortOrder", "trackingEnabled", "userId" FROM "DeviceCategory";
DROP TABLE "DeviceCategory";
ALTER TABLE "new_DeviceCategory" RENAME TO "DeviceCategory";
CREATE INDEX "DeviceCategory_userId_idx" ON "DeviceCategory"("userId");
CREATE UNIQUE INDEX "DeviceCategory_userId_slug_key" ON "DeviceCategory"("userId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
