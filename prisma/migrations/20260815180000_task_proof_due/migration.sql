-- Nachweis mit eigener Fälligkeit: ein gefordertes Foto bekommt eine EIGENE Frist, statt bis zum
-- Ende der Aufgabe offen zu bleiben. Damit ist „drei Fotos über den Tag verteilt" ausdrückbar.
--
-- Minuten AB DEM NULLPUNKT der Aufgabe (`wirksamAb ?? createdAt`), nicht als absoluter Zeitpunkt:
-- die Zustellung einer terminierten Aufgabe verschiebt den Nullpunkt auf den tatsächlichen
-- Zustell-Zeitpunkt, und ein gespeichertes Datum müsste dort mitgeschoben werden.
--
-- Nullbar, `null` = „wie bisher": jede Bestandszeile behält ihr Urteil unverändert — die Frist eines
-- Nachweises ohne eigenen Wert ist weiterhin das Ende der Aufgabe.
ALTER TABLE "TaskProof" ADD COLUMN "dueOffsetMin" INTEGER;
