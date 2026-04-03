-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reinigungErlaubt" BOOLEAN NOT NULL DEFAULT false,
    "reinigungMaxMinuten" INTEGER NOT NULL DEFAULT 15,
    "mobileDesktopUpload" BOOLEAN NOT NULL DEFAULT false,
    "notifyVerschluss" BOOLEAN NOT NULL DEFAULT false,
    "notifyOeffnungImmer" BOOLEAN NOT NULL DEFAULT false,
    "notifyOeffnungVerboten" BOOLEAN NOT NULL DEFAULT false,
    "notifyOrgasmus" BOOLEAN NOT NULL DEFAULT false,
    "notifyKontrolleFreiwillig" BOOLEAN NOT NULL DEFAULT false,
    "notifyKontrolleAngefordert" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("createdAt", "email", "id", "mobileDesktopUpload", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "role", "username") SELECT "createdAt", "email", "id", "mobileDesktopUpload", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
