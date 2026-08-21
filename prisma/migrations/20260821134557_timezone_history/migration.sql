-- CreateTable
CREATE TABLE "TimezoneChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimezoneChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TimezoneChange_userId_effectiveFrom_idx" ON "TimezoneChange"("userId", "effectiveFrom");
