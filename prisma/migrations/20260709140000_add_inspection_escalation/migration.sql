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
    "codeImageUrl" TEXT,
    "codeReadable" BOOLEAN,
    "note" TEXT,
    "oeffnenGrund" TEXT,
    "orgasmusArt" TEXT,
    "kontrollCode" TEXT,
    "verifikationStatus" TEXT,
    "verifikationReason" TEXT,
    "verifikationReasonDetected" TEXT,
    "deviceCheck" TEXT,
    "deviceCheckNote" TEXT,
    "deviceCheckExpected" TEXT,
    "deviceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'user',
    CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Entry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Entry" ("codeImageUrl", "codeReadable", "createdAt", "deviceCheck", "deviceCheckExpected", "deviceCheckNote", "deviceId", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "startTime", "type", "userId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus") SELECT "codeImageUrl", "codeReadable", "createdAt", "deviceCheck", "deviceCheckExpected", "deviceCheckNote", "deviceId", "id", "imageExifTime", "imageUrl", "kontrollCode", "note", "oeffnenGrund", "orgasmusArt", "startTime", "type", "userId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus" FROM "Entry";
DROP TABLE "Entry";
ALTER TABLE "new_Entry" RENAME TO "Entry";
CREATE INDEX "Entry_userId_idx" ON "Entry"("userId");
CREATE INDEX "Entry_userId_type_startTime_idx" ON "Entry"("userId", "type", "startTime" DESC);
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
    "benachrichtigtReminderAt" DATETIME,
    "autoMarkedRemovedAt" DATETIME,
    "autoMarkedEntryId" TEXT,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_autoMarkedEntryId_fkey" FOREIGN KEY ("autoMarkedEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KontrollAnforderung" ("auto", "benachrichtigtAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt") SELECT "auto", "benachrichtigtAt", "code", "createdAt", "deadline", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt" FROM "KontrollAnforderung";
DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
CREATE UNIQUE INDEX "KontrollAnforderung_autoMarkedEntryId_key" ON "KontrollAnforderung"("autoMarkedEntryId");
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
CREATE INDEX "KontrollAnforderung_userId_autoMarkedRemovedAt_idx" ON "KontrollAnforderung"("userId", "autoMarkedRemovedAt");
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
    "autoKontrollePerDayMin" INTEGER NOT NULL DEFAULT 0,
    "autoKontrollePerDayMax" INTEGER NOT NULL DEFAULT 0,
    "autoKontrolleRuheVon" TEXT NOT NULL DEFAULT '22:00',
    "autoKontrolleRuheBis" TEXT NOT NULL DEFAULT '06:00',
    "autoKontrolleFristVon" INTEGER NOT NULL DEFAULT 15,
    "autoKontrolleFristBis" INTEGER NOT NULL DEFAULT 60,
    "inspectionReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inspectionReminderDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "inspectionAutoMarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inspectionAutoMarkDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "mobileDesktopUpload" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Zurich',
    "startPage" TEXT NOT NULL DEFAULT 'auto',
    "hideOwnTracker" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "orgasmusArtenConfig" TEXT,
    "oeffnenGruendeConfig" TEXT,
    "mcpKeyholderInstructions" TEXT
);
INSERT INTO "new_User" ("autoKontrolleAktiv", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "email", "hideOwnTracker", "id", "locale", "mcpKeyholderInstructions", "mobileDesktopUpload", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "timezone", "username") SELECT "autoKontrolleAktiv", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "email", "hideOwnTracker", "id", "locale", "mcpKeyholderInstructions", "mobileDesktopUpload", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "timezone", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

