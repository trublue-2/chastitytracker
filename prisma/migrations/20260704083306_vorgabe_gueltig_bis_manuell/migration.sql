-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TrainingVorgabe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "gueltigAb" DATETIME NOT NULL,
    "gueltigBis" DATETIME,
    "gueltigBisManuell" BOOLEAN NOT NULL DEFAULT false,
    "minProTagH" REAL,
    "minProWocheH" REAL,
    "minProMonatH" REAL,
    "notiz" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingVorgabe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TrainingVorgabe_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TrainingVorgabe" ("categoryId", "createdAt", "gueltigAb", "gueltigBis", "id", "minProMonatH", "minProTagH", "minProWocheH", "notiz", "userId") SELECT "categoryId", "createdAt", "gueltigAb", "gueltigBis", "id", "minProMonatH", "minProTagH", "minProWocheH", "notiz", "userId" FROM "TrainingVorgabe";
DROP TABLE "TrainingVorgabe";
ALTER TABLE "new_TrainingVorgabe" RENAME TO "TrainingVorgabe";
CREATE INDEX "TrainingVorgabe_userId_idx" ON "TrainingVorgabe"("userId");
CREATE INDEX "TrainingVorgabe_categoryId_idx" ON "TrainingVorgabe"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
