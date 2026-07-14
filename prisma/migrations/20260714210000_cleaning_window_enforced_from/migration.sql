-- Stichtag der Reinigungsfenster-Regel, JE INSTANZ.
--
-- Das Strafbuch ist eine LIVE-Ableitung aus den Einträgen: es rechnet Vergehen bei jedem Aufruf neu
-- aus der Historie aus. Eine neue Regel würde damit rückwirkend Handlungen bestrafen, die zur Zeit
-- der Tat erlaubt waren. Deshalb der Stichtag — Öffnungen davor werden ohne Fenster-Prüfung beurteilt.
--
-- Warum in der DB und nicht als Konstante im Code: der Stichtag ist ein Merkmal des DEPLOYS, nicht
-- des Codes. Dasselbe Image läuft auf 27 Instanzen, die es zu verschiedenen Zeitpunkten bekommen.
-- Ein einkompiliertes Datum stand zwangsläufig auf dem Tag EINER Instanz und hätte allen anderen
-- beim Rollout rückwirkend Vergehen für die Differenz beschert.
--
-- Diese Migration läuft über `prisma migrate deploy` beim ersten Boot jeder Instanz mit dieser
-- Version — also GENAU in dem Moment, in dem diese Instanz die Regel erhält. Das ist der einzige
-- Zeitpunkt, den keine Vorhersage treffen muss.
--
-- INSERT OR IGNORE: eine bereits gesetzte Zeile (z.B. bewusst rückdatiert) bleibt unangetastet,
-- auch wenn die Migration je erneut liefe.
--
-- Der Wert wird als ISO-8601 MIT 'Z' geschrieben, nicht als `datetime('now')`. SQLites Format
-- ("2026-07-14 20:56:31") ist zwar UTC, trägt die Zeitzone aber nicht — und `new Date(...)` liest
-- eine solche Zeichenkette in JavaScript als ORTSZEIT. Auf einem CET-Server läge der Stichtag damit
-- zwei Stunden zu früh, und genau diese zwei Stunden würden rückwirkend bestraft.
INSERT OR IGNORE INTO "AppMeta" ("key", "value", "updatedAt")
VALUES (
  'cleaningWindowEnforcedFrom',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  datetime('now')
);
