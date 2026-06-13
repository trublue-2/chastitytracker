-- Tägliche Reinigungs-Öffnungsfenster als JSON-String (SQLite/Prisma 5 → TEXT).
ALTER TABLE "User" ADD COLUMN "reinigungsFenster" TEXT;
