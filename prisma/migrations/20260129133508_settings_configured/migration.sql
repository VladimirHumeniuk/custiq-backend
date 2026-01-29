-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedTopics" TEXT[],
ADD COLUMN     "interviewLanguage" TEXT NOT NULL DEFAULT 'English',
ADD COLUMN     "primaryCustomerType" TEXT,
ADD COLUMN     "settingsConfigured" BOOLEAN NOT NULL DEFAULT false;
