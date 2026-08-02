-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StrafeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "offenseType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "bestraftDatum" DATETIME NOT NULL,
    "notiz" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUNISHED',
    "reason" TEXT,
    "judgedBy" TEXT,
    "erledigtAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    CONSTRAINT "StrafeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StrafeRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StrafeRecord" ("bestraftDatum", "createdAt", "erledigtAt", "id", "judgedBy", "notiz", "offenseType", "reason", "refId", "status", "userId") SELECT "bestraftDatum", "createdAt", "erledigtAt", "id", "judgedBy", "notiz", "offenseType", "reason", "refId", "status", "userId" FROM "StrafeRecord";
DROP TABLE "StrafeRecord";
ALTER TABLE "new_StrafeRecord" RENAME TO "StrafeRecord";
CREATE UNIQUE INDEX "StrafeRecord_refId_key" ON "StrafeRecord"("refId");
CREATE INDEX "StrafeRecord_userId_idx" ON "StrafeRecord"("userId");
CREATE INDEX "StrafeRecord_taskId_idx" ON "StrafeRecord"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
