-- Migration: add Stripe subscription fields to User
ALTER TABLE "User"
  ADD COLUMN "stripeCustomerId"   TEXT,
  ADD COLUMN "subscriptionId"     TEXT,
  ADD COLUMN "subscriptionStatus" TEXT,
  ADD COLUMN "currentPeriodEnd"   TIMESTAMP(3);

CREATE UNIQUE INDEX "User_stripeCustomerId_key"  ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "User_subscriptionId_key"    ON "User"("subscriptionId");
