-- Der Ingest-Endpunkt für gemeldete Wiegungen ist wieder entfernt (docs/gewicht-health-verworfen.md).
-- Zeilen, die über ihn hereinkamen, tragen eine Quelle, die der Code nicht mehr kennt — angezeigt
-- würden sie sonst als „über die KI-Keyholderin eingetragen", was sie nie waren. Sie werden dem
-- Träger zugeschrieben: getippt hat sie er, nur eben über einen anderen Weg.
UPDATE "WeightEntry" SET "source" = 'user' WHERE "source" IN ('health', 'external');
