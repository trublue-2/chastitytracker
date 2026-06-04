-- CreateTable
CREATE TABLE "OrgasmusAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "nachricht" TEXT,
    "beginntAt" DATETIME NOT NULL,
    "endetAt" DATETIME NOT NULL,
    "vorgegebeneArt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "entryId" TEXT,
    "withdrawnAt" DATETIME,
    CONSTRAINT "OrgasmusAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrgasmusAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgasmusAnforderung_entryId_key" ON "OrgasmusAnforderung"("entryId");

-- CreateIndex
CREATE INDEX "OrgasmusAnforderung_userId_fulfilledAt_withdrawnAt_idx" ON "OrgasmusAnforderung"("userId", "fulfilledAt", "withdrawnAt");
