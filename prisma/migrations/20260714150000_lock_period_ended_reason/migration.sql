-- Warum eine Sperrzeit endete. Ohne dieses Feld sah eine vom Sub aufgebrochene Sperrzeit exakt aus
-- wie eine bewusst zurückgezogene — und wie eine, die es nie gab: die Konsequenz verschwand spurlos.
--   "keyholder" = bewusst zurückgezogen | "opening" = durch eine Öffnung beendet
--   "obsolete"  = vom Poller verworfen (bei Auslösung schon gegenstandslos)
-- Werte-Quelle: LOCK_ENDED_REASON in src/lib/constants.ts
-- NULL = noch aktiv oder Altbestand (Endart nicht mehr rekonstruierbar).
ALTER TABLE "VerschlussAnforderung" ADD COLUMN "endedReason" TEXT;
