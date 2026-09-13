-- Beginn der Übergangsfrist für den GETEILTEN Anthropic-Schlüssel, JE INSTANZ.
--
-- Portal-Instanzen trugen bis 6.2.4 den Schlüssel des Portal-Betreibers in der `.env`. Ab dem ersten
-- Boot mit dieser Version läuft er noch 30 Tage (`SHARED_KEY_GRACE_DAYS` in `src/lib/vision/config.ts`),
-- danach nicht mehr. Der Beginn steht in der DB und nicht im Code, aus demselben Grund wie beim
-- Stichtag der Reinigungsfenster-Regel: dasselbe Image erreicht die Instanzen zu verschiedenen
-- Zeitpunkten, und niemand soll dafür 27 `.env`-Dateien anfassen müssen.
--
-- INSERT OR IGNORE: eine bereits gesetzte Zeile bleibt unangetastet. ISO-8601 MIT 'Z' — SQLites
-- `datetime('now')` trägt keine Zeitzone und würde in JavaScript als Ortszeit gelesen.
INSERT OR IGNORE INTO "AppMeta" ("key", "value", "updatedAt")
VALUES (
  'photoAnalysisRolloutAt',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  datetime('now')
);
