-- LockMeBox: eine Öffnung gilt erst mit „Riegel offen" (docs/lockmebox.md).
ALTER TABLE "Entry" ADD COLUMN "openAwaitsBolt" BOOLEAN NOT NULL DEFAULT false;

-- Die wartende Öffnung wird je Träger gesucht (Anlegen, Vollzug, Anzeige).
CREATE INDEX "Entry_userId_type_openAwaitsBolt_idx" ON "Entry"("userId", "type", "openAwaitsBolt");
