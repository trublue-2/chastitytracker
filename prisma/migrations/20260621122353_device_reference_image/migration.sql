-- CreateTable
CREATE TABLE "DeviceReferenceImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sourceEntryId" TEXT,
    "note" TEXT,
    "embedding" BLOB,
    "embeddingModel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceReferenceImage_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DeviceReferenceImage_deviceId_idx" ON "DeviceReferenceImage"("deviceId");
