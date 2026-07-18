-- Auto-Kontrollen nur während einer aktiven Sperrzeit (SPERRZEIT) auslösen.
-- false (Default) = Verhalten unverändert (jede laufende Verriegelung genügt).
-- true = der Poller stellt eine fällige Auto-Kontrolle nur zu, wenn gerade eine Sperrzeit läuft;
-- sonst zieht er sie zurück (kein Nachholen — wie bei einer Auslösung bei offenem KG).
ALTER TABLE "User" ADD COLUMN "autoKontrolleNurBeiSperre" BOOLEAN NOT NULL DEFAULT false;
