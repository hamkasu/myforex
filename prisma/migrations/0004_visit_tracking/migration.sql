-- Migration 0004: add visit tracking columns to User
ALTER TABLE "User"
  ADD COLUMN "visitCount"  INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN "lastVisitAt" TIMESTAMP(3);
