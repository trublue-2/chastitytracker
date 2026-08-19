-- CreateTable
CREATE TABLE "CleaningRuleChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "maxMinutes" INTEGER NOT NULL,
    "maxPerDay" INTEGER NOT NULL,
    "windows" TEXT,
    "effectiveFrom" DATETIME NOT NULL,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CleaningRuleChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CleaningRuleChange_userId_effectiveFrom_idx" ON "CleaningRuleChange"("userId", "effectiveFrom");

