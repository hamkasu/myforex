-- Migration 0003: add Stripe subscription fields to User
-- Uses IF NOT EXISTS so it is safe to re-run (idempotent).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId"   TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionId"     TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "currentPeriodEnd"   TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_subscriptionId_key"   ON "User"("subscriptionId");
