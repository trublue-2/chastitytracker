-- Die eingebaute Kategorie heisst nicht mehr wie die Abkürzung, die daneben steht: "KG" wird
-- "Chastity Device". Warum ausgerechnet dieser Wert, steht in `docs/design/begriffe.md` — hier
-- steht, warum die WHERE-Klausel so eng ist.
--
-- DREI Bedingungen, und alle drei sind nötig:
--
--   isBuiltIn = 1   nur die eingebaute Kategorie, nie eine selbst angelegte
--   slug = 'kg'     doppelt gesichert; `isBuiltIn` ist ein Flag, der Slug ist die Identität
--   name = 'KG'     NUR der unveränderte Vorgabewert
--
-- Die dritte ist die wichtigste. Diese Migration läuft über den Bestand von Instanzen, die nicht
-- dem Autor gehören, und `name` ist ein vom Nutzer editierbares Feld. Wer seine Kategorie längst
-- "Käfig" oder "Mein Gürtel" genannt hat, hat eine Entscheidung getroffen — die zu überschreiben
-- wäre schlimmer als der Zustand, den diese Migration behebt. Damit ist sie zugleich idempotent:
-- ein zweiter Lauf findet nichts mehr vor.
--
-- Die Vorgabe für NEU angelegte Kategorien steht in `src/lib/deviceCategories.ts`
-- (`KG_BUILTIN_NAME`) und in `scripts/seed.js`; `appName.test.ts` hält alle drei zusammen.

UPDATE "DeviceCategory"
SET "name" = 'Chastity Device'
WHERE "isBuiltIn" = 1
  AND "slug" = 'kg'
  AND "name" = 'KG';
