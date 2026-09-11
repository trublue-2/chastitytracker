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
    "postLockInspectionRequireBoxPhoto" BOOLEAN NOT NULL DEFAULT false,
    "inspectionReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inspectionReminderDelayMinutes" INTEGER NOT NULL DEFAULT 5,
    "inspectionAutoMarkEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inspectionAutoMarkDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "mobileDesktopUpload" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Zurich',
    "startPage" TEXT NOT NULL DEFAULT 'auto',
    "notifyMail" TEXT NOT NULL DEFAULT 'all',
    "notifyPush" TEXT NOT NULL DEFAULT 'all',
    "notifyTelegram" TEXT NOT NULL DEFAULT 'all',
    "hideOwnTracker" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'de',
    "telegramChatId" TEXT,
    "orgasmusArtenConfig" TEXT,
    "oeffnenGruendeConfig" TEXT,
    "dashboardLayout" TEXT,
    "quickSettings" TEXT,
    "noticeSeenVersion" TEXT,
    "mcpKeyholderInstructions" TEXT,
    "offenseStatementsAllowed" BOOLEAN NOT NULL DEFAULT true,
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
INSERT INTO "new_User" ("autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleDayRules", "autoKontrolleDays", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "heightCm", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "lockRequiresBolt", "mcpKeyholderInstructions", "mobileDesktopUpload", "noticeSeenVersion", "oeffnenGruendeConfig", "offenseStatementsAllowed", "orgasmusArtenConfig", "passwordHash", "postLockInspectionDeadlineMinutes", "postLockInspectionDelayMax", "postLockInspectionDelayMin", "postLockInspectionEnabled", "postLockInspectionRequireBoxPhoto", "quickSettings", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "targetWeightKeyholderKg", "targetWeightKeyholderSetAt", "targetWeightKg", "targetWeightSetAt", "telegramChatId", "timezone", "unitSystem", "username", "weighingWindows", "weightReminderMark", "weightTrackingEnabled") SELECT "autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleDayRules", "autoKontrolleDays", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "heightCm", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "lockRequiresBolt", "mcpKeyholderInstructions", "mobileDesktopUpload", "noticeSeenVersion", "oeffnenGruendeConfig", "offenseStatementsAllowed", "orgasmusArtenConfig", "passwordHash", "postLockInspectionDeadlineMinutes", "postLockInspectionDelayMax", "postLockInspectionDelayMin", "postLockInspectionEnabled", "postLockInspectionRequireBoxPhoto", "quickSettings", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "targetWeightKeyholderKg", "targetWeightKeyholderSetAt", "targetWeightKg", "targetWeightSetAt", "telegramChatId", "timezone", "unitSystem", "username", "weighingWindows", "weightReminderMark", "weightTrackingEnabled" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
