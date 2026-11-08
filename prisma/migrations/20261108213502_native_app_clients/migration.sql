-- CreateTable
CREATE TABLE "NativeAppClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "appBuild" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NativeAppClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NativeAppClient_lastSeenAt_idx" ON "NativeAppClient"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "NativeAppClient_userId_installId_key" ON "NativeAppClient"("userId", "installId");
