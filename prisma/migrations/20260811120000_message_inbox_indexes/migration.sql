-- DropIndex
DROP INDEX "Message_subjectUserId_audience_createdAt_idx";

-- CreateIndex
CREATE INDEX "Message_subjectUserId_audience_createdAt_id_idx" ON "Message"("subjectUserId", "audience", "createdAt", "id");

-- CreateIndex
CREATE INDEX "MessageRead_userId_messageId_idx" ON "MessageRead"("userId", "messageId");

