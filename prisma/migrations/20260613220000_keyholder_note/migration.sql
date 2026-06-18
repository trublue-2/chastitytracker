-- CreateTable
CREATE TABLE "KeyholderNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kg" TEXT,
    "kategorie" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyholderNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KeyholderNote_userId_createdAt_idx" ON "KeyholderNote"("userId", "createdAt");
