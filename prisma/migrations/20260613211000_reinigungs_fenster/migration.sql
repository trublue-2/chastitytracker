-- Tägliche Reinigungs-Öffnungsfenster (JSON-Array von {start,end} in CH-Lokalzeit).
ALTER TABLE "User" ADD COLUMN "reinigungsFenster" JSONB;
