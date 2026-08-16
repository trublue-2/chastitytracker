-- AlterTable
ALTER TABLE "OrgasmusAnforderung" ADD COLUMN "benachrichtigtAt" DATETIME;
ALTER TABLE "OrgasmusAnforderung" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "OrgasmusAnforderung" ADD COLUMN "wirksamAb" DATETIME;

-- CreateIndex
CREATE INDEX "OrgasmusAnforderung_wirksamAb_idx" ON "OrgasmusAnforderung"("wirksamAb");
