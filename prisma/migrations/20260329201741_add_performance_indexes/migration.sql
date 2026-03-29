-- CreateIndex
CREATE INDEX "KontrollAnforderung_userId_withdrawnAt_idx" ON "KontrollAnforderung"("userId", "withdrawnAt");

-- CreateIndex
CREATE INDEX "KontrollAnforderung_userId_entryId_idx" ON "KontrollAnforderung"("userId", "entryId");

-- CreateIndex
CREATE INDEX "TrainingVorgabe_userId_idx" ON "TrainingVorgabe"("userId");

-- CreateIndex
CREATE INDEX "VerschlussAnforderung_userId_art_withdrawnAt_idx" ON "VerschlussAnforderung"("userId", "art", "withdrawnAt");
