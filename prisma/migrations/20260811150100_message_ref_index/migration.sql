-- Index für den Abgleich "welche Vergehen wurden diesem Träger schon gemeldet?".
--
-- Die Abfrage lautet `WHERE subjectUserId = ? AND refEntityType = 'detectedOffense'`. Der bestehende
-- Index (subjectUserId, audience, createdAt, id) hat `audience` an zweiter Stelle und kann sie nicht
-- bedienen. Ohne diesen Index scannt jeder Melde-Lauf alle Nachrichten des Trägers — und der Lauf läuft
-- im Minuten-Poller über alle Träger.
CREATE INDEX IF NOT EXISTS "Message_subjectUserId_refEntityType_refEntityId_idx"
  ON "Message"("subjectUserId", "refEntityType", "refEntityId");
