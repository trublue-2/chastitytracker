-- Besitz hochgeladener Dateien (src/lib/uploadOwnership.ts). Kein Backfill: Bestandsdateien bleiben über
-- die Zeile erreichbar, die auf sie verweist (Eintrag, Gerät, Nachweis …) — die neue Tabelle braucht es
-- nur für Dateien, die hochgeladen, aber noch nirgends verknüpft sind.
CREATE TABLE "Upload" (
    "filename" TEXT NOT NULL PRIMARY KEY,
    "uploaderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Upload_uploaderId_idx" ON "Upload"("uploaderId");
