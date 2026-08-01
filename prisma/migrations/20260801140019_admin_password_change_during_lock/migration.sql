-- CreateTable
CREATE TABLE "AdminPasswordChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subUserId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "actorUserId" TEXT,
    "sperrzeitId" TEXT,
    "sperrzeitEndetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminPasswordChange_subUserId_fkey" FOREIGN KEY ("subUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AdminPasswordChange_subUserId_createdAt_idx" ON "AdminPasswordChange"("subUserId", "createdAt");
