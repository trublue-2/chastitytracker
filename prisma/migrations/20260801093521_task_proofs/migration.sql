-- CreateTable
CREATE TABLE "TaskProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "requireCode" BOOLEAN NOT NULL DEFAULT false,
    "code" TEXT,
    "imageUrl" TEXT,
    "imageExifTime" DATETIME,
    "submittedAt" DATETIME,
    "verifikationStatus" TEXT,
    "verifikationReason" TEXT,
    "verifikationReasonDetected" TEXT,
    "reviewedAt" DATETIME,
    "reviewAccepted" BOOLEAN,
    "reviewNote" TEXT,
    CONSTRAINT "TaskProof_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TaskProof_taskId_sortOrder_idx" ON "TaskProof"("taskId", "sortOrder");
