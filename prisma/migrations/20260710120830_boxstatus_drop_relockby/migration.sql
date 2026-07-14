-- pendingCommandRelockBy war die Re-Lock-Frist des Kommandos "clean_open". Beides entfällt: die Box
-- kennt weder Reinigung noch Frist. Sie öffnet auf "open" und bleibt offen, bis ein "lock" kommt;
-- wann wiederverschlossen sein muss, entscheidet allein der Tracker (Strafbuch).
--
-- Kein Datenverlust: die Spalte wurde nur von "clean_open" gefüllt, das seit Stage 0 nie gesendet
-- wurde. Sie ist überall NULL.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BoxStatus" (
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
    "pendingCommandAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoxStatus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BoxStatus" ("battery", "boltPos", "boxId", "charging", "fwVersion", "id", "keyholderLocked", "lastSyncAt", "lockUntil", "locked", "name", "pendingCommand", "pendingCommandAt", "simpleLock", "updatedAt", "userId") SELECT "battery", "boltPos", "boxId", "charging", "fwVersion", "id", "keyholderLocked", "lastSyncAt", "lockUntil", "locked", "name", "pendingCommand", "pendingCommandAt", "simpleLock", "updatedAt", "userId" FROM "BoxStatus";
DROP TABLE "BoxStatus";
ALTER TABLE "new_BoxStatus" RENAME TO "BoxStatus";
CREATE INDEX "BoxStatus_userId_idx" ON "BoxStatus"("userId");
CREATE UNIQUE INDEX "BoxStatus_userId_boxId_key" ON "BoxStatus"("userId", "boxId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
