-- StrafeRecord → Urteil: Status, Freitext (Strafe/Grund), Audit + Erledigt-Status
ALTER TABLE "StrafeRecord" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUNISHED';
ALTER TABLE "StrafeRecord" ADD COLUMN "reason" TEXT;
ALTER TABLE "StrafeRecord" ADD COLUMN "judgedBy" TEXT;
ALTER TABLE "StrafeRecord" ADD COLUMN "erledigtAt" DATETIME;
