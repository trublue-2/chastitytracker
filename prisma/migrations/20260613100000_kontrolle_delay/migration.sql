-- Zeitversetzte Kontroll-Anforderung: geplante Auslösung + Benachrichtigungs-Marker.
ALTER TABLE "KontrollAnforderung" ADD COLUMN "wirksamAb" DATETIME;
ALTER TABLE "KontrollAnforderung" ADD COLUMN "benachrichtigtAt" DATETIME;

-- CreateIndex (Poller findet fällige Anforderungen)
CREATE INDEX "KontrollAnforderung_wirksamAb_idx" ON "KontrollAnforderung"("wirksamAb");
