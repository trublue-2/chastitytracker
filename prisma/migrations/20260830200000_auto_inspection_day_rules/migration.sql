-- Tagesspezifische Kontroll-Fenster (docs/tagesfenster-konzept.md).
--
-- `autoKontrolleDays`: an welchen Wochentagen überhaupt geplant wird, als Bitmaske (Mo = Bit 0).
-- Die Vorgabe 127 = alle sieben ist die EINZIGE, die den Bestand unverändert lässt: jede Instanz
-- plant heute an jedem Tag, und ein Default von 0 hätte der ganzen Flotte beim Deploy still die
-- automatischen Kontrollen abgestellt.
ALTER TABLE "User" ADD COLUMN "autoKontrolleDays" INTEGER NOT NULL DEFAULT 127;

-- `autoKontrolleDayRules`: die Tages-Ausnahmen als JSON-Liste, NULL = keine. Ohne Zeile gilt der
-- Grundstand aus den bestehenden vier Spalten — der Bestand braucht also keine Rückfüllung.
ALTER TABLE "User" ADD COLUMN "autoKontrolleDayRules" TEXT;
