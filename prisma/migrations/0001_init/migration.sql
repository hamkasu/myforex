-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "signal" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "score" JSONB NOT NULL,
    "reasons" TEXT[],
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "entry" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL,
    "riskReward" DOUBLE PRECISION NOT NULL,
    "atrValue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "winRate" DOUBLE PRECISION NOT NULL,
    "averageRR" DOUBLE PRECISION NOT NULL,
    "maxDrawdown" DOUBLE PRECISION NOT NULL,
    "profitFactor" DOUBLE PRECISION NOT NULL,
    "totalR" DOUBLE PRECISION NOT NULL,
    "equityCurve" DOUBLE PRECISION[],
    "runAt" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rsiOversold" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "rsiOverbought" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "rsiMomentumLow" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "rsiMomentumHigh" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "ema1Period" INTEGER NOT NULL DEFAULT 20,
    "ema2Period" INTEGER NOT NULL DEFAULT 50,
    "atrMultiplierSL" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "atrMultiplierTP" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "minConfidence" INTEGER NOT NULL DEFAULT 55,
    "trendWeight" INTEGER NOT NULL DEFAULT 2,
    "momentumWeight" INTEGER NOT NULL DEFAULT 2,
    "breakoutWeight" INTEGER NOT NULL DEFAULT 2,
    "patternWeight" INTEGER NOT NULL DEFAULT 1,
    "volatilityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "enableBrowserNotifications" BOOLEAN NOT NULL DEFAULT false,
    "alertMinConfidence" INTEGER NOT NULL DEFAULT 65,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Signal_userId_createdAt_idx" ON "Signal"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BacktestResult_userId_createdAt_idx" ON "BacktestResult"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestResult" ADD CONSTRAINT "BacktestResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
