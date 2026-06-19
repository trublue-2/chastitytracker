-- Bildersafe: versiegeltes Schlüsselbox-Code-Foto am Entry (Schlüssel-Verwahrung)
ALTER TABLE "Entry" ADD COLUMN "codeImageUrl" TEXT;
ALTER TABLE "Entry" ADD COLUMN "codeReadable" BOOLEAN;
