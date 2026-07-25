-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "holdUntil" DATETIME NOT NULL,
    "startGraceMin" INTEGER NOT NULL DEFAULT 30,
    "isPunishment" BOOLEAN NOT NULL DEFAULT false,
    "penaltyReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "completionNote" TEXT,
    "withdrawnAt" DATETIME,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categoryId" TEXT,
    "deviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskRequirement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRequirement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TaskRequirement_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Task_userId_withdrawnAt_completedAt_idx" ON "Task"("userId", "withdrawnAt", "completedAt");

-- CreateIndex
CREATE INDEX "Task_userId_holdUntil_idx" ON "Task"("userId", "holdUntil");

-- CreateIndex
CREATE INDEX "TaskRequirement_taskId_idx" ON "TaskRequirement"("taskId");

-- CreateIndex
CREATE INDEX "TaskRequirement_categoryId_idx" ON "TaskRequirement"("categoryId");

-- CreateIndex
CREATE INDEX "TaskRequirement_deviceId_idx" ON "TaskRequirement"("deviceId");
