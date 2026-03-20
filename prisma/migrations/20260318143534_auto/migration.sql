/*
  Warnings:

  - Made the column `userId` on table `Entry` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Entry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'VERSCHLUSS',
    "startTime" DATETIME NOT NULL,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "note" TEXT,
    "orgasmusArt" TEXT,
    "kontrollCode" TEXT,
    "aiVerified" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("aiVerified", "createdAt", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "orgasmusArt", "startTime", "type", "userId") SELECT "aiVerified", "createdAt", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "orgasmusArt", "startTime", "type", "userId" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
