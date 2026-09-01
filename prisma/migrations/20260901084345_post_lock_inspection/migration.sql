-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_KontrollAnforderung" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT,
    "categoryId" TEXT,
    "deviceId" TEXT,
    "kommentar" TEXT,
    "createdBy" TEXT,
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
    "cleaningRelock" BOOLEAN NOT NULL DEFAULT false,
    "postLock" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KontrollAnforderung_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DeviceCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KontrollAnforderung_autoMarkedEntryId_fkey" FOREIGN KEY ("autoMarkedEntryId") REFERENCES "Entry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KontrollAnforderung" ("auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "categoryId", "cleaningRelock", "code", "createdAt", "createdBy", "deadline", "deviceId", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt") SELECT "auto", "autoMarkedEntryId", "autoMarkedRemovedAt", "benachrichtigtAt", "benachrichtigtReminderAt", "categoryId", "cleaningRelock", "code", "createdAt", "createdBy", "deadline", "deviceId", "entryId", "fulfilledAt", "id", "kommentar", "userId", "wirksamAb", "withdrawnAt" FROM "KontrollAnforderung";
DROP TABLE "KontrollAnforderung";
ALTER TABLE "new_KontrollAnforderung" RENAME TO "KontrollAnforderung";
CREATE UNIQUE INDEX "KontrollAnforderung_entryId_key" ON "KontrollAnforderung"("entryId");
CREATE UNIQUE INDEX "KontrollAnforderung_autoMarkedEntryId_key" ON "KontrollAnforderung"("autoMarkedEntryId");
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
CREATE INDEX "KontrollAnforderung_userId_autoMarkedRemovedAt_idx" ON "KontrollAnforderung"("userId", "autoMarkedRemovedAt");
CREATE INDEX "KontrollAnforderung_userId_categoryId_idx" ON "KontrollAnforderung"("userId", "categoryId");
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
    "autoKontrolleFensterVon" TEXT NOT NULL DEFAULT '',
    "autoKontrolleFensterBis" TEXT NOT NULL DEFAULT '',
    "autoKontrolleNurBeiSperre" BOOLEAN NOT NULL DEFAULT false,
    "autoKontrolleDays" INTEGER NOT NULL DEFAULT 127,
    "autoKontrolleDayRules" TEXT,
    "autoInspectionPlannedFor" DATETIME,
    "postLockInspectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "postLockInspectionDelayMin" INTEGER NOT NULL DEFAULT 15,
    "postLockInspectionDelayMax" INTEGER NOT NULL DEFAULT 45,
    "postLockInspectionDeadlineMinutes" INTEGER NOT NULL DEFAULT 15,
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
    "dashboardLayout" TEXT,
    "noticeSeenVersion" TEXT,
    "mcpKeyholderInstructions" TEXT,
    "weightTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "heightCm" INTEGER,
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "targetWeightKg" REAL,
    "targetWeightSetAt" DATETIME,
    "targetWeightKeyholderKg" REAL,
    "targetWeightKeyholderSetAt" DATETIME,
    "weighingWindows" TEXT,
    "weightReminderMark" TEXT,
    "lockRequiresBolt" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleDayRules", "autoKontrolleDays", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "heightCm", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "lockRequiresBolt", "mcpKeyholderInstructions", "mobileDesktopUpload", "noticeSeenVersion", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "targetWeightKeyholderKg", "targetWeightKeyholderSetAt", "targetWeightKg", "targetWeightSetAt", "timezone", "unitSystem", "username", "weighingWindows", "weightReminderMark", "weightTrackingEnabled") SELECT "autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleDayRules", "autoKontrolleDays", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "heightCm", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "lockRequiresBolt", "mcpKeyholderInstructions", "mobileDesktopUpload", "noticeSeenVersion", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "targetWeightKeyholderKg", "targetWeightKeyholderSetAt", "targetWeightKg", "targetWeightSetAt", "timezone", "unitSystem", "username", "weighingWindows", "weightReminderMark", "weightTrackingEnabled" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
