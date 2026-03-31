-- CreateTable
CREATE TABLE "StrafeRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "offenseType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "bestraftDatum" DATETIME NOT NULL,
    "notiz" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrafeRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StrafeRecord_refId_key" ON "StrafeRecord"("refId");

-- CreateIndex
CREATE INDEX "StrafeRecord_userId_idx" ON "StrafeRecord"("userId");
