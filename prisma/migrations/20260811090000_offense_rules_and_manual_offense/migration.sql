-- CreateTable
CREATE TABLE "ManualOffense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" DATETIME,
    CONSTRAINT "ManualOffense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OffenseRuleChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "offenseType" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "changedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OffenseRuleChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ManualOffense_userId_occurredAt_idx" ON "ManualOffense"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "OffenseRuleChange_userId_offenseType_effectiveFrom_idx" ON "OffenseRuleChange"("userId", "offenseType", "effectiveFrom");

