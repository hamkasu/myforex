-- Migration 0004: add visit tracking columns to User
-- Uses IF NOT EXISTS so it is safe to re-run (idempotent).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "visitCount"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastVisitAt" TIMESTAMP(3);
