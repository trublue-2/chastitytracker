-- Stichtag der Vergehens-Meldungen, JE INSTANZ.
--
-- Ab dieser Version werden festgestellte Vergehen dem Träger als Nachricht im Posteingang gemeldet
-- (offenseAnnounce.ts). Die Vergehens-Liste ist eine LIVE-Ableitung: sie kennt auch jedes Vergehen
-- der Vergangenheit. Ohne Stichtag kippte der erste Melde-Lauf nach dem Deploy die gesamte Historie
-- auf einmal in den Posteingang — bei einem langjährigen Nutzer Dutzende Zeilen, alle ungelesen,
-- keine davon neu.
--
-- Warum in der DB und nicht als Konstante im Code: derselbe Grund wie beim Reinigungsfenster-Stichtag
-- (20260714210000). Der Stichtag ist ein Merkmal des DEPLOYS — dasselbe Image läuft auf vielen
-- Instanzen, die es zu verschiedenen Zeitpunkten bekommen.
--
-- INSERT OR IGNORE: eine bereits gesetzte Zeile (bewusst rückdatiert) bleibt unangetastet.
--
-- ISO-8601 MIT 'Z', nicht `datetime('now')`: SQLites Format trägt die Zeitzone nicht, und
-- `new Date(...)` läse eine solche Zeichenkette als ORTSZEIT — auf einem CET-Server läge der
-- Stichtag zwei Stunden zu früh.
INSERT OR IGNORE INTO "AppMeta" ("key", "value", "updatedAt")
VALUES (
  'offenseAnnounceFrom',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  datetime('now')
);
