-- Nachweis-Reihenfolge abschaltbar: müssen die Aufnahmezeiten der geforderten Fotos ihrer
-- Reihenfolge folgen?
--
-- NOT NULL mit `true` als Vorgabe, nicht nullbar: der dritte Zustand hiesse dasselbe wie `true` und
-- wäre nur eine zweite Schreibweise für „wie bisher". Jede Bestandszeile behält damit ihr Urteil.
ALTER TABLE "Task" ADD COLUMN "proofOrderMatters" BOOLEAN NOT NULL DEFAULT true;
