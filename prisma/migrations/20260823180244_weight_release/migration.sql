-- CreateTable
CREATE TABLE "WeightRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "thresholdKg" REAL NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'below',
    "averageDays" INTEGER NOT NULL DEFAULT 3,
    "minMeasurements" INTEGER NOT NULL DEFAULT 2,
    "stepKg" REAL NOT NULL DEFAULT 0,
    "notBeforeAt" DATETIME NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "openingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "armedAt" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "releasedRequestId" TEXT,
    "withdrawnAt" DATETIME,
    CONSTRAINT "WeightRelease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WeightRelease_userId_releasedAt_withdrawnAt_idx" ON "WeightRelease"("userId", "releasedAt", "withdrawnAt");
