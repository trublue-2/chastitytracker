-- CreateTable
CREATE TABLE "BoxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "wakeReason" TEXT,
    "battery" INTEGER,
    "fwVersion" TEXT,
    "at" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoxEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BoxEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BoxEvent_userId_at_idx" ON "BoxEvent"("userId", "at");
