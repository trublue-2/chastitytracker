-- CreateTable
CREATE TABLE "BoxStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockUntil" DATETIME,
    "simpleLock" BOOLEAN NOT NULL DEFAULT false,
    "keyholderLocked" BOOLEAN NOT NULL DEFAULT false,
    "battery" INTEGER,
    "charging" BOOLEAN,
    "boltPos" TEXT,
    "fwVersion" TEXT,
    "lastSyncAt" DATETIME,
    "pendingCommand" TEXT,
    "pendingCommandRelockBy" DATETIME,
    "pendingCommandAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoxStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BoxStatus_userId_boxId_key" ON "BoxStatus"("userId", "boxId");
CREATE INDEX "BoxStatus_userId_idx" ON "BoxStatus"("userId");
