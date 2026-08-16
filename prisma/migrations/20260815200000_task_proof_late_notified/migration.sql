-- Verspäteter Nachweis: Zeitpunkt der Meldung an die Keyholderin. Nullbar, `null` = „wie bisher" —
-- kein Bestandsnachweis gilt dadurch als gemeldet, kein Urteil ändert sich.
ALTER TABLE "TaskProof" ADD COLUMN "lateNotifiedAt" DATETIME;
