-- Migration: lower minConfidence default from 55 → 50
-- Reason: scoring maxScore increased from 14 → 16 (S&D zone weight doubled),
-- which deflates all confidence values by ~12%. Lowering the threshold from 55
-- to 50 restores the same effective score cutoff (raw score ≥ 8).
-- Only updates rows where the user still has the old default of 55.
ALTER TABLE "UserSettings" ALTER COLUMN "minConfidence" SET DEFAULT 50;
UPDATE "UserSettings" SET "minConfidence" = 50 WHERE "minConfidence" = 55;
