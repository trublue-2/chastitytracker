-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "measuredAt" DATETIME NOT NULL,
    "dayKey" TEXT NOT NULL,
    "weightKg" REAL NOT NULL,
    "inWindow" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "imagePrunedAt" DATETIME,
    "detectedKg" REAL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'user',
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeightChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HeightChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "autoInspectionPlannedFor" DATETIME,
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
    "mcpKeyholderInstructions" TEXT,
    "weightTrackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "heightCm" INTEGER,
    "referenceSex" TEXT,
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "targetMinKg" REAL,
    "targetMaxKg" REAL,
    "targetMinKeyholderKg" REAL,
    "targetMaxKeyholderKg" REAL,
    "weighingWindows" TEXT
);
INSERT INTO "new_User" ("autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "mcpKeyholderInstructions", "mobileDesktopUpload", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "timezone", "username") SELECT "autoInspectionPlannedFor", "autoKontrolleAktiv", "autoKontrolleFensterBis", "autoKontrolleFensterVon", "autoKontrolleFristBis", "autoKontrolleFristVon", "autoKontrolleNurBeiSperre", "autoKontrollePerDayMax", "autoKontrollePerDayMin", "autoKontrolleRuheBis", "autoKontrolleRuheVon", "createdAt", "dashboardLayout", "email", "hideOwnTracker", "id", "inspectionAutoMarkDelayMinutes", "inspectionAutoMarkEnabled", "inspectionReminderDelayMinutes", "inspectionReminderEnabled", "locale", "mcpKeyholderInstructions", "mobileDesktopUpload", "oeffnenGruendeConfig", "orgasmusArtenConfig", "passwordHash", "reinigungErlaubt", "reinigungMaxMinuten", "reinigungMaxProTag", "reinigungsFenster", "role", "startPage", "timezone", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WeightEntry_userId_measuredAt_idx" ON "WeightEntry"("userId", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_userId_dayKey_key" ON "WeightEntry"("userId", "dayKey");

-- CreateIndex
CREATE INDEX "HeightChange_userId_effectiveFrom_idx" ON "HeightChange"("userId", "effectiveFrom");
