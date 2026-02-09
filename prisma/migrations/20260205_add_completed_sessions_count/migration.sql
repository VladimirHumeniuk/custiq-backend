-- Add completedSessionsCount column with default 0 if it doesn't already exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "completedSessionsCount" INTEGER NOT NULL DEFAULT 0;
