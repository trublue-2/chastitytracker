-- Der NAME des Absenders an der Nachricht.
--
-- `senderKind` kennt nur drei Werte ("system" | "keyholder" | "ai") und kann deshalb nicht sagen, WER
-- geschrieben hat. Für ein VON HAND notiertes Vergehen ist genau das die Auskunft, die fehlt: notiert
-- hat es ein Mensch, und die Meldung darüber trug bis hier "System" als Absender.
--
-- Nullable und ohne Default: `null` heisst „kein persönlicher Autor" — die Zeile trägt dann wie
-- bisher die Bezeichnung ihrer `senderKind`. Die Begründung, warum der Name GESPEICHERT und nicht
-- beim Anzeigen aus dem Bezugsobjekt gelesen wird, steht am Modell (`Message.senderName`).
ALTER TABLE "Message" ADD COLUMN "senderName" TEXT;

-- Nachtrag für die Zeilen, die schon draussen sind.
--
-- Betroffen ist ausschliesslich die FESTSTELLUNGS-Meldung eines notierten Vergehens. Drei
-- Bedingungen grenzen sie ein, und jede trägt:
--
--  * `bodyKey IN (…)` — nur die Feststellung. Die Verwerfungs-Meldung (`offenseDismissedMessage`)
--    liegt auf DERSELBEN Referenz, stammt aber vom URTEILENDEN und nicht vom Notierenden; ihr den
--    Namen des Notierenden anzuhängen wäre eine neue Falschaussage statt der Korrektur einer alten.
--  * `refEntityType = 'detectedOffense'` — der Namensraum des Vergehens. Der Typ `offense` zeigt auf
--    die id des URTEILS und hat mit `ManualOffense` nichts zu tun.
--  * der Join auf `ManualOffense` — abgeleitete Vergehen haben keinen Autor und bleiben unberührt.
--
-- Die Abbildung ist dieselbe wie im Code (`senderFromAuthor` in messageService.ts): das Kürzel 'ai'
-- ist der MCP-Schreiber und bekommt die Art "ai" ohne Namen, jeder andere Wert ist ein
-- BENUTZERNAME und wird zur Keyholder-Zeile mit Namen.
--
-- Und sie hört an derselben Stelle auf: ein Vergehen OHNE brauchbaren Autor bleibt unberührt und
-- damit eine System-Zeile — genau das, was `senderFromAuthor` aus einem leeren Autor macht. Ohne
-- diese Einschränkung liefen Nachtrag und Laufzeit auseinander: der Nachtrag schriebe eine
-- Keyholder-Zeile mit LEEREM Namen, die Laufzeit für dieselbe Ausgangslage eine System-Zeile.
-- Zwei Werte zählen als „kein Autor": der leere Text (Ausweichwert der Route, wenn die Sitzung
-- keinen Namen trägt) und '?' — derselbe Ausweichwert, bevor er auf leer umgestellt wurde. Ein
-- Platzhalter als Absender-Name stünde dem Träger sonst wörtlich als Absender „?" im Posteingang.
--
-- Mehrfach ausführbar ohne Schaden: die Aktualisierung schreibt bei jedem Lauf dasselbe Ergebnis.
UPDATE "Message"
SET
  "senderName" = (
    SELECT CASE WHEN o."createdBy" = 'ai' THEN NULL ELSE o."createdBy" END
    FROM "ManualOffense" o WHERE o."id" = "Message"."refEntityId"
  ),
  "senderKind" = (
    SELECT CASE WHEN o."createdBy" = 'ai' THEN 'ai' ELSE 'keyholder' END
    FROM "ManualOffense" o WHERE o."id" = "Message"."refEntityId"
  )
WHERE "bodyKey" IN ('offenseDetectedMessage', 'offenseDetectedMessageTitled')
  AND "refEntityType" = 'detectedOffense'
  AND "refEntityId" IN (SELECT "id" FROM "ManualOffense" WHERE "createdBy" NOT IN ('', '?'));
