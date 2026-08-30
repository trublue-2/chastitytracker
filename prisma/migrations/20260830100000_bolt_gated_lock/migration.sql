-- Der Riegel entscheidet, nicht der Eintrag (docs/riegel-konzept.md).
--
-- Bei einem Träger, für den die Keyholderin `lockRequiresBolt` einschaltet, ist ein
-- VERSCHLUSS-Eintrag nur noch der AUFRUF zum Schliessen der Box. Wirksam wird er erst, wenn die Box
-- „Riegel zu" meldet — bis dahin steht `boltConfirmedAt` auf NULL und die Zeile ist für jede
-- Ableitung unsichtbar (Verschluss-Zustand, Sessions, Statistik, Strafbuch).
--
-- RÜCKFÜLLUNG, und sie ist der Kern dieser Migration: ohne sie trüge JEDER bestehende Verschluss
-- NULL und die ganze Flotte läse im Moment des Deploys „nicht verschlossen" — mitten in laufenden
-- Sessions. Gefüllt wird mit `startTime`, also mit dem Zeitpunkt, ab dem der Verschluss schon
-- immer galt.
--
-- Der Schalter selbst startet überall AUS: Bestandsverhalten, bis die Keyholderin ihn umlegt.
ALTER TABLE "User" ADD COLUMN "lockRequiresBolt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Entry" ADD COLUMN "boltConfirmedAt" DATETIME;
UPDATE "Entry" SET "boltConfirmedAt" = "startTime" WHERE "type" = 'VERSCHLUSS';

-- Der Index zur Frage „wartet ein Aufruf?". Sie wird oft gestellt — bei jedem Box-Sync, jedem
-- Keyholder-Dashboard, jedem Aufbau des Träger-Dashboards — und ohne ihn liest sie die GESAMTE
-- Verschluss-Historie des Trägers, um in aller Regel nichts zu finden.
CREATE INDEX "Entry_userId_type_boltConfirmedAt_idx" ON "Entry"("userId", "type", "boltConfirmedAt");
