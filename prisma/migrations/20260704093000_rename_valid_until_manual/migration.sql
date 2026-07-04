-- Rename TrainingVorgabe.gueltigBisManuell -> validUntilManual (Internationalisierung neuer Felder).
-- RENAME COLUMN erhält bestehende Werte (kein Drop/Add), SQLite ≥ 3.25.
ALTER TABLE "TrainingVorgabe" RENAME COLUMN "gueltigBisManuell" TO "validUntilManual";
