-- AlterTable: Entry.kontrollCode
ALTER TABLE "Entry" ADD COLUMN "kontrollCode" TEXT;

-- CreateTable: KontrollAnforderung
CREATE TABLE "KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "deadline" DATETIME NOT NULL,
    "fulfilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
