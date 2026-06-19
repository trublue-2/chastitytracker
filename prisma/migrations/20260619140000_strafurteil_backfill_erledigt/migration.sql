-- Backfill: bereits bestrafte Alt-Datensätze (vor dem Urteilsloop, judgedBy IS NULL) galten als
-- abgeschlossen. Im neuen Modell ist PUNISHED+erledigtAt=null eine OFFENE Strafe — daher auf
-- erledigt setzen (erledigtAt = Datum der Strafe). Neue Loop-Urteile (judgedBy gesetzt) bleiben offen.
UPDATE "StrafeRecord"
SET "erledigtAt" = "bestraftDatum"
WHERE "status" = 'PUNISHED' AND "erledigtAt" IS NULL AND "judgedBy" IS NULL;
