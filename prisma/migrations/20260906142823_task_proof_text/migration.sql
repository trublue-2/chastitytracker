-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TaskProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT true,
    "requiresText" BOOLEAN NOT NULL DEFAULT false,
    "requireCode" BOOLEAN NOT NULL DEFAULT false,
    "dueOffsetMin" INTEGER,
    "code" TEXT,
    "proofText" TEXT,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "submittedAt" DATETIME,
    "verifikationStatus" TEXT,
    "verifikationReason" TEXT,
    "verifikationReasonDetected" TEXT,
    "lateNotifiedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewAccepted" BOOLEAN,
    "reviewNote" TEXT,
    CONSTRAINT "TaskProof_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskProof" ("code", "description", "dueOffsetMin", "id", "imageExifTime", "imageUrl", "lateNotifiedAt", "requireCode", "reviewAccepted", "reviewNote", "reviewedAt", "sortOrder", "submittedAt", "taskId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus") SELECT "code", "description", "dueOffsetMin", "id", "imageExifTime", "imageUrl", "lateNotifiedAt", "requireCode", "reviewAccepted", "reviewNote", "reviewedAt", "sortOrder", "submittedAt", "taskId", "verifikationReason", "verifikationReasonDetected", "verifikationStatus" FROM "TaskProof";
DROP TABLE "TaskProof";
ALTER TABLE "new_TaskProof" RENAME TO "TaskProof";
CREATE INDEX "TaskProof_taskId_sortOrder_idx" ON "TaskProof"("taskId", "sortOrder");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
