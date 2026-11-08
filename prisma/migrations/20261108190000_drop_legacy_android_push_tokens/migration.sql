-- Android-Push-Tokens aus der Legacy-FCM-Zeit (bis 2834aaff). Seit deren Abschaltung nahm die
-- Registrierung keine Android-Tokens mehr an; jede vorhandene Zeile stammt also aus dem alten
-- Firebase-Projekt und ist mit FCM HTTP v1 nicht mehr zustellbar. Der Versand löscht sie bewusst
-- NICHT selbst (SENDER_ID_MISMATCH ist auch ein Konfigurations-Fehler) — deshalb einmalig hier.
DELETE FROM "NativePushToken" WHERE "platform" = 'android';
