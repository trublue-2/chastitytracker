-- Dauer-Modus für Aufgaben: Haltezeit ab dem tatsächlichen Anlegen statt bis zu einem festen Ende.
--
-- NULL für jede Bestandszeile — und das ist die ganze Migration: null heisst „klassischer Modus",
-- also genau das Verhalten, das diese Aufgaben schon hatten. Es wird nichts umgerechnet.
ALTER TABLE "Task" ADD COLUMN "holdDurationMin" INTEGER;
