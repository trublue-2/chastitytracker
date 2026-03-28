-- CreateTable
CREATE TABLE "AdminUserRelationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AdminUserRelationship_adminId_idx" ON "AdminUserRelationship"("adminId");

-- CreateIndex
CREATE INDEX "AdminUserRelationship_userId_idx" ON "AdminUserRelationship"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUserRelationship_adminId_userId_key" ON "AdminUserRelationship"("adminId", "userId");
