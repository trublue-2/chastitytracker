-- DropIndex
DROP INDEX "Entry_userId_type_idx";

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminUserRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminUserRelationship_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdminUserRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdminUserRelationship" ("adminId", "createdAt", "id", "userId") SELECT "adminId", "createdAt", "id", "userId" FROM "AdminUserRelationship";
DROP TABLE "AdminUserRelationship";
ALTER TABLE "new_AdminUserRelationship" RENAME TO "AdminUserRelationship";
CREATE INDEX "AdminUserRelationship_adminId_idx" ON "AdminUserRelationship"("adminId");
CREATE INDEX "AdminUserRelationship_userId_idx" ON "AdminUserRelationship"("userId");
CREATE UNIQUE INDEX "AdminUserRelationship_adminId_userId_key" ON "AdminUserRelationship"("adminId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Entry_userId_type_startTime_idx" ON "Entry"("userId", "type", "startTime" DESC);
