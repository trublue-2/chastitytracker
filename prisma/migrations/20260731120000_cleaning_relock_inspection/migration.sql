-- Kontrolle nach einem Wiederverschluss, der eine Reinigungspause beendet.
--
-- cleaningRelock = HERKUNFT der Auto-Zeile: dieses Ereignis statt der gewürfelte Tagesplan. Daran
-- hängen drei Regeln (siehe scheduleCleaningRelockInspection): sie zählt nicht als Tagesplan, die
-- Neuplanung fasst sie nicht an, und die Einstellung "nur während Sperrzeit" gilt für sie nicht.
-- Ob eine solche Kontrolle die Eskalationsstufe 2 auslösen darf, wird NICHT hier gespeichert,
-- sondern beim Eskalieren aus dem Schlaf-Fenster der Sub abgeleitet.
--
-- false (Default) = Verhalten unverändert für alle bestehenden Zeilen.
ALTER TABLE "KontrollAnforderung" ADD COLUMN "cleaningRelock" BOOLEAN NOT NULL DEFAULT false;
