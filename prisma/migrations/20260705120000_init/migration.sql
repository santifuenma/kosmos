-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxTrades" INTEGER NOT NULL DEFAULT 3,
    "tradingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "tradingHoursEnd" TEXT NOT NULL DEFAULT '11:30',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryCondition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "EntryCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehavioralRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" TEXT NOT NULL,

    CONSTRAINT "BehavioralRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyCondition" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "conditionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StrategyCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRule" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StrategyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyIntention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "maxTrades" INTEGER NOT NULL,
    "tradingHoursStart" TEXT NOT NULL,
    "tradingHoursEnd" TEXT NOT NULL,
    "emotionalState" TEXT NOT NULL,
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyIntention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intentionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "icoScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "asset" TEXT,
    "pnlAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeViolation" (
    "id" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "ruleId" TEXT,
    "conditionId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionViolation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Strategy_userId_key" ON "Strategy"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryCondition_code_key" ON "EntryCondition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BehavioralRule_code_key" ON "BehavioralRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyCondition_strategyId_conditionId_key" ON "StrategyCondition"("strategyId", "conditionId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyRule_strategyId_ruleId_key" ON "StrategyRule"("strategyId", "ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyIntention_userId_date_key" ON "DailyIntention"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Session_intentionId_key" ON "Session"("intentionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionViolation_sessionId_ruleId_key" ON "SessionViolation"("sessionId", "ruleId");

-- AddForeignKey
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyCondition" ADD CONSTRAINT "StrategyCondition_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyCondition" ADD CONSTRAINT "StrategyCondition_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "EntryCondition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRule" ADD CONSTRAINT "StrategyRule_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "Strategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRule" ADD CONSTRAINT "StrategyRule_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BehavioralRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyIntention" ADD CONSTRAINT "DailyIntention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_intentionId_fkey" FOREIGN KEY ("intentionId") REFERENCES "DailyIntention"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeViolation" ADD CONSTRAINT "TradeViolation_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeViolation" ADD CONSTRAINT "TradeViolation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BehavioralRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeViolation" ADD CONSTRAINT "TradeViolation_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "EntryCondition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionViolation" ADD CONSTRAINT "SessionViolation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionViolation" ADD CONSTRAINT "SessionViolation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BehavioralRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

