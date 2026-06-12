-- AlterTable: allow opening to perform the directed orgasm without breaking the lock / penalty
ALTER TABLE "OrgasmusAnforderung" ADD COLUMN "oeffnenErlaubt" BOOLEAN NOT NULL DEFAULT false;
