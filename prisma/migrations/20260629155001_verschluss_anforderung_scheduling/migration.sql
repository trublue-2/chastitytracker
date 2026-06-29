-- AlterTable
ALTER TABLE "VerschlussAnforderung" ADD COLUMN "benachrichtigtAt" DATETIME;
ALTER TABLE "VerschlussAnforderung" ADD COLUMN "wirksamAb" DATETIME;

-- CreateIndex
CREATE INDEX "VerschlussAnforderung_wirksamAb_idx" ON "VerschlussAnforderung"("wirksamAb");
