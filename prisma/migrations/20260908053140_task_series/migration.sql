-- CreateTable
CREATE TABLE "TaskSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "holdDurationMin" INTEGER,
    "holdWindowMin" INTEGER,
    "startGraceMin" INTEGER NOT NULL DEFAULT 30,
    "proofOrderMatters" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "freq" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdayMask" INTEGER,
    "ordinal" INTEGER,
    "timeOfDay" TEXT NOT NULL,
    "startsOn" DATETIME NOT NULL,
    "until" DATETIME,
    "exclusionDates" TEXT,
    "lastMaterializedOccurrence" DATETIME,
    "deletedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskSeriesRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categoryId" TEXT,
    "deviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskSeriesRequirement_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskSeriesRequirement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskSeriesRequirement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskSeriesProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT true,
    "requiresText" BOOLEAN NOT NULL DEFAULT false,
    "requireCode" BOOLEAN NOT NULL DEFAULT false,
    "dueOffsetMin" INTEGER,
    CONSTRAINT "TaskSeriesProof_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "holdUntil" DATETIME NOT NULL,
    "startGraceMin" INTEGER NOT NULL DEFAULT 30,
    "holdDurationMin" INTEGER,
    "proofOrderMatters" BOOLEAN NOT NULL DEFAULT true,
    "isPunishment" BOOLEAN NOT NULL DEFAULT false,
    "penaltyReason" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wirksamAb" DATETIME,
    "benachrichtigtAt" DATETIME,
    "completedAt" DATETIME,
    "completionNote" TEXT,
    "withdrawnAt" DATETIME,
    "resultNotifiedAt" DATETIME,
    "seriesId" TEXT,
    "seriesOccurrence" DATETIME,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("benachrichtigtAt", "completedAt", "completionNote", "createdAt", "createdBy", "description", "holdDurationMin", "holdUntil", "id", "isPunishment", "penaltyReason", "proofOrderMatters", "resultNotifiedAt", "startGraceMin", "title", "userId", "wirksamAb", "withdrawnAt") SELECT "benachrichtigtAt", "completedAt", "completionNote", "createdAt", "createdBy", "description", "holdDurationMin", "holdUntil", "id", "isPunishment", "penaltyReason", "proofOrderMatters", "resultNotifiedAt", "startGraceMin", "title", "userId", "wirksamAb", "withdrawnAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_userId_withdrawnAt_completedAt_idx" ON "Task"("userId", "withdrawnAt", "completedAt");
CREATE INDEX "Task_userId_holdUntil_idx" ON "Task"("userId", "holdUntil");
CREATE INDEX "Task_resultNotifiedAt_holdUntil_idx" ON "Task"("resultNotifiedAt", "holdUntil");
CREATE INDEX "Task_benachrichtigtAt_wirksamAb_idx" ON "Task"("benachrichtigtAt", "wirksamAb");
CREATE UNIQUE INDEX "Task_seriesId_seriesOccurrence_key" ON "Task"("seriesId", "seriesOccurrence");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TaskSeries_userId_deletedAt_idx" ON "TaskSeries"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "TaskSeriesRequirement_seriesId_idx" ON "TaskSeriesRequirement"("seriesId");

-- CreateIndex
CREATE INDEX "TaskSeriesRequirement_categoryId_idx" ON "TaskSeriesRequirement"("categoryId");

-- CreateIndex
CREATE INDEX "TaskSeriesRequirement_deviceId_idx" ON "TaskSeriesRequirement"("deviceId");

-- CreateIndex
CREATE INDEX "TaskSeriesProof_seriesId_sortOrder_idx" ON "TaskSeriesProof"("seriesId", "sortOrder");
