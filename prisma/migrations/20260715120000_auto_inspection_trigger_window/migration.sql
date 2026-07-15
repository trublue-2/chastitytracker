-- Optionales festes AUSLÖSE-Fenster für automatische Kontrollen.
-- "" (Default) = aus → Verhalten unverändert (Trigger gleichmässig übers Wach-Fenster).
-- Sind beide gesetzt und Von<Bis, fallen die Auslösungen in dieses Fenster; die Frist läuft danach
-- normal und wird am nächsten Schlaf-Beginn gekappt (nie im Schlaf wecken oder Frist im Schlaf).
ALTER TABLE "User" ADD COLUMN "autoKontrolleFensterVon" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "autoKontrolleFensterBis" TEXT NOT NULL DEFAULT '';
