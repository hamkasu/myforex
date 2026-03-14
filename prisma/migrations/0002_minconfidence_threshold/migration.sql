-- Migration 0002: lower minConfidence default from 55 → 50
-- Idempotent — safe to re-run.
ALTER TABLE "UserSettings" ALTER COLUMN "minConfidence" SET DEFAULT 50;
UPDATE "UserSettings" SET "minConfidence" = 50 WHERE "minConfidence" = 55;
