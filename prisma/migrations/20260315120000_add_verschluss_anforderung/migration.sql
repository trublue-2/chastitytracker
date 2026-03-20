-- CreateTable
CREATE TABLE "VerschlussAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "nachricht" TEXT,
    "endetAt" DATETIME,
    "dauerH" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "withdrawnAt" DATETIME,
    CONSTRAINT "VerschlussAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
