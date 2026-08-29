-- Schutz gegen die Dublette, die ein Zeitlimit erzeugt.
--
-- Seit der Client seine Anfragen nach acht Sekunden abbricht, gibt es einen Fall, den es vorher nur
-- selten gab: der Server hat den Eintrag bereits geschrieben, die Antwort reisst die Frist, und die
-- Offline-Warteschlange schickt denselben Rumpf später ein zweites Mal. Ohne Stempel entstünde
-- dabei eine zweite Öffnung — und die verfälscht Tragezeit und Strafbuch, ohne dass es jemandem
-- auffällt.
--
-- Der Client erzeugt den Stempel EINMAL beim Bauen der Anfrage (`entryRequest`). Die Warteschlange
-- speichert den fertigen Rumpf, trägt ihn also unverändert mit; erst dadurch ist der zweite Versuch
-- als derselbe erkennbar.
--
-- Eindeutig JE NUTZER, nicht global: ein globaler Index zwänge die Route, den Treffer eines fremden
-- Nutzers als eigenen Fehlerfall zu behandeln — mit Code, Übersetzung und einem 409-Zweig, für eine
-- UUID-Kollision. Zusammengesetzt steckt die Sichtbarkeitsregel im Index.
--
-- NULLBAR: SQLite lässt beliebig viele NULL in einem UNIQUE-Index stehen. Einträge ohne Stempel —
-- Keyholder-Pfad, MCP, Bearbeitungen, der gesamte Altbestand — bleiben unberührt.
ALTER TABLE "Entry" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "Entry_userId_clientRequestId_key" ON "Entry"("userId", "clientRequestId");
