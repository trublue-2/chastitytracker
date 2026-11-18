-- CreateTable
CREATE TABLE "LockmeboxSecret" (
    "boxId" TEXT NOT NULL PRIMARY KEY,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bestand: die Passwörter aller heute gekoppelten LockMeBoxen. Ist dieselbe Box mehreren Trägern
-- gekoppelt (vor BOX_PAIRED_ELSEWHERE möglich), gewinnt die zuletzt benutzte Zeile — sie hat die Box
-- am ehesten zuletzt verschlossen.
INSERT OR IGNORE INTO "LockmeboxSecret" ("boxId", "password", "createdAt")
SELECT "boxId", "lockPassword", CURRENT_TIMESTAMP
FROM "BoxStatus"
WHERE "kind" = 'lockmebox' AND "lockPassword" IS NOT NULL
ORDER BY "updatedAt" DESC;
