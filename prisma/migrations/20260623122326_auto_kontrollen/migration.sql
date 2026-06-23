-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kommentar" TEXT,
    "deadline" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" DATETIME,
    "withdrawnAt" DATETIME,
    "wirksamAb" DATETIME,
    "benachrichtigtAt" DATETIME,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "entryId" TEXT,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KontrollAnforderung" ("benachrichtigtAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt") SELECT "benachrichtigtAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt" FROM "KontrollAnforderung";
DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reinigungErlaubt" BOOLEAN NOT NULL DEFAULT false,
    "reinigungMaxMinuten" INTEGER NOT NULL DEFAULT 15,
    "reinigungMaxProTag" INTEGER NOT NULL DEFAULT 0,
    "reinigungsFenster" TEXT,
    "autoKontrolleAktiv" BOOLEAN NOT NULL DEFAULT false,
    "autoKontrolleProTag" INTEGER NOT NULL DEFAULT 0,
    "autoKontrolleRuheVon" TEXT NOT NULL DEFAULT '22:00',
    "autoKontrolleRuheBis" TEXT NOT NULL DEFAULT '06:00',
    "autoKontrolleFristVon" INTEGER NOT NULL DEFAULT 15,
    "autoKontrolleFristBis" INTEGER NOT NULL DEFAULT 60,
    "mobileDesktopUpload" BOOLEAN NOT NULL DEFAULT false,
    "mcpKeyholderInstructions" TEXT
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mcpKeyholderInstructions", "mobileDesktopUpload", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "username") SELECT "createdAt", "email", "id", "mcpKeyholderInstructions", "mobileDesktopUpload", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
