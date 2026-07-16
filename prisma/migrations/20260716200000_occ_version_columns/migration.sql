-- Optimistic-Concurrency-Token für MCP-V2-Edits: wird bei jedem Edit inkrementiert;
-- Writes mit expectedVersion werden bei Abweichung abgelehnt statt still zu überschreiben.
-- AlterTable
ALTER TABLE "KeyholderNote" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "RecurringContext" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
