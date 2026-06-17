-- CreateIndex
CREATE UNIQUE INDEX "SessionViolation_sessionId_ruleId_key" ON "SessionViolation"("sessionId", "ruleId");
